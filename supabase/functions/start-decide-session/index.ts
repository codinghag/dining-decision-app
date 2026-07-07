// start-decide-session: a member taps "Let's Decide". We (service role):
//   1. verify the caller is a member of the collection,
//   2. reuse an existing active session for this collection if one exists,
//   3. otherwise pick a random 3 restaurant ids from the collection (or all if
//      <= 3) and insert the decide_sessions row (status 'active'), backstopped
//      by a unique index (see 0004_phase2_fixes.sql) against the concurrent
//      double-tap race,
//   4. best-effort push all OTHER members via Expo ("Time to decide where to eat"),
//   5. return the session PLUS the chosen restaurants' details, so the client
//      can render the swipe deck without a second round trip.
//
// Request:  POST { "collectionId": string }
// Response: { "session": DecideSession, "restaurants": Restaurant[] } | { "error": string }
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

// Fisher–Yates shuffle, then take the first n.
function sample<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
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

    const { collectionId } = await req.json();
    if (!isUuid(collectionId)) {
      return jsonResponse({ error: "collectionId (uuid) is required" }, 400);
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
      const restaurants = await db.select<Restaurant>(
        "restaurants",
        `id=in.(${ids.join(",")})&select=${restaurantSelect}`,
      );
      return jsonResponse({ session, restaurants });
    }

    // 3. Random sample of restaurant ids from the collection.
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
    const chosenIds = sample(allIds, Math.min(3, allIds.length));

    // 4. Create the session. A unique partial index on decide_sessions
    // (collection_id) where status='active' backstops the race between our
    // check above and this insert — if another request won that race, fetch
    // and return their session instead of failing.
    let session: Record<string, unknown>;
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

    return jsonResponse({ session, restaurants });
  } catch (err) {
    // Log the full detail server-side; never relay raw DB/PostgREST error
    // text to the caller (it can include query/schema internals).
    console.error("[start-decide-session] unexpected error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
