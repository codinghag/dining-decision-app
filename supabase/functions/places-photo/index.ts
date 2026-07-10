// places-photo: image proxy for Google Place photos. Google returns a photo
// resource name (places/<id>/photos/<ref>), and turning it into actual bytes
// needs the server-side Places key. This function fetches the media with the
// key and streams it back, so the key never reaches the client.
//
// Deliberately PUBLIC (verify_jwt = false in config.toml): a plain <Image> /
// <img> tag can't send an Authorization header, so the URL has to be loadable
// unauthenticated. We validate the resource-name shape (so it can only ever
// proxy a Google place photo) and cache aggressively to limit Places Photo
// API spend.
//
// Request:  GET ?name=places/<id>/photos/<ref>&w=<width>
// Response: the image bytes (image/*), or 400/404 on bad/missing photo.
import { corsHeaders } from "../_shared/cors.ts";

const NAME_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const name = url.searchParams.get("name") ?? "";
    if (!NAME_RE.test(name)) {
      return new Response("bad photo name", { status: 400, headers: corsHeaders });
    }
    const w = parseInt(url.searchParams.get("w") ?? "400", 10);
    const width = Math.min(Math.max(Number.isFinite(w) ? w : 400, 100), 1200);

    const key = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!key) {
      return new Response("not configured", { status: 500, headers: corsHeaders });
    }

    const gUrl =
      `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${width}&key=${key}`;
    const res = await fetch(gUrl);
    if (!res.ok) {
      return new Response("photo not found", { status: 404, headers: corsHeaders });
    }

    const body = await res.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
        // Photo refs are stable; cache hard to keep Places Photo spend down.
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch (err) {
    console.error("[places-photo] error:", err);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
