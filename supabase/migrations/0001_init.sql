-- Dining Decision App — Phase 1 schema
-- Postgres (Supabase). Run via `supabase db push` or apply manually in the SQL editor.
-- All identity is anchored on auth.users.id (stable durable identity, survives an
-- anonymous -> permanent account upgrade), surfaced to the app via the profiles table.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, auto-created by a trigger on auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_anonymous boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- restaurants: sourced from Google Places (or manual quick-add fallback)
-- ---------------------------------------------------------------------------
create table if not exists public.restaurants (
  id              uuid primary key default gen_random_uuid(),
  google_place_id text unique,
  name            text not null,
  address         text,
  lat             double precision,
  lng             double precision,
  phone           text,
  website         text,
  hours           jsonb,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- collections: a named group of restaurants owned by one user
-- ---------------------------------------------------------------------------
create table if not exists public.collections (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- collection_members: who can see/edit a collection (owner + members)
-- ---------------------------------------------------------------------------
create table if not exists public.collection_members (
  collection_id uuid not null references public.collections (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  role          text not null check (role in ('owner', 'member')),
  joined_at     timestamptz not null default now(),
  primary key (collection_id, user_id)
);

-- ---------------------------------------------------------------------------
-- collection_restaurants: many-to-many join (a restaurant can live in many
-- collections). added_by records which member captured it.
-- ---------------------------------------------------------------------------
create table if not exists public.collection_restaurants (
  collection_id uuid not null references public.collections (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  added_by      uuid references public.profiles (id) on delete set null,
  added_at      timestamptz not null default now(),
  primary key (collection_id, restaurant_id)
);

-- ---------------------------------------------------------------------------
-- analytics_events: plain insert-only event log (no third-party vendor).
-- Reads happen via SQL / dashboard, never from the app (no select policy).
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id         uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id    uuid references public.profiles (id) on delete set null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_collection_members_user       on public.collection_members (user_id);
create index if not exists idx_collection_restaurants_coll   on public.collection_restaurants (collection_id);
create index if not exists idx_collections_owner             on public.collections (owner_id);
create index if not exists idx_analytics_events_name_created on public.analytics_events (event_name, created_at);

-- ===========================================================================
-- Triggers
-- ===========================================================================

-- Auto-create a profile row whenever an auth user is created.
-- SECURITY DEFINER so it can write to public.profiles from the auth schema
-- context. is_anonymous is derived from the auth.users.is_anonymous column
-- that Supabase sets for anonymous sign-ins.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, is_anonymous, display_name)
  values (
    new.id,
    coalesce(new.is_anonymous, true),
    coalesce(new.raw_user_meta_data ->> 'display_name', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-add the owner as a member (role 'owner') whenever a collection is made.
create or replace function public.handle_new_collection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.collection_members (collection_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (collection_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_collection_created on public.collections;
create trigger on_collection_created
  after insert on public.collections
  for each row execute function public.handle_new_collection();

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.profiles              enable row level security;
alter table public.restaurants           enable row level security;
alter table public.collections           enable row level security;
alter table public.collection_members    enable row level security;
alter table public.collection_restaurants enable row level security;
alter table public.analytics_events      enable row level security;

-- Helper: is the current user a member of the given collection?
-- SECURITY DEFINER + own search_path so the function body reads
-- collection_members without recursively triggering that table's RLS
-- (which would otherwise reference collections, and vice-versa).
create or replace function public.is_collection_member(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.collection_members m
    where m.collection_id = cid
      and m.user_id = auth.uid()
  );
$$;

-- --- profiles -------------------------------------------------------------
-- Readable by any authenticated user; writable only by self.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- --- restaurants ----------------------------------------------------------
-- Readable by any authenticated user; insertable by any authenticated user
-- who stamps themselves as created_by.
drop policy if exists restaurants_select on public.restaurants;
create policy restaurants_select on public.restaurants
  for select to authenticated
  using (true);

drop policy if exists restaurants_insert on public.restaurants;
create policy restaurants_insert on public.restaurants
  for insert to authenticated
  with check (created_by = auth.uid());

-- --- collections ----------------------------------------------------------
-- Readable only by members. Insertable only by the owner creating their own
-- collection (owner_id = self); the trigger then adds the membership row.
drop policy if exists collections_select_member on public.collections;
create policy collections_select_member on public.collections
  for select to authenticated
  using (public.is_collection_member(id));

drop policy if exists collections_insert_owner on public.collections;
create policy collections_insert_owner on public.collections
  for insert to authenticated
  with check (owner_id = auth.uid());

-- --- collection_members ---------------------------------------------------
-- Readable by fellow members of the same collection.
-- (Insert of the owner row is handled by the SECURITY DEFINER trigger, which
--  bypasses RLS. Phase 2 will add an invite flow / insert policy.)
drop policy if exists collection_members_select on public.collection_members;
create policy collection_members_select on public.collection_members
  for select to authenticated
  using (public.is_collection_member(collection_id));

-- --- collection_restaurants -----------------------------------------------
-- Readable AND insertable by any member of that collection (view + add).
drop policy if exists collection_restaurants_select on public.collection_restaurants;
create policy collection_restaurants_select on public.collection_restaurants
  for select to authenticated
  using (public.is_collection_member(collection_id));

drop policy if exists collection_restaurants_insert on public.collection_restaurants;
create policy collection_restaurants_insert on public.collection_restaurants
  for insert to authenticated
  with check (
    public.is_collection_member(collection_id)
    and added_by = auth.uid()
  );

-- --- analytics_events -----------------------------------------------------
-- Insert-only for authenticated (incl. anonymous) users inserting their own
-- user_id. No select policy => the app can never read the event log.
drop policy if exists analytics_events_insert on public.analytics_events;
create policy analytics_events_insert on public.analytics_events
  for insert to authenticated
  with check (user_id = auth.uid());
