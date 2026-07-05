// places-details: fetch full place details by place_id, normalized to the
// restaurants table shape.
// Request:  POST { "placeId": string }
// Response: { "place": NormalizedPlace }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { placeDetails } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { placeId } = await req.json();
    if (!placeId || typeof placeId !== "string") {
      return jsonResponse({ error: "placeId (string) is required" }, 400);
    }
    const place = await placeDetails(placeId);
    return jsonResponse({ place });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
