-- 0016: optional phone number + phone-based contact matching, alongside the
-- existing email matching (0015).
--
-- Stored separately from `profiles` (whose select policy is `using (true)` —
-- any authenticated user can read any display_name) so phone numbers are
-- never exposed except through the match-contacts edge function. A self
-- select/insert/update/delete policy lets the owner see and edit their own
-- number (to show/edit it in the Friends screen); no policy grants reading
-- anyone else's.

create table if not exists public.profile_phones (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  phone      text not null,
  updated_at timestamptz not null default now()
);

alter table public.profile_phones enable row level security;

drop policy if exists profile_phones_select_self on public.profile_phones;
create policy profile_phones_select_self on public.profile_phones
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists profile_phones_insert_self on public.profile_phones;
create policy profile_phones_insert_self on public.profile_phones
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists profile_phones_update_self on public.profile_phones;
create policy profile_phones_update_self on public.profile_phones
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists profile_phones_delete_self on public.profile_phones;
create policy profile_phones_delete_self on public.profile_phones
  for delete to authenticated
  using (user_id = auth.uid());

-- Service-role-only phone matching, mirroring match_users_by_email (0015):
-- called by match-contacts, never directly reachable by a client (see the
-- revoke/grant below), so it can't be used to probe arbitrary numbers.
create or replace function public.match_users_by_phone(p_phones text[])
returns table (id uuid, phone text)
language sql
security definer
stable
set search_path = public
as $$
  select pp.user_id as id, pp.phone
  from public.profile_phones pp
  where pp.phone in (select unnest(p_phones));
$$;

revoke execute on function public.match_users_by_phone(text[]) from public;
revoke execute on function public.match_users_by_phone(text[]) from anon;
revoke execute on function public.match_users_by_phone(text[]) from authenticated;
grant execute on function public.match_users_by_phone(text[]) to service_role;
