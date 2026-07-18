-- 0013: let members repair an unresolved restaurant row.
--
-- Restaurants saved as free text or a bare pasted link (google_place_id is
-- null) can now be matched to a real Google place after the fact — renamed
-- and filled in with full details, the same shape as a manual save. Scoped
-- to unresolved rows only: resolved rows are deduped by google_place_id and
-- shared across collections, so they must not be rewritten out from under
-- other groups. The updater must be a member of at least one collection
-- containing the restaurant. (The collection_restaurants scan inside the
-- exists() runs under that table's own RLS, which already limits it to the
-- caller's collections.)

drop policy if exists restaurants_update_unresolved on public.restaurants;
create policy restaurants_update_unresolved on public.restaurants
  for update to authenticated
  using (
    google_place_id is null
    and exists (
      select 1
      from public.collection_restaurants cr
      where cr.restaurant_id = restaurants.id
    )
  )
  with check (true);
