// Thin wrappers around the Google Places API (New) — https://places.googleapis.com/v1
// The API key is read from the Supabase secret GOOGLE_PLACES_API_KEY and never
// leaves the server. All three edge functions go through here.

const PLACES_BASE = "https://places.googleapis.com/v1";

// Shape returned to the app. Maps 1:1 onto the `restaurants` table columns.
export interface NormalizedPlace {
  google_place_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  hours: unknown | null;
}

export interface PlaceSearchResult {
  google_place_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

function apiKey(): string {
  const key = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!key) {
    throw new Error("GOOGLE_PLACES_API_KEY is not set for this function");
  }
  return key;
}

// Detail field mask — everything the restaurants table needs.
const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "internationalPhoneNumber",
  "nationalPhoneNumber",
  "websiteUri",
  "regularOpeningHours",
].join(",");

// Search field mask — lightweight list for pick-a-result UI.
const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
].join(",");

// deno-lint-ignore no-explicit-any
function normalizeDetails(p: any): NormalizedPlace {
  return {
    google_place_id: p.id,
    name: p.displayName?.text ?? "Unknown",
    address: p.formattedAddress ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    hours: p.regularOpeningHours ?? null,
  };
}

export async function placeDetails(placeId: string): Promise<NormalizedPlace> {
  const res = await fetch(
    `${PLACES_BASE}/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
    },
  );
  if (!res.ok) {
    throw new Error(`Places details failed (${res.status}): ${await res.text()}`);
  }
  return normalizeDetails(await res.json());
}

export async function searchText(
  query: string,
  maxResults = 10,
): Promise<PlaceSearchResult[]> {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": SEARCH_FIELD_MASK,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: maxResults }),
  });
  if (!res.ok) {
    throw new Error(`Places search failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  return (data.places ?? []).map((p: any) => ({
    google_place_id: p.id,
    name: p.displayName?.text ?? "Unknown",
    address: p.formattedAddress ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
  }));
}

// Resolve a pasted Google Maps URL down to a place_id.
// Short links (maps.app.goo.gl / goo.gl/maps) redirect to a full URL first, so
// we follow redirects, then try several extraction strategies on the final URL.
export async function resolveMapsLink(url: string): Promise<string | null> {
  let finalUrl = url;
  try {
    // Follow the redirect chain (short links -> canonical maps URL).
    const res = await fetch(url, { redirect: "follow" });
    finalUrl = res.url || url;
    // Drain the body so the connection can close.
    await res.text().catch(() => {});
  } catch (_e) {
    // Non-fatal: fall back to parsing the raw pasted URL.
    finalUrl = url;
  }

  // 1) Explicit place_id in the query string (?q=place_id:ChIJ... or ?place_id=...).
  const decoded = decodeURIComponent(finalUrl);
  const placeIdParam = decoded.match(/place_id[:=]([A-Za-z0-9_-]+)/);
  if (placeIdParam) return placeIdParam[1];

  // 2) A ChIJ-style token anywhere in the URL.
  const chij = decoded.match(/\b(ChIJ[A-Za-z0-9_-]{10,})\b/);
  if (chij) return chij[1];

  // 3) Fall back to text search on the place name from the /place/<name>/ path,
  //    biased by @lat,lng if present.
  const nameMatch = decoded.match(/\/place\/([^/@]+)/);
  if (nameMatch) {
    let q = nameMatch[1].replace(/\+/g, " ").trim();
    const coord = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coord) q += ` ${coord[1]},${coord[2]}`;
    const results = await searchText(q, 1);
    if (results.length > 0) return results[0].google_place_id;
  }

  return null;
}
