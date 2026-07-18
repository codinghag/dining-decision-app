-- 0015: friends + in-app invites.
--
-- Friendships are mutual and stored as two rows (one per direction) written
-- in lockstep by the add-friend edge function (service role) — there is
-- deliberately no client insert policy, so the pair can't drift. Friend ids
-- are unguessable UUIDs a caller can only have learned via contact matching,
-- shared group membership, or an exact-email lookup, so v1 uses an instant
-- mutual add (no request/accept round). Either side can read or dissolve
-- the friendship in both directions.

create table if not exists public.friendships (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  friend_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index if not exists idx_friendships_friend on public.friendships (friend_id);

alter table public.friendships enable row level security;

drop policy if exists friendships_select_own on public.friendships;
create policy friendships_select_own on public.friendships
  for select to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());

drop policy if exists friendships_delete_own on public.friendships;
create policy friendships_delete_own on public.friendships
  for delete to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());

-- Which of these emails belong to Forked accounts? SERVICE ROLE ONLY — it
-- reads auth.users, and exposing it to clients would let anyone probe
-- whether an arbitrary email has an account. Called by the match-contacts
-- edge function; the submitted emails are matched in memory and never stored.
create or replace function public.match_users_by_email(p_emails text[])
returns table (id uuid, email text)
language sql
security definer
stable
set search_path = public
as $$
  select u.id, lower(u.email) as email
  from auth.users u
  where u.email is not null
    and lower(u.email) in (select lower(e) from unnest(p_emails) as e);
$$;

revoke execute on function public.match_users_by_email(text[]) from public;
revoke execute on function public.match_users_by_email(text[]) from anon;
revoke execute on function public.match_users_by_email(text[]) from authenticated;
grant execute on function public.match_users_by_email(text[]) to service_role;
