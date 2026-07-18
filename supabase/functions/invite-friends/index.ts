// invite-friends: add the caller's friends directly into a list (the in-app
// alternative to sharing the link by text), then push-notify them. The
// caller must be a member of the collection, and each invitee must already
// be a friend — membership rows insert idempotently with role='member',
// mirroring join-collection's guarantee that this is the only controlled
// path (besides the join link) that writes memberships.
//
// Request:  POST { "collectionId": string, "friendIds": string[] }
// Response: { "invited": number } | { "error": string }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { admin, callerUserId, isUuid, sendExpoPush } from "../_shared/supabaseAdmin.ts";

const MAX_INVITES = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const userId = callerUserId(req);
    if (!userId) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const { collectionId, friendIds } = await req.json();
    if (!isUuid(collectionId)) {
      return jsonResponse({ error: "collectionId (uuid) is required" }, 400);
    }
    if (!Array.isArray(friendIds) || friendIds.length === 0) {
      return jsonResponse({ error: "friendIds (uuid[]) is required" }, 400);
    }
    const ids = [...new Set(friendIds.filter(isUuid))].slice(0, MAX_INVITES);
    if (ids.length === 0) {
      return jsonResponse({ error: "friendIds (uuid[]) is required" }, 400);
    }

    const db = admin();

    const isMember = await db.rpc<boolean>("is_collection_member", {
      cid: collectionId,
      uid: userId,
    });
    if (!isMember) {
      return jsonResponse({ error: "Not a member of this collection" }, 403);
    }

    // Only actual friends can be invited this way — strangers' UUIDs bounce.
    const friendRows = await db.select<{ friend_id: string }>(
      "friendships",
      `user_id=eq.${userId}&friend_id=in.(${ids.join(",")})&select=friend_id`,
    );
    const allowed = friendRows.map((r) => r.friend_id);
    if (allowed.length === 0) {
      return jsonResponse({ error: "No friends found in that list" }, 403);
    }

    await db.insert(
      "collection_members",
      allowed.map((fid) => ({
        collection_id: collectionId,
        user_id: fid,
        role: "member",
      })),
      {
        onConflict: "collection_id,user_id",
        prefer: "resolution=ignore-duplicates,return=minimal",
      },
    );

    // Best-effort notification to everyone invited.
    try {
      const [coll] = await db.select<{ name: string }>(
        "collections",
        `id=eq.${collectionId}&select=name`,
      );
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
          title: "You're in 🍽️",
          body: `${me?.display_name ?? "A friend"} added you to "${coll?.name ?? "a list"}" on Forked.`,
          data: { type: "collection_invite", collectionId },
        },
      );
    } catch (pushErr) {
      console.error("[invite-friends] push send failed (ignored):", pushErr);
    }

    return jsonResponse({ invited: allowed.length });
  } catch (err) {
    console.error("[invite-friends] unexpected error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
