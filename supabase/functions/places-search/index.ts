// places-search: text search / autocomplete for the manual "search by name" flow.
// Request:  POST { "query": string, "maxResults"?: number, "lat"?: number, "lng"?: number }
// Response: { "results": PlaceSearchResult[] }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { searchText } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { query, maxResults, lat, lng } = await req.json();
    if (!query || typeof query !== "string") {
      return jsonResponse({ error: "query (string) is required" }, 400);
    }
    // lat/lng are an optional best-effort bias from the client's device
    // location -- malformed values are just ignored rather than rejected,
    // since a bad bias should degrade to "unbiased search", not fail the
    // whole request.
    const location =
      typeof lat === "number" && typeof lng === "number" ? { lat, lng } : undefined;
    const results = await searchText(query, maxResults ?? 10, location);
    return jsonResponse({ results });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
