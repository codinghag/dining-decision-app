-- Dining Decision App — allow removing a single restaurant from a collection.
-- Builds on 0001-0009 (do not edit those). Run via `supabase db push`.
--
-- collection_restaurants had select + insert policies but no delete, so RLS
-- silently blocked removing a restaurant from a collection. Allow any member
-- of the collection to remove one (mirrors the any-member insert policy in
-- 0001). This only deletes the join row -- the restaurants row is shared and
-- may still belong to other collections, so it is left intact.
drop policy if exists collection_restaurants_delete on public.collection_restaurants;
create policy collection_restaurants_delete on public.collection_restaurants
  for delete to authenticated
  using (public.is_collection_member(collection_id));
