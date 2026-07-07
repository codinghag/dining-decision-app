-- Dining Decision App — Phase 2 bugfixes, found in code review of 0003.
-- Do not edit 0001/0002/0003 — this migration only alters/adds on top of them.
-- Run via `supabase db push`.

-- ---------------------------------------------------------------------------
-- 1. Votes could still be written after a session was completed, since
-- votes_insert/votes_update only checked collection membership, never
-- decide_sessions.status. That let a straggling vote change what a re-run of
-- complete_decide_session() would compute, and let live tallies drift past
-- the already-announced winner. Re-create both policies with an added
-- `ds.status = 'active'` check.
-- ---------------------------------------------------------------------------
drop policy if exists votes_insert on public.votes;
create policy votes_insert on public.votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.decide_sessions ds
      where ds.id = votes.session_id
        and ds.status = 'active'
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
        and ds.status = 'active'
        and public.is_collection_member(ds.collection_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Nothing prevented two concurrent "Let's Decide" taps from creating two
-- independent active sessions for the same collection. Enforce it in the
-- database (defense in depth for the TOCTOU race the edge function also
-- closes by checking-then-reusing an existing active session).
-- ---------------------------------------------------------------------------
create unique index if not exists idx_decide_sessions_one_active_per_collection
  on public.decide_sessions (collection_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- 3. decide_sessions was never added to the supabase_realtime publication, so
-- when one member completed a session, other members still on the voting
-- screen (subscribed only to `votes`) never learned it had ended.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'decide_sessions'
  ) then
    alter publication supabase_realtime add table public.decide_sessions;
  end if;
end $$;
