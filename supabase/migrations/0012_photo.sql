-- Dining Decision App — restaurant photo reference.
-- Builds on 0001-0011 (do not edit those). Run via `supabase db push`.
--
-- Google returns a photo *resource name* (places/<id>/photos/<ref>), not a URL
-- -- turning it into an image needs the server-side Places key. We store the
-- resource name and the app loads the image through the places-photo proxy
-- edge function. Nullable: only Google-sourced (details) captures have it.
alter table public.restaurants
  add column if not exists photo_name text;
