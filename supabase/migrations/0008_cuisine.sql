-- Dining Decision App — cuisine / food type.
-- Builds on 0001-0007 (do not edit those). Run via `supabase db push`.
--
-- Populated from Google's primaryTypeDisplayName for link/search/social_import
-- captures (e.g. "Pizza restaurant", "Italian restaurant"), or typed manually
-- for quick_add. Nullable: not every source has it.
alter table public.restaurants
  add column if not exists cuisine text;
