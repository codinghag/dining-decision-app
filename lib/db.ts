import { getUserId, supabase } from "./supabase";
import { logEvent } from "./analytics";
import type { Place } from "./places";

export interface Collection {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface Restaurant {
  id: string;
  google_place_id: string | null;
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
  source_url: string | null;
  source_platform: "instagram" | "tiktok" | null;
  created_by: string | null;
  created_at: string;
}

// The user's collections (RLS scopes this to collections they are a member of).
export async function listCollections(): Promise<Collection[]> {
  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Collection[];
}

export async function getCollection(id: string): Promise<Collection | null> {
  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Collection | null;
}

// Create a collection owned by the current user. The DB trigger inserts the
// owner membership row automatically.
export async function createCollection(name: string): Promise<Collection> {
  const userId = await getUserId();
  if (!userId) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("collections")
    .insert({ name, owner_id: userId })
    .select("*")
    .single();
  if (error) throw error;
  await logEvent("collection_created", { collection_id: data.id });
  return data as Collection;
}

// Owner-only (enforced by RLS — collections_delete_owner). Cascades to
// collection_members, collection_restaurants, and decide_sessions/votes,
// which all reference collections(id) on delete cascade.
export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) throw error;
  await logEvent("collection_deleted", { collection_id: id });
}

// Remove a single restaurant from a collection (deletes only the join row;
// the shared restaurants row is left for any other collections). Any member
// may remove one — enforced by RLS (collection_restaurants_delete).
export async function removeRestaurantFromCollection(
  collectionId: string,
  restaurantId: string,
): Promise<void> {
  const { error } = await supabase
    .from("collection_restaurants")
    .delete()
    .eq("collection_id", collectionId)
    .eq("restaurant_id", restaurantId);
  if (error) throw error;
  await logEvent("restaurant_removed", {
    collection_id: collectionId,
    restaurant_id: restaurantId,
  });
}

// Restaurants in a collection, resolved through the join table.
export async function listCollectionRestaurants(
  collectionId: string,
): Promise<Restaurant[]> {
  const { data, error } = await supabase
    .from("collection_restaurants")
    .select("restaurant:restaurants(*)")
    .eq("collection_id", collectionId)
    .order("added_at", { ascending: false });
  if (error) throw error;
  // Without generated DB types, supabase types the embedded relation loosely
  // (as an array). Normalize: an embedded to-one join is either an object or a
  // single-element array depending on inference.
  const rows = (data ?? []) as unknown as {
    restaurant: Restaurant | Restaurant[] | null;
  }[];
  return rows
    .map((row) =>
      Array.isArray(row.restaurant) ? row.restaurant[0] ?? null : row.restaurant,
    )
    .filter((r): r is Restaurant => r != null);
}

export type CaptureMethod = "link" | "search" | "quick_add" | "social_import";

export interface SocialSource {
  source_url: string;
  source_platform: "instagram" | "tiktok";
}

// Ensure a restaurants row exists for this place (dedupe on google_place_id
// when present) and return it, WITHOUT linking it to any collection. Used both
// by the capture flow and by the wildcard (a surprise restaurant that appears
// in a Decide deck but is deliberately not saved to the collection).
export async function ensureRestaurant(
  place: Partial<Place> & { name: string },
  social?: SocialSource,
): Promise<Restaurant> {
  const userId = await getUserId();
  if (!userId) throw new Error("Not signed in");

  // Reuse an existing restaurant row when we have a place id (many-to-many:
  // the same restaurant can appear in multiple collections).
  if (place.google_place_id) {
    const { data: existing, error: findErr } = await supabase
      .from("restaurants")
      .select("*")
      .eq("google_place_id", place.google_place_id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (existing) return existing as Restaurant;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("restaurants")
    .insert({
      google_place_id: place.google_place_id ?? null,
      name: place.name,
      address: place.address ?? null,
      lat: place.lat ?? null,
      lng: place.lng ?? null,
      phone: place.phone ?? null,
      website: place.website ?? null,
      hours: place.hours ?? null,
      cuisine: place.cuisine ?? null,
      price_level: place.price_level ?? null,
      rating: place.rating ?? null,
      rating_count: place.rating_count ?? null,
      utc_offset_minutes: place.utc_offset_minutes ?? null,
      photo_name: place.photo_name ?? null,
      source_url: social?.source_url ?? null,
      source_platform: social?.source_platform ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (insErr) throw insErr;
  return inserted as Restaurant;
}

// Upsert a restaurant (dedupe on google_place_id when present) and link it into
// the collection, then log the capture event. Shared by all capture flows.
export async function saveRestaurantToCollection(
  collectionId: string,
  place: Partial<Place> & { name: string },
  method: CaptureMethod,
  social?: SocialSource,
): Promise<Restaurant> {
  const userId = await getUserId();
  if (!userId) throw new Error("Not signed in");

  const restaurant = await ensureRestaurant(place, social);

  const { error: linkErr } = await supabase
    .from("collection_restaurants")
    .upsert(
      {
        collection_id: collectionId,
        restaurant_id: restaurant.id,
        added_by: userId,
      },
      { onConflict: "collection_id,restaurant_id", ignoreDuplicates: true },
    );
  if (linkErr) throw linkErr;

  await logEvent("restaurant_saved", {
    method,
    collection_id: collectionId,
    restaurant_id: restaurant.id,
    google_place_id: restaurant.google_place_id,
    source_platform: social?.source_platform ?? null,
  });

  return restaurant;
}
