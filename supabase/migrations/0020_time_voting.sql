-- Dining Decision App — date/time voting, layered onto decide_sessions.
-- Builds on 0003/0004 (do not edit those). Run via `supabase db push`.
--
-- The organizer proposes 1+ candidate date/time slots when starting a
-- session (start-decide-session); the group approves as many as work for
-- them (approval voting, mirroring the existing yes/no restaurant votes but
-- with un-approve modeled as row deletion rather than vote=false, since there
-- is no meaningful "explicitly not interested" state to record here). Most
-- approvals wins, same as restaurant votes; ties broken by earliest starts_at
-- rather than by id, since "soonest" is the sensible tiebreak for a schedule.

-- ---------------------------------------------------------------------------
-- decide_time_options: the fixed set of candidate slots for a session,
-- proposed once by the organizer via start-decide-session (service role).
-- Not client-writable — mirrors how restaurant_ids is fixed server-side too.
-- ---------------------------------------------------------------------------
create table if not exists public.decide_time_options (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.decide_sessions (id) on delete cascade,
  starts_at  timestamptz not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- time_votes: approval per (session, option, user). A row = approved; there
-- is no vote=false row — un-approving deletes the row instead, since absence
-- already means "not approved" and there's nothing more to distinguish
-- (unlike restaurant votes, where "pass" is itself meaningful to show).
-- ---------------------------------------------------------------------------
create table if not exists public.time_votes (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.decide_sessions (id) on delete cascade,
  option_id  uuid not null references public.decide_time_options (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  vote       boolean not null default true,
  created_at timestamptz not null default now(),
  unique (session_id, option_id, user_id)
);

alter table public.decide_sessions
  add column if not exists winner_time_option_id uuid references public.decide_time_options (id) on delete set null;

create index if not exists idx_decide_time_options_session on public.decide_time_options (session_id);
create index if not exists idx_time_votes_session           on public.time_votes (session_id);

-- ===========================================================================
-- Extend complete_decide_session: compute both winners in the same call, so
-- ending a session (manual Finish or the 60s timeout) stays one atomic RPC.
-- Time winner = option with the most approvals; ties broken by earliest
-- starts_at (deterministic, and the sensible tiebreak for a schedule, unlike
-- the arbitrary id-order tiebreak used for restaurants).
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
  wt uuid;
begin
  select * into s from public.decide_sessions where id = p_session_id;
  if not found then
    raise exception 'session not found';
  end if;
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

  select o.id into wt
  from public.decide_time_options o
  left join public.time_votes tv
    on tv.option_id = o.id
   and tv.session_id = p_session_id
   and tv.vote = true
  where o.session_id = p_session_id
  group by o.id, o.starts_at
  order by count(tv.id) desc, o.starts_at asc
  limit 1;

  update public.decide_sessions
     set status = 'completed',
         winner_restaurant_id = w,
         winner_time_option_id = wt,
         completed_at = now()
   where id = p_session_id
  returning * into s;

  return s;
end;
$$;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.decide_time_options enable row level security;
alter table public.time_votes          enable row level security;

-- --- decide_time_options ---------------------------------------------------
-- Readable by members of the collection behind the session. No client
-- insert/update/delete — only start-decide-session (service role) writes
-- these, same as restaurant_ids being fixed server-side.
drop policy if exists decide_time_options_select on public.decide_time_options;
create policy decide_time_options_select on public.decide_time_options
  for select to authenticated
  using (
    exists (
      select 1 from public.decide_sessions ds
      where ds.id = decide_time_options.session_id
        and public.is_collection_member(ds.collection_id)
    )
  );

-- --- time_votes -------------------------------------------------------------
-- Same shape as votes' policies (0003 + the 0004 status='active' guard),
-- plus a delete policy since un-approving removes the row.
drop policy if exists time_votes_select on public.time_votes;
create policy time_votes_select on public.time_votes
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.decide_sessions ds
      where ds.id = time_votes.session_id
        and public.is_collection_member(ds.collection_id)
    )
  );

drop policy if exists time_votes_insert on public.time_votes;
create policy time_votes_insert on public.time_votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.decide_sessions ds
      where ds.id = time_votes.session_id
        and ds.status = 'active'
        and public.is_collection_member(ds.collection_id)
    )
  );

drop policy if exists time_votes_update on public.time_votes;
create policy time_votes_update on public.time_votes
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.decide_sessions ds
      where ds.id = time_votes.session_id
        and ds.status = 'active'
        and public.is_collection_member(ds.collection_id)
    )
  );

drop policy if exists time_votes_delete on public.time_votes;
create policy time_votes_delete on public.time_votes
  for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.decide_sessions ds
      where ds.id = time_votes.session_id
        and ds.status = 'active'
    )
  );

-- Realtime: same reasoning as votes (0003) and decide_sessions (0004) — add
-- time_votes to the publication now, up front, rather than in a follow-up fix.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'time_votes'
  ) then
    alter publication supabase_realtime add table public.time_votes;
  end if;
end $$;
