// places-resolve-link: resolve a pasted Google Maps URL (including short links
// like maps.app.goo.gl/... which require following a server-side redirect) down
// to a place_id, then return the full normalized place details.
// Request:  POST { "url": string }
// Response: { "place": NormalizedPlace } | { "error": string }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { placeDetails, resolveMapsLink } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return jsonResponse({ error: "url (string) is required" }, 400);
    }
    const placeId = await resolveMapsLink(url);
    if (!placeId) {
      return jsonResponse(
        { error: "Could not resolve a place from that link" },
        404,
      );
    }
    const place = await placeDetails(placeId);
    return jsonResponse({ place });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
