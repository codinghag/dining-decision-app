// Shared helpers for the Phase 2 edge functions (join-collection,
// start-decide-session). These functions run with verify_jwt = true, so the
// Supabase gateway has already validated the caller's JWT before we run. We
// then act with the SERVICE ROLE key to perform controlled, RLS-bypassing
// writes (joining a collection, creating a session) that a plain client is
// deliberately not allowed to do directly.
//
// Kept as thin fetch wrappers around PostgREST rather than pulling in the
// supabase-js SDK — same dependency-light style as _shared/google.ts.

// Query strings below are built by raw template-literal interpolation (see
// admin().select), so any id embedded in one must be validated as a UUID
// first — an unvalidated string could otherwise inject extra PostgREST query
// parameters. Callers must check this before using a request-body id as a
// filter value.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is not set for this function`);
  return v;
}

// The Supabase runtime injects these into every deployed function.
export function serviceConfig(): { url: string; key: string } {
  return {
    url: env("SUPABASE_URL"),
    key: env("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

// Decode the caller's user id (the `sub` claim) from the bearer token. The
// gateway already cryptographically verified the token (verify_jwt = true), so
// we only need to read the payload — no signature check required here.
export function callerUserId(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    // base64url -> base64 -> JSON
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = JSON.parse(atob(b64 + pad));
    return typeof json.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}

// Minimal PostgREST client bound to the service role key.
export function admin() {
  const { url, key } = serviceConfig();
  const base = `${url}/rest/v1`;
  const headers = (extra: Record<string, string> = {}) => ({
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  });

  return {
    // GET rows: `from('collections', 'id=eq.<uuid>&select=id,name')`
    async select<T = unknown>(table: string, query: string): Promise<T[]> {
      const res = await fetch(`${base}/${table}?${query}`, {
        headers: headers(),
      });
      if (!res.ok) {
        throw new Error(`select ${table} failed (${res.status}): ${await res.text()}`);
      }
      return (await res.json()) as T[];
    },

    // INSERT rows. `prefer` controls conflict handling / representation.
    async insert<T = unknown>(
      table: string,
      rows: unknown,
      opts: { onConflict?: string; prefer?: string } = {},
    ): Promise<T[]> {
      const q = opts.onConflict ? `?on_conflict=${opts.onConflict}` : "";
      const res = await fetch(`${base}/${table}${q}`, {
        method: "POST",
        headers: headers({ Prefer: opts.prefer ?? "return=representation" }),
        body: JSON.stringify(rows),
      });
      if (!res.ok) {
        throw new Error(`insert ${table} failed (${res.status}): ${await res.text()}`);
      }
      const text = await res.text();
      return text ? (JSON.parse(text) as T[]) : [];
    },

    // Call a Postgres function via PostgREST's /rpc endpoint. Prefer this
    // over hand-rolling a query for anything that already has a SQL helper
    // (e.g. is_collection_member) so the authorization rule lives in exactly
    // one place instead of drifting between SQL and TypeScript copies.
    async rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
      const res = await fetch(`${base}/rpc/${fn}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        throw new Error(`rpc ${fn} failed (${res.status}): ${await res.text()}`);
      }
      return (await res.json()) as T;
    },
  };
}

// Fire an Expo push to a set of tokens. Best-effort: callers should not fail
// their whole request if this throws. No secret required — Expo's push service
// is a plain HTTPS POST.
export async function sendExpoPush(
  tokens: string[],
  message: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  const valid = tokens.filter((t) => t && t.startsWith("ExponentPushToken"));
  if (valid.length === 0) return;
  const payload = valid.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: "default",
  }));
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
}
