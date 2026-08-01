-- General list: an auto-created catch-all collection per user, so link/scrape
-- based adds (website links, share-sheet drops) have somewhere to land
-- without forcing a list choice first. Items can be moved to a more specific
-- list afterward (app-level: delete + insert join rows, no schema needed for
-- that part).
alter table public.collections
  add column if not exists is_general boolean not null default false;

-- At most one general list per owner (the app upserts against this).
create unique index if not exists idx_collections_general_per_owner
  on public.collections (owner_id)
  where is_general;
