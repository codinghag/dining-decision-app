// add-friend: create a mutual friendship between the caller and another
// Forked user, then push-notify them. Friendship rows are only ever written
// here (service role) — there is deliberately no client insert policy, so
// the two directions stay in lockstep (see migration 0015).
//
// Request:  POST { "friendId": string }
// Response: { "ok": true } | { "error": string }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { admin, callerUserId, isUuid, sendExpoPush } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const userId = callerUserId(req);
    if (!userId) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const { friendId } = await req.json();
    if (!isUuid(friendId)) {
      return jsonResponse({ error: "friendId (uuid) is required" }, 400);
    }
    if (friendId === userId) {
      return jsonResponse({ error: "You can't friend yourself" }, 400);
    }

    const db = admin();

    const friendProfiles = await db.select<{ id: string }>(
      "profiles",
      `id=eq.${friendId}&select=id`,
    );
    if (friendProfiles.length === 0) {
      return jsonResponse({ error: "User not found" }, 404);
    }

    // Both directions, idempotently — re-adding an existing friend is a no-op.
    await db.insert(
      "friendships",
      [
        { user_id: userId, friend_id: friendId },
        { user_id: friendId, friend_id: userId },
      ],
      {
        onConflict: "user_id,friend_id",
        prefer: "resolution=ignore-duplicates,return=minimal",
      },
    );

    // Best-effort notification to the new friend.
    try {
      const [me] = await db.select<{ display_name: string | null }>(
        "profiles",
        `id=eq.${userId}&select=display_name`,
      );
      const tokens = await db.select<{ expo_push_token: string }>(
        "push_tokens",
        `user_id=eq.${friendId}&select=expo_push_token`,
      );
      await sendExpoPush(
        tokens.map((t) => t.expo_push_token),
        {
          title: "New friend on Forked 👥",
          body: `${me?.display_name ?? "A friend"} added you — you can now invite each other to lists.`,
          data: { type: "friend_added", userId },
        },
      );
    } catch (pushErr) {
      console.error("[add-friend] push send failed (ignored):", pushErr);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[add-friend] unexpected error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
