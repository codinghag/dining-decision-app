import { getPlaceDetails, searchPlaces, type Place } from "./places";
import type { Coords } from "./location";

// Picks a random nearby restaurant from Google that ISN'T already in the
// collection -- the "try somewhere new" surprise for a Decide session.
// Returns null (caller proceeds without a wildcard) if there's no usable
// candidate, so a missing wildcard never blocks starting a session.
export async function pickWildcardPlace(
  near: Coords,
  excludePlaceIds: string[],
): Promise<Place | null> {
  const results = await searchPlaces("restaurant", near);
  const exclude = new Set(excludePlaceIds);
  const candidates = results.filter((r) => !exclude.has(r.google_place_id));
  if (candidates.length === 0) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return getPlaceDetails(pick.google_place_id);
}
