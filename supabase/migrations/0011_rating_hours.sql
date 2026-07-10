-- Dining Decision App — ratings + data needed to compute "open now".
-- Builds on 0001-0010 (do not edit those). Run via `supabase db push`.
--
-- rating / rating_count come straight from Google (like cuisine/price).
-- "Open now" is time-sensitive, so we do NOT store a stale boolean: we store
-- the place's utc_offset_minutes and compute open/closed on the client from
-- the already-stored regularOpeningHours (the `hours` column). Nullable: not
-- every source has these.
alter table public.restaurants
  add column if not exists rating real check (rating is null or (rating >= 0 and rating <= 5)),
  add column if not exists rating_count integer,
  add column if not exists utc_offset_minutes integer;
