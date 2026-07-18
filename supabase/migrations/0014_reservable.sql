-- 0014: does this restaurant take reservations?
--
-- Populated from Google Place Details' `reservable` field on save (and by
-- the fix-details flow). Nullable and additive: null = unknown (rows saved
-- before this migration, or Google has no data), true/false = Google's
-- answer. Drives the "Reserve a table" button, which deep-links to the
-- restaurant's Google Maps page where Reserve with Google aggregates the
-- booking platforms (OpenTable/Resy/Tock) — direct in-app booking would
-- require partner API agreements those platforms don't offer publicly.
alter table public.restaurants
  add column if not exists reservable boolean;
