import * as Location from "expo-location";

export interface Coords {
  lat: number;
  lng: number;
}

// Best-effort current location for biasing restaurant search results toward
// "near me". Never throws into the app flow -- a denied permission, a
// timeout, or no GPS fix just means unbiased search results, not a broken
// search. Mirrors the same never-fail pattern as lib/push.ts.
export async function getCurrentLocation(): Promise<Coords | null> {
  try {
    const { status: existing } = await Location.getForegroundPermissionsAsync();
    let status = existing;
    if (status !== "granted") {
      const req = await Location.requestForegroundPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return null;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch (err) {
    console.warn("[location] could not get current location:", err);
    return null;
  }
}
