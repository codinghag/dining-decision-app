-- Fix: creating a collection with Prefer: return=representation failed RLS.
-- The owner-membership row is added by an AFTER INSERT trigger on the same
-- statement; the immediate read-back for the returned representation was
-- only permitted via is_collection_member(), which depends on that trigger's
-- effect. Granting the owner direct visibility (independent of the
-- membership join) removes that timing dependency and is also just correct:
-- an owner should always be able to see their own collection.
drop policy if exists collections_select_member on public.collections;
create policy collections_select_member on public.collections
  for select to authenticated
  using (owner_id = auth.uid() or public.is_collection_member(id));
