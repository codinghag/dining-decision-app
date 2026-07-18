// match-contacts: which of these email addresses already have a Forked
// account? Backs the find-friends flow. Device contacts stay on-device —
// the app sends only email addresses, they're matched in memory via the
// service-role-only match_users_by_email function, and nothing is stored.
//
// Request:  POST { "emails": string[] }
// Response: { "matches": [{ "userId", "email", "displayName" }] }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { admin, callerUserId } from "../_shared/supabaseAdmin.ts";

const MAX_EMAILS = 1000;
const EMAIL_RE = /.+@.+\..+/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const userId = callerUserId(req);
    if (!userId) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const { emails } = await req.json();
    if (!Array.isArray(emails) || emails.length === 0) {
      return jsonResponse({ error: "emails (string[]) is required" }, 400);
    }
    const cleaned = [
      ...new Set(
        emails
          .filter((e): e is string => typeof e === "string" && EMAIL_RE.test(e))
          .map((e) => e.trim().toLowerCase()),
      ),
    ].slice(0, MAX_EMAILS);
    if (cleaned.length === 0) {
      return jsonResponse({ matches: [] });
    }

    const db = admin();
    const users = await db.rpc<{ id: string; email: string }[]>(
      "match_users_by_email",
      { p_emails: cleaned },
    );
    const others = users.filter((u) => u.id !== userId);
    if (others.length === 0) {
      return jsonResponse({ matches: [] });
    }

    const profiles = await db.select<{ id: string; display_name: string | null }>(
      "profiles",
      `id=in.(${others.map((u) => u.id).join(",")})&select=id,display_name`,
    );
    const nameById = new Map(profiles.map((p) => [p.id, p.display_name]));

    return jsonResponse({
      matches: others.map((u) => ({
        userId: u.id,
        email: u.email,
        displayName: nameById.get(u.id) ?? null,
      })),
    });
  } catch (err) {
    console.error("[match-contacts] unexpected error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
