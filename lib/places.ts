import { supabase } from "./supabase";

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
}

export interface PlaceSearchResult {
  google_place_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

// Thin wrappers around the three Supabase Edge Functions. The app never talks
// to Google directly — the Places API key lives only as a server-side secret.

export async function searchPlaces(
  query: string,
): Promise<PlaceSearchResult[]> {
  const { data, error } = await supabase.functions.invoke("places-search", {
    body: { query },
  });
  if (error) throw error;
  return (data?.results ?? []) as PlaceSearchResult[];
}

export async function getPlaceDetails(placeId: string): Promise<Place> {
  const { data, error } = await supabase.functions.invoke("places-details", {
    body: { placeId },
  });
  if (error) throw error;
  return data.place as Place;
}

export async function resolveMapsLink(url: string): Promise<Place> {
  const { data, error } = await supabase.functions.invoke(
    "places-resolve-link",
    { body: { url } },
  );
  if (error) throw error;
  return data.place as Place;
}
