-- Dining Decision App — price range.
-- Builds on 0001-0008 (do not edit those). Run via `supabase db push`.
--
-- 1-4 maps to $ / $$ / $$$ / $$$$. Populated from Google's priceLevel enum
-- for link/search/social_import captures, or picked manually for quick_add.
-- Nullable: not every source has it.
alter table public.restaurants
  add column if not exists price_level smallint
    check (price_level is null or price_level between 1 and 4);
