# Dining Decision App

Help friend groups decide where to eat, fast, at the moment it matters. This is
the **Phase 1 MVP**: capture restaurants into shared collections. It validates a
single hypothesis — does the app get used repeatedly, unprompted, for real group
dining decisions.

- **App:** Expo + Expo Router + TypeScript, one codebase for web, iOS and Android.
- **Backend:** Supabase (Postgres + Auth + Realtime), with Row Level Security.
- **Auth:** every user is signed in **anonymously** on first load (no login
  wall). Anonymous users keep a stable `auth.users.id`, so they can later claim
  a permanent account without losing data.
- **Restaurant data:** Google Places API (New), proxied through Supabase Edge
  Functions so the API key never ships in the client.
- **Analytics:** a plain `analytics_events` Postgres table, instrumented inline
  with each capture action (no third-party vendor).

## Running the app

```bash
npm install
cp .env.example .env          # then fill in your Supabase URL + anon key
npx expo start                # dev server; press w / i / a
# or target a platform directly:
npx expo start --web
npx expo start --ios
npx expo start --android
```

The app will warn in the console if `EXPO_PUBLIC_SUPABASE_URL` /
`EXPO_PUBLIC_SUPABASE_ANON_KEY` are missing.

## Setting up the backend

See [`supabase/README.md`](./supabase/README.md) for the full walkthrough. In short:

1. Create a Supabase project; enable **Anonymous** sign-in.
2. Put the project URL + anon key in `.env` (see `.env.example`).
3. Apply the schema: `supabase db push` (or paste `supabase/migrations/0001_init.sql`
   into the SQL editor).
4. Set the Places secret: `supabase secrets set GOOGLE_PLACES_API_KEY=…`
   (requires the **Places API (New)** enabled in Google Cloud).
5. Deploy the functions:
   `supabase functions deploy places-search places-details places-resolve-link`.

## Project structure

```
app/                         Expo Router screens
  _layout.tsx                Root stack; anonymous session bootstrap + app_opened event
  index.tsx                  Collections list + create
  collection/[id]/index.tsx  Collection detail (its restaurants)
  collection/[id]/add.tsx    Add restaurant — link / search / quick-add
lib/
  supabase.ts                Client init, cross-platform storage, anon sign-in
  analytics.ts               logEvent() -> analytics_events
  places.ts                  Client wrappers for the 3 edge functions
  db.ts                      Collections + save-restaurant data layer
supabase/
  migrations/0001_init.sql   Schema, triggers, RLS
  functions/                 places-search / places-details / places-resolve-link
  config.toml, README.md
```

## Analytics events

| Event               | When                                   |
| ------------------- | -------------------------------------- |
| `app_opened`        | once per cold start (root layout)      |
| `collection_created`| a collection is created                |
| `restaurant_saved`  | a restaurant is captured — `properties.method` is `link` \| `search` \| `quick_add` |

## Phase 1 scope — deliberately NOT built yet

The following are Phase 2+ or permanently out of scope, and are intentionally
absent:

- **Phase 2:** Collections invite/share UI, "Decide Now" voting / swipe UI,
  vote & decide-session tables, push notifications.
- **Out of scope (PRD §6):** Instagram / TikTok scraping, AI recommendations,
  subscriptions, sponsored placements, reservation booking, review badges,
  multi-axis reviews, visit-purpose tagging, "date invitation" AI pickup lines,
  calendar sync.

This phase deliberately keeps the UI functional but unpolished — it is
validating data flow, not visual design.
