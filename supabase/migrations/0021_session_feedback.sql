-- Dining Decision App — post-decide "How was it?" feedback.
-- Builds on 0003/0020 (do not edit those). Run via `supabase db push`.
--
-- One optional thumbs-up/down per (session, user), recorded once a session
-- has a winner. v1 is write-and-self-read only -- no aggregate/other-users
-- display, this just seeds data for future suggestion quality, per the
-- product review that introduced it.
create table if not exists public.session_feedback (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.decide_sessions (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  liked         boolean not null,
  created_at    timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists idx_session_feedback_session on public.session_feedback (session_id);

alter table public.session_feedback enable row level security;

-- Self-row only, both ways: you can only see your own feedback (no need to
-- expose others' reactions in v1), and you can only write it once a session
-- is completed (rating only makes sense once there's a winner) and only for
-- a session behind a collection you're a member of.
drop policy if exists session_feedback_select on public.session_feedback;
create policy session_feedback_select on public.session_feedback
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists session_feedback_insert on public.session_feedback;
create policy session_feedback_insert on public.session_feedback
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.decide_sessions ds
      where ds.id = session_feedback.session_id
        and ds.status = 'completed'
        and public.is_collection_member(ds.collection_id)
    )
  );

-- Upsertable in case someone taps the other thumb by mistake.
drop policy if exists session_feedback_update on public.session_feedback;
create policy session_feedback_update on public.session_feedback
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
