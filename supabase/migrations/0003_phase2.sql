-- Dining Decision App — Phase 2 schema
-- Adds: push notification tokens, "Decide Now" sessions, and per-restaurant
-- binary votes. Builds on 0001/0002 (do not edit those). Run via `supabase db push`.
--
-- Data model note: although the app surfaces voting as a Tinder-style swipe,
-- the underlying vote is a plain boolean per (session, restaurant, user),
-- aggregated as simple counts. There is no personal ranked list and no ranking
-- algorithm — deliberate, per the PRD (manual ranking is an unvalidated open
-- question, deprioritized for v1).

-- ---------------------------------------------------------------------------
-- push_tokens: Expo push tokens, one row per (user, device token).
-- Populated by the app via expo-notifications after permission is granted,
-- upserted on app start (native only — push tokens are not a web concept).
-- The edge function that sends pushes uses the SERVICE ROLE key, which bypasses
-- RLS entirely, so no select policy is needed here for it to read tokens; the
-- client never needs to read tokens either, so there is intentionally no select
-- policy at all (a user can only write their own rows).
-- ---------------------------------------------------------------------------
create table if not exists public.push_tokens (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null,
  updated_at      timestamptz not null default now(),
  primary key (user_id, expo_push_token)
);

-- ---------------------------------------------------------------------------
-- decide_sessions: one "Let's Decide" round. Created server-side by the
-- start-decide-session edge function (service role), which fixes the 3 (or
-- fewer) random restaurant ids up front so every member votes on the same set.
-- ---------------------------------------------------------------------------
create table if not exists public.decide_sessions (
  id                   uuid primary key default gen_random_uuid(),
  collection_id        uuid not null references public.collections (id) on delete cascade,
  started_by           uuid not null references public.profiles (id) on delete cascade,
  status               text not null default 'active' check (status in ('active', 'completed')),
  restaurant_ids       uuid[] not null,
  winner_restaurant_id uuid references public.restaurants (id) on delete set null,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz
);

-- ---------------------------------------------------------------------------
-- votes: binary swipe per (session, restaurant, user). true = swiped right/in,
-- false = swiped left/pass. The unique constraint makes re-voting an upsert
-- (change your mind before the session ends) rather than a duplicate.
-- ---------------------------------------------------------------------------
create table if not exists public.votes (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.decide_sessions (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  vote          boolean not null,
  created_at    timestamptz not null default now(),
  unique (session_id, restaurant_id, user_id)
);

-- Helpful indexes
create index if not exists idx_push_tokens_user           on public.push_tokens (user_id);
create index if not exists idx_decide_sessions_collection on public.decide_sessions (collection_id);
create index if not exists idx_votes_session              on public.votes (session_id);

-- ===========================================================================
-- Winner computation — callable RPC.
-- Ending a session is a manual action (any member taps "Finish"). We compute
-- the winner server-side in a SECURITY DEFINER function rather than client-side
-- so the tally is race-free and authoritative. Winner = restaurant with the
-- most "yes" votes; ties (including the all-pass case) broken by whichever
-- restaurant_id sorts first — arbitrary but deterministic, no tiebreaker UI.
-- We tally across the session's fixed restaurant_ids (left join votes) so a
-- restaurant with zero yes votes is still eligible, guaranteeing a deterministic
-- winner even if nobody swiped right. Idempotent: safe to call more than once.
-- ===========================================================================
create or replace function public.complete_decide_session(p_session_id uuid)
returns public.decide_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.decide_sessions;
  w uuid;
begin
  select * into s from public.decide_sessions where id = p_session_id;
  if not found then
    raise exception 'session not found';
  end if;
  -- Only a member of the underlying collection may end the session.
  if not public.is_collection_member(s.collection_id) then
    raise exception 'not authorized: not a member of this collection';
  end if;

  select rid into w
  from unnest(s.restaurant_ids) as rid
  left join public.votes v
    on v.session_id = p_session_id
   and v.restaurant_id = rid
   and v.vote = true
  group by rid
  order by count(v.id) desc, rid asc
  limit 1;

  update public.decide_sessions
     set status = 'completed',
         winner_restaurant_id = w,
         completed_at = now()
   where id = p_session_id
  returning * into s;

  return s;
end;
$$;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.push_tokens     enable row level security;
alter table public.decide_sessions enable row level security;
alter table public.votes           enable row level security;

-- --- push_tokens ----------------------------------------------------------
-- A user can write only their own rows. No select policy (see table comment):
-- the app never reads tokens, and the push-sending edge function uses the
-- service role key which bypasses RLS.
drop policy if exists push_tokens_insert_self on public.push_tokens;
create policy push_tokens_insert_self on public.push_tokens
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_tokens_update_self on public.push_tokens;
create policy push_tokens_update_self on public.push_tokens
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_tokens_delete_self on public.push_tokens;
create policy push_tokens_delete_self on public.push_tokens
  for delete to authenticated
  using (user_id = auth.uid());

-- --- decide_sessions ------------------------------------------------------
-- Readable by members of the collection. We also grant the starter direct
-- visibility of their own row (started_by = auth.uid()), mirroring the 0002
-- fix: it removes any dependency on the membership join for read-back and is
-- also simply correct. Sessions are inserted by the service-role edge function
-- (bypasses RLS), so no insert policy is strictly required, but we add one so a
-- member could create a session directly if we ever move it client-side.
drop policy if exists decide_sessions_select on public.decide_sessions;
create policy decide_sessions_select on public.decide_sessions
  for select to authenticated
  using (started_by = auth.uid() or public.is_collection_member(collection_id));

drop policy if exists decide_sessions_insert on public.decide_sessions;
create policy decide_sessions_insert on public.decide_sessions
  for insert to authenticated
  with check (
    started_by = auth.uid()
    and public.is_collection_member(collection_id)
  );

-- --- votes ----------------------------------------------------------------
-- Readable/insertable/updatable by members of the collection behind the
-- session (join through decide_sessions to reach the collection_id). We also
-- grant the voter direct visibility of their own row (user_id = auth.uid()),
-- again mirroring 0002: the client casts a vote with Prefer: return=representation
-- (upsert + .select()), so the freshly written row must be immediately
-- selectable. The membership here pre-exists (unlike 0002's same-statement
-- trigger), so the join-based check would normally suffice — but the
-- self-visibility clause makes the read-back robust regardless and is correct.
drop policy if exists votes_select on public.votes;
create policy votes_select on public.votes
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.decide_sessions ds
      where ds.id = votes.session_id
        and public.is_collection_member(ds.collection_id)
    )
  );

drop policy if exists votes_insert on public.votes;
create policy votes_insert on public.votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.decide_sessions ds
      where ds.id = votes.session_id
        and public.is_collection_member(ds.collection_id)
    )
  );

drop policy if exists votes_update on public.votes;
create policy votes_update on public.votes
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.decide_sessions ds
      where ds.id = votes.session_id
        and public.is_collection_member(ds.collection_id)
    )
  );

-- Realtime: members subscribe to postgres_changes on votes filtered by
-- session_id to see live tallies. Add votes to the supabase_realtime
-- publication so change events are broadcast (idempotent — skip if already in).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'votes'
  ) then
    alter publication supabase_realtime add table public.votes;
  end if;
end $$;
