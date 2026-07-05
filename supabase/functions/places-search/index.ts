// places-search: text search / autocomplete for the manual "search by name" flow.
// Request:  POST { "query": string, "maxResults"?: number }
// Response: { "results": PlaceSearchResult[] }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { searchText } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { query, maxResults } = await req.json();
    if (!query || typeof query !== "string") {
      return jsonResponse({ error: "query (string) is required" }, 400);
    }
    const results = await searchText(query, maxResults ?? 10);
    return jsonResponse({ results });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
