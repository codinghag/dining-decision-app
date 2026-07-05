# Supabase backend — Dining Decision App

This directory holds everything for the backend: the database schema
(`migrations/`) and the three Google Places proxy Edge Functions (`functions/`).

> There are **no live credentials in this repo**. The schema and functions are
> written to be internally consistent, but you must provision a real Supabase
> project and a Google Places API key before anything runs live. See
> "What you must supply" at the bottom.

## Prerequisites

- A [Supabase](https://supabase.com) project (free tier is fine).
- The [Supabase CLI](https://supabase.com/docs/guides/cli): `npm i -g supabase`
  (or `brew install supabase/tap/supabase`).
- Docker Desktop (only if you want to run Supabase locally with `supabase start`).

## 1. Link the project

```bash
supabase login
supabase link --project-ref <your-project-ref>   # ref is in the dashboard URL
```

## 2. Apply the database schema

The schema lives in `migrations/0001_init.sql`. Either:

```bash
supabase db push        # applies all files in migrations/ to the linked project
```

…or, if you'd rather not use the CLI, open the Supabase dashboard →
**SQL Editor**, paste the contents of `migrations/0001_init.sql`, and run it.

What it creates:

- Tables: `profiles`, `restaurants`, `collections`, `collection_members`,
  `collection_restaurants`, `analytics_events`.
- Triggers: auto-create a `profiles` row on every `auth.users` insert;
  auto-add the collection owner as a member (`role = 'owner'`) on collection
  insert.
- Row Level Security enabled on every table, with policies scoping reads/writes
  to collection membership and to `auth.uid()`. `analytics_events` is
  insert-only (no select policy for app roles).

**Enable anonymous sign-ins:** Dashboard → **Authentication → Providers →
Anonymous** → enable. The app calls `signInAnonymously()` on first load.

## 3. Set the Google Places secret and deploy the Edge Functions

The functions read `GOOGLE_PLACES_API_KEY` from `Deno.env` — it is a **server
secret**, never shipped to the client.

```bash
supabase secrets set GOOGLE_PLACES_API_KEY=your_google_places_api_key

supabase functions deploy places-search
supabase functions deploy places-details
supabase functions deploy places-resolve-link
```

The Google key needs the **Places API (New)** enabled in Google Cloud Console.

### Functions

| Function              | Request body            | Returns                         |
| --------------------- | ----------------------- | ------------------------------- |
| `places-search`       | `{ query, maxResults? }`| `{ results: [...] }` (name/addr/coords/place_id) |
| `places-details`      | `{ placeId }`           | `{ place }` (full normalized record) |
| `places-resolve-link` | `{ url }`               | `{ place }` — resolves a Maps URL (incl. `maps.app.goo.gl` short links) to a place, following redirects server-side |

All three require a valid Supabase JWT (`verify_jwt = true` in `config.toml`),
so only signed-in app users (including anonymous ones) can call them.

## What you must supply before this runs live

1. A real Supabase project + its URL and anon key (into the app's `.env`).
2. Anonymous sign-in enabled in the dashboard.
3. The migration applied (`supabase db push` or manual SQL).
4. A Google Places API key set as the `GOOGLE_PLACES_API_KEY` secret.
5. The three functions deployed.
