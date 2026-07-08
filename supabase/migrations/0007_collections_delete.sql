-- Dining Decision App — allow the owner to delete their own collection.
-- Builds on 0001-0006 (do not edit those). Run via `supabase db push`.
--
-- No delete policy existed before this, so RLS silently blocked all deletes.
-- Owner-only (not any member) so a shared collection can't be wiped by
-- someone who merely joined it. collection_members, collection_restaurants,
-- and decide_sessions all already reference collections(id) on delete
-- cascade (see 0001/0003), so deleting the row here cleans up everywhere.
drop policy if exists collections_delete_owner on public.collections;
create policy collections_delete_owner on public.collections
  for delete to authenticated
  using (owner_id = auth.uid());
