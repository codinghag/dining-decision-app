# Forked

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
app/                                   Expo Router screens
  _layout.tsx                          Root stack; anon bootstrap, app_opened, push-token register
  index.tsx                            Collections list + create
  collection/[id]/index.tsx            Collection detail; Share + "Let's Decide"
  collection/[id]/add.tsx              Add restaurant — link / search / quick-add
  collection/[id]/join.tsx             Invite landing — auto-joins via edge fn (Phase 2)
  collection/[id]/decide/[sessionId].tsx  Decide Now swipe deck + live tallies (Phase 2)
lib/
  supabase.ts                Client init, cross-platform storage, anon sign-in
  analytics.ts               logEvent() -> analytics_events
  places.ts                  Client wrappers for the Places edge functions
  db.ts                      Collections + save-restaurant data layer
  decide.ts                  Sessions, votes, winner RPC, invite-accept (Phase 2)
  invite.ts                  Build + share the collection invite link (Phase 2)
  push.ts                    Expo push-token registration (native-only) (Phase 2)
supabase/
  migrations/0001_init.sql   Phase 1 schema, triggers, RLS
  migrations/0002_*.sql      Owner-select RLS fix
  migrations/0003_phase2.sql push_tokens, decide_sessions, votes, winner RPC, RLS (Phase 2)
  functions/                 places-* ; join-collection, start-decide-session (Phase 2)
  config.toml, README.md
```

## Analytics events

| Event               | When                                   |
| ------------------- | -------------------------------------- |
| `app_opened`        | once per cold start (root layout)      |
| `collection_created`| a collection is created                |
| `restaurant_saved`  | a restaurant is captured — `properties.method` is `link` \| `search` \| `quick_add` |
| `invite_sent`       | user taps Share / copies the invite link (Phase 2) |
| `invite_accepted`   | a visitor joins a collection via its link (Phase 2) |
| `decide_session_started` | a "Let's Decide" session is created (Phase 2) |
| `vote_cast`         | a swipe/tap vote on a restaurant — `properties.vote` bool (Phase 2) |
| `session_completed` | a session is finished — `properties.winner_restaurant_id` (Phase 2) |

## Phase 2 — built

- **Invite / share:** a collection's link carries its `collection_id` (an
  unguessable UUID = the invite token). Opening it hits the `join-collection`
  edge function (service role) which idempotently adds the visitor as a
  `member`. Share sheet on native, clipboard on web.
- **Decide Now:** `start-decide-session` fixes a random 3 restaurants and
  notifies other members via Expo push. Members swipe (gesture-handler +
  reanimated) — the data underneath is a plain binary vote per restaurant,
  aggregated as counts (no ranking). Live tallies via Supabase Realtime on the
  `votes` table. "Finish" calls the `complete_decide_session` RPC, which
  computes the winner (most yes; ties broken by `restaurant_id`) server-side.
- **Push:** `push_tokens` table populated by `expo-notifications` on native
  start; see `supabase/README.md` for what a human must do to test live delivery.

## Out of scope — deliberately NOT built

- **Out of scope (PRD §6):** Instagram / TikTok scraping, AI recommendations,
  subscriptions, sponsored placements, reservation booking, review badges,
  multi-axis reviews, visit-purpose tagging, "date invitation" AI pickup lines,
  calendar sync.

## Web deployment

The web build is deployed to GitHub Pages behind the custom domain
https://outforked.com/ (DNS points at GitHub Pages; the `CNAME` record is
written into the `gh-pages` branch on every deploy).

To redeploy after making changes:

```bash
npm run deploy
```

`scripts/deploy-web.js` runs the whole flow: it temporarily clears/sets the
GitHub Pages base path in `app.json` (root-relative, since the custom domain
serves from the apex rather than a `/dining-decision-app` project-pages
subpath), runs `expo export -p web`, restores `app.json` to its original
contents (even if the export fails), copies `dist/index.html` to
`dist/404.html` as the SPA fallback so client-side routes survive a refresh,
then publishes `dist/` via `gh-pages` with `--cname outforked.com`.

`scripts/gh-pages-before-add.js` strips a stray `.gitignore` that gh-pages'
temp clone otherwise inherits from this repo — without it, any asset path
containing `node_modules` (Metro names some web asset chunks after their
source module path) gets silently dropped from the deploy.
