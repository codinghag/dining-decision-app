// match-contacts: which of these contacts (by email or phone) already have a
// Forked account? Backs the find-friends flow. Device contacts stay
// on-device — the app sends only email addresses and phone numbers, they're
// matched in memory via two service-role-only SQL functions
// (match_users_by_email, match_users_by_phone), and nothing is stored.
//
// Request:  POST { "emails"?: string[], "phones"?: string[] }
// Response: { "matches": [{ "userId", "email"?, "phone"?, "displayName" }] }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { admin, callerUserId } from "../_shared/supabaseAdmin.ts";

const MAX_CONTACTS = 1000;
const EMAIL_RE = /.+@.+\..+/;

// Mirrors lib/phone.ts's normalizePhone — duplicated because edge functions
// (Deno) can't import from the Expo app's lib/ tree.
function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length < 7) return null;
  return digits;
}

interface Match {
  userId: string;
  email?: string;
  phone?: string;
  displayName: string | null;
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

    const { emails, phones } = await req.json();
    const cleanedEmails = [
      ...new Set(
        (Array.isArray(emails) ? emails : [])
          .filter((e: unknown): e is string => typeof e === "string" && EMAIL_RE.test(e))
          .map((e: string) => e.trim().toLowerCase()),
      ),
    ].slice(0, MAX_CONTACTS);
    const cleanedPhones = [
      ...new Set(
        (Array.isArray(phones) ? phones : [])
          .filter((p: unknown): p is string => typeof p === "string")
          .map(normalizePhone)
          .filter((p: string | null): p is string => p != null),
      ),
    ].slice(0, MAX_CONTACTS);

    if (cleanedEmails.length === 0 && cleanedPhones.length === 0) {
      return jsonResponse({ error: "emails or phones is required" }, 400);
    }

    const db = admin();
    const byId = new Map<string, Match>();

    if (cleanedEmails.length > 0) {
      const users = await db.rpc<{ id: string; email: string }[]>(
        "match_users_by_email",
        { p_emails: cleanedEmails },
      );
      for (const u of users) {
        if (u.id === userId) continue;
        byId.set(u.id, { ...byId.get(u.id), userId: u.id, email: u.email, displayName: null });
      }
    }
    if (cleanedPhones.length > 0) {
      const users = await db.rpc<{ id: string; phone: string }[]>(
        "match_users_by_phone",
        { p_phones: cleanedPhones },
      );
      for (const u of users) {
        if (u.id === userId) continue;
        byId.set(u.id, { ...byId.get(u.id), userId: u.id, phone: u.phone, displayName: null });
      }
    }

    if (byId.size === 0) {
      return jsonResponse({ matches: [] });
    }

    const ids = [...byId.keys()];
    const profiles = await db.select<{ id: string; display_name: string | null }>(
      "profiles",
      `id=in.(${ids.join(",")})&select=id,display_name`,
    );
    const nameById = new Map(profiles.map((p) => [p.id, p.display_name]));

    return jsonResponse({
      matches: ids.map((id) => ({
        ...byId.get(id)!,
        displayName: nameById.get(id) ?? null,
      })),
    });
  } catch (err) {
    console.error("[match-contacts] unexpected error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
