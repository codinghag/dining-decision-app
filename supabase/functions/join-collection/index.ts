// join-collection: the controlled gate for accepting a Collection invite link.
// A Collection's shareable link carries its collection_id (an unguessable UUID
// which IS the invite token). Opening the link calls this function with the
// visitor's own JWT; we upsert them as a role='member' row.
//
// This is an edge function (service role) rather than a client-side insert
// because there is deliberately NO RLS policy letting a non-member insert their
// own collection_members row (arbitrary self-inserts would let anyone claim any
// role, e.g. 'owner'). This function is the single, controlled entry point:
// it only ever writes role='member', and it is idempotent (re-opening the link
// is a no-op), so it is safe to expose to any signed-in (anonymous) user.
//
// Request:  POST { "collectionId": string }
// Response: { "collection": { "id": string, "name": string } } | { "error": string }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { admin, callerUserId, isUuid } from "../_shared/supabaseAdmin.ts";

interface CollectionRow {
  id: string;
  name: string;
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

    // Validate the collection exists (and grab its name to confirm to the joiner).
    const collections = await db.select<CollectionRow>(
      "collections",
      `id=eq.${collectionId}&select=id,name`,
    );
    if (collections.length === 0) {
      return jsonResponse({ error: "Collection not found" }, 404);
    }

    // Idempotent membership upsert. on_conflict do nothing => re-opening the
    // link (or the owner opening their own link) is a harmless no-op.
    await db.insert(
      "collection_members",
      { collection_id: collectionId, user_id: userId, role: "member" },
      {
        onConflict: "collection_id,user_id",
        prefer: "resolution=ignore-duplicates,return=minimal",
      },
    );

    return jsonResponse({ collection: collections[0] });
  } catch (err) {
    // Log the full detail server-side; never relay raw DB/PostgREST error
    // text to the caller (it can include query/schema internals).
    console.error("[join-collection] unexpected error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
