// start-decide-session: a member taps "Let's Decide". We (service role):
//   1. verify the caller is a member of the collection,
//   2. reuse an existing active session for this collection if one exists,
//   3. otherwise take every restaurant currently in the collection and
//      insert the decide_sessions row (status 'active'), backstopped
//      by a unique index (see 0004_phase2_fixes.sql) against the concurrent
//      double-tap race, then insert the organizer's proposed time slots,
//   4. best-effort push all OTHER members via Expo ("Time to decide where to eat"),
//   5. return the session PLUS the chosen restaurants' and time options'
//      details, so the client can render the swipe deck without a second
//      round trip.
//
// Request:  POST { "collectionId": string, "timeOptions": string[] }
//   timeOptions: 1+ ISO datetime strings the organizer is proposing. Ignored
//   (not an error) when an existing active session is reused — that
//   session's own options are returned instead, same as the restaurant
//   sample already does for a late-arriving caller.
// Response: { "session": DecideSession, "restaurants": Restaurant[], "timeOptions": TimeOption[] } | { "error": string }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { admin, callerUserId, isUuid, sendExpoPush } from "../_shared/supabaseAdmin.ts";

interface Restaurant {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  hours: unknown | null;
}

interface TimeOption {
  id: string;
  session_id: string;
  starts_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const userId = callerUserId(req);
    if (!userId) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const { collectionId, wildcardRestaurantId, timeOptions } = await req.json();
    if (!isUuid(collectionId)) {
      return jsonResponse({ error: "collectionId (uuid) is required" }, 400);
    }
    if (
      !Array.isArray(timeOptions) ||
      timeOptions.length === 0 ||
      timeOptions.some((t) => typeof t !== "string" || Number.isNaN(Date.parse(t)))
    ) {
      return jsonResponse(
        { error: "timeOptions (non-empty string[] of ISO datetimes) is required" },
        400,
      );
    }

    const db = admin();

    // 1. Caller must be a member of this collection. Calls the same SQL
    // helper RLS uses (via its (cid, uid) overload, since auth.uid() is null
    // under the service role) instead of re-deriving the membership rule as a
    // hand-rolled query here.
    const isMember = await db.rpc<boolean>("is_collection_member", {
      cid: collectionId,
      uid: userId,
    });
    if (!isMember) {
      return jsonResponse({ error: "Not a member of this collection" }, 403);
    }

    // 2. Reuse an existing active session instead of creating a duplicate —
    // otherwise two members tapping "Let's Decide" around the same time would
    // split the group into two sessions with two different random samples.
    const restaurantSelect = "id,name,address,lat,lng,phone,website,hours";
    const existingActive = await db.select<Record<string, unknown>>(
      "decide_sessions",
      `collection_id=eq.${collectionId}&status=eq.active&select=*&order=created_at.desc&limit=1`,
    );
    if (existingActive.length > 0) {
      const session = existingActive[0];
      const ids = session.restaurant_ids as string[];
      const [restaurants, existingTimeOptions] = await Promise.all([
        db.select<Restaurant>(
          "restaurants",
          `id=in.(${ids.join(",")})&select=${restaurantSelect}`,
        ),
        db.select<TimeOption>(
          "decide_time_options",
          `session_id=eq.${session.id}&select=id,session_id,starts_at&order=starts_at.asc`,
        ),
      ]);
      return jsonResponse({ session, restaurants, timeOptions: existingTimeOptions });
    }

    // 3. Every restaurant in the collection goes into the deck (was
    // previously a random sample of 3 -- changed per user request so the
    // group votes on the whole list, not a subset).
    const links = await db.select<{ restaurant_id: string }>(
      "collection_restaurants",
      `collection_id=eq.${collectionId}&select=restaurant_id`,
    );
    const allIds = links.map((l) => l.restaurant_id);
    if (allIds.length === 0) {
      return jsonResponse(
        { error: "This collection has no restaurants to decide between" },
        400,
      );
    }
    const chosenIds = [...allIds];

    // 3b. Optional wildcard: a restaurant the client picked from Google that
    // isn't necessarily in the collection (a "try somewhere new" surprise).
    // Append it to the deck. The client already created the restaurants row;
    // it just isn't in collection_restaurants, so it shows in the deck without
    // being saved to the collection.
    if (isUuid(wildcardRestaurantId) && !chosenIds.includes(wildcardRestaurantId)) {
      chosenIds.push(wildcardRestaurantId);
    }

    // 4. Create the session. A unique partial index on decide_sessions
    // (collection_id) where status='active' backstops the race between our
    // check above and this insert — if another request won that race, fetch
    // and return their session instead of failing.
    let session: Record<string, unknown>;
    let weCreatedSession = true;
    try {
      [session] = await db.insert<Record<string, unknown>>("decide_sessions", {
        collection_id: collectionId,
        started_by: userId,
        status: "active",
        restaurant_ids: chosenIds,
      });
    } catch (insertErr) {
      const raceWinner = await db.select<Record<string, unknown>>(
        "decide_sessions",
        `collection_id=eq.${collectionId}&status=eq.active&select=*&order=created_at.desc&limit=1`,
      );
      if (raceWinner.length === 0) throw insertErr;
      session = raceWinner[0];
      weCreatedSession = false;
    }

    // Time options: if we won the race and actually created this session,
    // insert our proposed slots. If another request beat us to it, that
    // session's own options win instead — same "first session wins" rule
    // already applied to the restaurant sample.
    let sessionTimeOptions: TimeOption[];
    if (weCreatedSession) {
      sessionTimeOptions = await db.insert<TimeOption>(
        "decide_time_options",
        (timeOptions as string[]).map((starts_at) => ({
          session_id: session.id,
          starts_at,
        })),
      );
    } else {
      sessionTimeOptions = await db.select<TimeOption>(
        "decide_time_options",
        `session_id=eq.${session.id}&select=id,session_id,starts_at&order=starts_at.asc`,
      );
    }

    // Fetch the chosen restaurants' details for the client.
    const sessionIds = session.restaurant_ids as string[];
    const restaurants = await db.select<Restaurant>(
      "restaurants",
      `id=in.(${sessionIds.join(",")})&select=${restaurantSelect}`,
    );

    // 5. Best-effort push to all OTHER members. Never fail the request on this.
    try {
      const members = await db.select<{ user_id: string }>(
        "collection_members",
        `collection_id=eq.${collectionId}&user_id=neq.${userId}&select=user_id`,
      );
      const otherIds = members.map((m) => m.user_id);
      if (otherIds.length > 0) {
        const tokenRows = await db.select<{ expo_push_token: string }>(
          "push_tokens",
          `user_id=in.(${otherIds.join(",")})&select=expo_push_token`,
        );
        await sendExpoPush(
          tokenRows.map((t) => t.expo_push_token),
          {
            title: "Time to decide 🍽️",
            body: "Your group started picking where to eat. Cast your votes!",
            data: { type: "decide_session", sessionId: session.id, collectionId },
          },
        );
      }
    } catch (pushErr) {
      console.error("[start-decide-session] push send failed (ignored):", pushErr);
    }

    return jsonResponse({ session, restaurants, timeOptions: sessionTimeOptions });
  } catch (err) {
    // Log the full detail server-side; never relay raw DB/PostgREST error
    // text to the caller (it can include query/schema internals).
    console.error("[start-decide-session] unexpected error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
