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

## Phase 2 additions

Migration `0003_phase2.sql` adds `push_tokens`, `decide_sessions`, `votes`, the
`complete_decide_session()` winner RPC, RLS for all three tables, and puts
`votes` in the `supabase_realtime` publication. Two new functions:

```bash
supabase db push
supabase functions deploy join-collection start-decide-session
```

| Function                | Request body            | Returns                              |
| ----------------------- | ----------------------- | ------------------------------------ |
| `join-collection`       | `{ collectionId }`      | `{ collection: { id, name } }` — service-role upserts caller as `member` (idempotent) |
| `start-decide-session`  | `{ collectionId }`      | `{ session, restaurants }` — picks random ≤3, pushes other members |

Both use the service-role key, which the Supabase runtime injects automatically
as `SUPABASE_SERVICE_ROLE_KEY` — no extra secret to set.

### Phase 2 bugfixes (0004)

Code review of 0003 found four issues, all fixed without editing 0003 directly:

- `votes_insert`/`votes_update` now also require `decide_sessions.status = 'active'`,
  so a vote can no longer land after a session is completed.
- A unique partial index (`collection_id where status = 'active'`) enforces at
  most one active session per collection; `start-decide-session` now checks
  for (and reuses) an existing active session before creating one, so two
  members tapping "Let's Decide" at once join the same session instead of
  splitting into two.
- `decide_sessions` is now in the `supabase_realtime` publication, and the
  decide screen subscribes to it, so a session's completion pushes live to
  every member still voting — not just the one who tapped Finish.
- `lib/push.ts` now passes `Constants.expoConfig.extra.eas.projectId`
  explicitly to `getExpoPushTokenAsync()` instead of relying on auto-inference
  (which throws on a real EAS/dev-client build).

```bash
supabase db push
supabase functions deploy start-decide-session
```

### Phase 2 bugfixes (0005)

The same review's lower-severity findings, also fixed:

- `join-collection`/`start-decide-session` now reject a non-UUID `collectionId`
  with a clean 400 instead of letting it reach a raw PostgREST query string.
- Both functions' catch-all handlers log the real error server-side but return
  a generic `"Internal error"` to the caller instead of relaying raw
  Postgres/PostgREST error text.
- `start-decide-session`'s membership check now calls a `(cid, uid)` overload
  of the existing `is_collection_member` SQL function via RPC, instead of
  re-deriving the membership rule as a hand-rolled PostgREST query — one
  source of truth for "what counts as a member," shared with RLS.
- `lib/decide.ts`'s `joinCollection`/`startDecideSession` now unwrap the
  edge function's `{ error }` message from the thrown `FunctionsHttpError`
  (supabase-js nulls `data` on any non-2xx response, so the old
  `data?.error` check was dead code — specific error messages like "Not a
  member of this collection" were never reaching the user).
- The decide screen's live-tally Realtime handler now surfaces a failed
  refetch via the error banner instead of swallowing it silently.

```bash
supabase db push
supabase functions deploy join-collection start-decide-session
```

### Testing push notifications live (needs a human + real device)

Push delivery cannot be exercised in CI / a sandbox — it needs a physical
device and Expo push credentials. To test end-to-end:

1. Add an EAS project id to `app.json` (`expo.extra.eas.projectId`) — required by
   `Notifications.getExpoPushTokenAsync()`. Run `eas init` if you don't have one.
2. Build a dev/preview client on a **physical** iOS/Android device
   (`eas build --profile development`) — simulators/emulators and web cannot get
   a push token (`lib/push.ts` guards with `Platform.OS !== 'web'` and
   `Device.isDevice`, so it silently no-ops elsewhere).
3. For iOS you also need an APNs key configured in EAS (`eas credentials`).
4. Open the app on the device so a row lands in `push_tokens`, then have a second
   member start a Decide Now session — the device should receive the push. You
   can also poke Expo directly: `curl -X POST https://exp.host/--/api/v2/push/send
   -H 'Content-Type: application/json' -d '{"to":"ExponentPushToken[…]","title":"hi","body":"test"}'`.

### Testing the swipe UI live

The swipe gesture needs a rendered app (browser or device); the data flow beneath
it is verified independently (curl: session create → votes → winner RPC). To try
the gesture: `npx expo start`, open a collection with ≥1 restaurant, tap **Let's
Decide**, and swipe the cards (right = in, left = pass). On web, the tap
**In / Pass** buttons back the same `castVote` path.

## What you must supply before this runs live

1. A real Supabase project + its URL and anon key (into the app's `.env`).
2. Anonymous sign-in enabled in the dashboard.
3. The migration applied (`supabase db push` or manual SQL).
4. A Google Places API key set as the `GOOGLE_PLACES_API_KEY` secret.
5. The three functions deployed.
