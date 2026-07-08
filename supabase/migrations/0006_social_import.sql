-- Dining Decision App — social import
-- Adds optional provenance columns so a restaurant saved via the
-- Instagram/TikTok bulk-import flow can show "via Instagram" / "via TikTok"
-- in the UI. Builds on 0001-0005 (do not edit those). Run via `supabase db push`.
--
-- Nullable and additive only: restaurants captured via the existing link /
-- search / quick_add flows simply leave these NULL.

alter table public.restaurants
  add column if not exists source_url text,
  add column if not exists source_platform text
    check (source_platform is null or source_platform in ('instagram', 'tiktok'));
