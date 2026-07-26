-- Dining Decision App — allow the owner to rename their own collection.
-- Builds on 0001-0016 (do not edit those). Run via `supabase db push`.
--
-- No update policy existed before this, so RLS silently blocked all updates.
-- Owner-only (not any member), matching collections_delete_owner (0007).
drop policy if exists collections_update_owner on public.collections;
create policy collections_update_owner on public.collections
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
