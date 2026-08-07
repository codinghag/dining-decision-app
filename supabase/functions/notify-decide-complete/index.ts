// notify-decide-complete: best-effort push once a decide session finishes,
// telling everyone but the finisher what the group picked. Called by the
// client right after completeSession() (the complete_decide_session RPC)
// succeeds -- kept as a separate step rather than folded into that RPC so
// its carefully race-proofed idempotency stays untouched.
//
// Multiple members' clients can all detect completion at once (e.g. the 60s
// auto-timer expiring while several people are on the screen) and all call
// this -- notified_at is claimed atomically (UPDATE ... WHERE notified_at IS
// NULL) so only the first caller actually sends a push.
//
// Request:  POST { "sessionId": string }
// Response: { "notified": boolean } | { "error": string }
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

    const { sessionId } = await req.json();
    if (!isUuid(sessionId)) {
      return jsonResponse({ error: "sessionId (uuid) is required" }, 400);
    }

    const db = admin();

    const [session] = await db.select<{ collection_id: string }>(
      "decide_sessions",
      `id=eq.${sessionId}&select=collection_id`,
    );
    if (!session) {
      return jsonResponse({ error: "Session not found" }, 404);
    }

    const isMember = await db.rpc<boolean>("is_collection_member", {
      cid: session.collection_id,
      uid: userId,
    });
    if (!isMember) {
      return jsonResponse({ error: "Not a member of this collection" }, 403);
    }

    // Atomic claim: only the first caller to reach here for this session
    // gets a non-empty result back.
    const claimed = await db.update<{
      id: string;
      collection_id: string;
      winner_restaurant_id: string | null;
      winner_time_option_id: string | null;
    }>(
      "decide_sessions",
      `id=eq.${sessionId}&status=eq.completed&notified_at=is.null`,
      { notified_at: new Date().toISOString() },
    );
    if (claimed.length === 0) {
      return jsonResponse({ notified: false });
    }
    const won = claimed[0];

    try {
      const [winner] = won.winner_restaurant_id
        ? await db.select<{ name: string }>(
            "restaurants",
            `id=eq.${won.winner_restaurant_id}&select=name`,
          )
        : [];
      const [winnerTime] = won.winner_time_option_id
        ? await db.select<{ starts_at: string }>(
            "decide_time_options",
            `id=eq.${won.winner_time_option_id}&select=starts_at`,
          )
        : [];

      const members = await db.select<{ user_id: string }>(
        "collection_members",
        `collection_id=eq.${won.collection_id}&user_id=neq.${userId}&select=user_id`,
      );
      const otherIds = members.map((m) => m.user_id);
      if (otherIds.length > 0) {
        const tokens = await db.select<{ expo_push_token: string }>(
          "push_tokens",
          `user_id=in.(${otherIds.join(",")})&select=expo_push_token`,
        );
        const when = winnerTime
          ? ` at ${
              new Date(winnerTime.starts_at).toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            }`
          : "";
        await sendExpoPush(
          tokens.map((t) => t.expo_push_token),
          {
            title: "Your group decided! 🎉",
            body: `${winner?.name ?? "A restaurant"} won${when} — tap to see the result.`,
            data: {
              type: "decide_complete",
              sessionId,
              collectionId: won.collection_id,
            },
          },
        );
      }
    } catch (pushErr) {
      console.error("[notify-decide-complete] push send failed (ignored):", pushErr);
    }

    return jsonResponse({ notified: true });
  } catch (err) {
    console.error("[notify-decide-complete] unexpected error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
