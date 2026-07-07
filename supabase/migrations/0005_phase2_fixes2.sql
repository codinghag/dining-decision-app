-- Dining Decision App — Phase 2 bugfixes, round 2 (lower-severity findings
-- from the same code review as 0004). Do not edit 0001-0004 — additive only.
-- Run via `supabase db push`.

-- ---------------------------------------------------------------------------
-- Edge functions run with the SERVICE ROLE key, under which auth.uid() is
-- null — so they couldn't reuse the existing single-arg is_collection_member
-- (it reads auth.uid() internally) and instead re-implemented the membership
-- check by hand as a PostgREST query in TypeScript. That let the SQL and TS
-- copies of "what counts as a member" drift out of sync. This overload takes
-- the user id explicitly so edge functions can call the same underlying rule
-- via RPC instead of re-deriving it.
-- ---------------------------------------------------------------------------
create or replace function public.is_collection_member(cid uuid, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.collection_members m
    where m.collection_id = cid
      and m.user_id = uid
  );
$$;
