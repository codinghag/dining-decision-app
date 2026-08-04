// share-restaurant: send a single restaurant to one or more friends — each
// gets it added directly to their own General list (created lazily if they
// don't have one yet, mirroring lib/db.ts::getOrCreateGeneralCollection),
// plus a push notification. Restaurants are already shared/deduped rows
// (keyed by google_place_id), so there's nothing to copy — just a new
// collection_restaurants membership per recipient. Each invitee must already
// be a friend, same guard as invite-friends.
//
// Request:  POST { "restaurantId": string, "friendIds": string[] }
// Response: { "shared": number } | { "error": string }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { admin, callerUserId, isUuid, sendExpoPush } from "../_shared/supabaseAdmin.ts";

const MAX_SHARES = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const userId = callerUserId(req);
    if (!userId) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const { restaurantId, friendIds } = await req.json();
    if (!isUuid(restaurantId)) {
      return jsonResponse({ error: "restaurantId (uuid) is required" }, 400);
    }
    if (!Array.isArray(friendIds) || friendIds.length === 0) {
      return jsonResponse({ error: "friendIds (uuid[]) is required" }, 400);
    }
    const ids = [...new Set(friendIds.filter(isUuid))].slice(0, MAX_SHARES);
    if (ids.length === 0) {
      return jsonResponse({ error: "friendIds (uuid[]) is required" }, 400);
    }

    const db = admin();

    // Only actual friends can be shared with this way — strangers' UUIDs bounce.
    const friendRows = await db.select<{ friend_id: string }>(
      "friendships",
      `user_id=eq.${userId}&friend_id=in.(${ids.join(",")})&select=friend_id`,
    );
    const allowed = friendRows.map((r) => r.friend_id);
    if (allowed.length === 0) {
      return jsonResponse({ error: "No friends found in that list" }, 403);
    }

    const [restaurant] = await db.select<{ name: string }>(
      "restaurants",
      `id=eq.${restaurantId}&select=name`,
    );
    if (!restaurant) {
      return jsonResponse({ error: "Restaurant not found" }, 404);
    }

    for (const friendId of allowed) {
      const [existing] = await db.select<{ id: string }>(
        "collections",
        `owner_id=eq.${friendId}&is_general=eq.true&select=id`,
      );
      let collectionId = existing?.id;
      if (!collectionId) {
        try {
          const [inserted] = await db.insert<{ id: string }>("collections", {
            name: "General",
            owner_id: friendId,
            is_general: true,
          });
          collectionId = inserted?.id;
        } catch {
          // Lost a race with another insert of the same friend's general
          // list (idx_collections_general_per_owner) — re-select it.
          const [retry] = await db.select<{ id: string }>(
            "collections",
            `owner_id=eq.${friendId}&is_general=eq.true&select=id`,
          );
          collectionId = retry?.id;
        }
      }
      if (!collectionId) continue;

      await db.insert(
        "collection_restaurants",
        { collection_id: collectionId, restaurant_id: restaurantId, added_by: userId },
        {
          onConflict: "collection_id,restaurant_id",
          prefer: "resolution=ignore-duplicates,return=minimal",
        },
      );
    }

    // Best-effort notification to everyone shared with.
    try {
      const [me] = await db.select<{ display_name: string | null }>(
        "profiles",
        `id=eq.${userId}&select=display_name`,
      );
      const tokens = await db.select<{ expo_push_token: string }>(
        "push_tokens",
        `user_id=in.(${allowed.join(",")})&select=expo_push_token`,
      );
      await sendExpoPush(
        tokens.map((t) => t.expo_push_token),
        {
          title: "New spot for you 🍽️",
          body: `${me?.display_name ?? "A friend"} shared "${restaurant.name}" with you on Forked.`,
          data: { type: "restaurant_shared", restaurantId },
        },
      );
    } catch (pushErr) {
      console.error("[share-restaurant] push send failed (ignored):", pushErr);
    }

    return jsonResponse({ shared: allowed.length });
  } catch (err) {
    console.error("[share-restaurant] unexpected error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
