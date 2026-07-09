// Builds a cross-platform Google Maps URL for a restaurant. The
// maps.google.com "search" URL opens the Maps app on iOS/Android (both
// register the domain) and the web map in a browser, so one URL covers all
// platforms without native map-scheme handling. query_place_id pins the exact
// place when we have it, so it lands on the right venue rather than a text guess.
export function buildMapsUrl(r: {
  name: string;
  address: string | null;
  google_place_id: string | null;
}): string {
  const query = encodeURIComponent(r.address ? `${r.name}, ${r.address}` : r.name);
  let url = `https://www.google.com/maps/search/?api=1&query=${query}`;
  if (r.google_place_id) {
    url += `&query_place_id=${encodeURIComponent(r.google_place_id)}`;
  }
  return url;
}
