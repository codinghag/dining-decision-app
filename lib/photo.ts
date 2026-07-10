const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

// Builds the URL for a restaurant photo, served through the public
// places-photo proxy edge function (which fetches it from Google with the
// server-side key). Returns null when there's no photo, so callers render
// nothing rather than a broken image.
export function photoUrl(photoName: string | null, width = 400): string | null {
  if (!photoName || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/functions/v1/places-photo?name=${encodeURIComponent(photoName)}&w=${width}`;
}
