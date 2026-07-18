import { invokeEdgeFunction } from "./supabase";
import type { Coords } from "./location";

// Normalized place shape returned by the edge functions. Maps onto the
// restaurants table columns.
export interface Place {
  google_place_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  hours: unknown | null;
  cuisine: string | null;
  price_level: number | null;
  rating: number | null;
  rating_count: number | null;
  utc_offset_minutes: number | null;
  photo_name: string | null;
  reservable: boolean | null;
}

export interface PlaceSearchResult {
  google_place_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  cuisine: string | null;
  price_level: number | null;
  rating: number | null;
  rating_count: number | null;
}

// Thin wrappers around the three Supabase Edge Functions. The app never talks
// to Google directly — the Places API key lives only as a server-side secret.
// All go through invokeEdgeFunction so the server's real error message (e.g.
// "Could not resolve that link") surfaces instead of supabase-js's generic
// "Edge Function returned a non-2xx status code".

// `near` optionally biases results toward the given coordinates (see
// lib/location.ts) -- purely additive, search still works without it.
export async function searchPlaces(
  query: string,
  near?: Coords,
): Promise<PlaceSearchResult[]> {
  const data = await invokeEdgeFunction<{ results?: PlaceSearchResult[] }>(
    "places-search",
    { query, lat: near?.lat, lng: near?.lng },
  );
  return data?.results ?? [];
}

export async function getPlaceDetails(placeId: string): Promise<Place> {
  const data = await invokeEdgeFunction<{ place: Place }>("places-details", {
    placeId,
  });
  return data.place;
}

export async function resolveMapsLink(url: string): Promise<Place> {
  const data = await invokeEdgeFunction<{ place: Place }>(
    "places-resolve-link",
    { url },
  );
  return data.place;
}
