-- Best-effort thumbnail scraped from an Instagram/TikTok post's og:image, so
-- a social save has a visual even before/without a Google Places match.
-- These are signed CDN URLs that can expire -- always a fallback, never a
-- substitute for photo_name (the stable Places photo proxy).
alter table public.restaurants
  add column if not exists source_image_url text;
