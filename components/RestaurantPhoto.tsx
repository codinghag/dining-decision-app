import { Image, StyleSheet } from "react-native";
import { photoUrl } from "../lib/photo";
import { colors, radius } from "../lib/theme";

interface RestaurantPhotoProps {
  photoName: string | null;
  variant?: "thumb" | "hero";
}

// Renders a restaurant photo (via the places-photo proxy) as a small square
// thumbnail or a wide hero. Renders nothing when there's no photo, so cards
// gracefully fall back to text-only.
export function RestaurantPhoto({ photoName, variant = "thumb" }: RestaurantPhotoProps) {
  const uri = photoUrl(photoName, variant === "hero" ? 800 : 200);
  if (!uri) return null;
  return (
    <Image
      source={{ uri }}
      style={variant === "hero" ? styles.hero : styles.thumb}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  hero: {
    width: "100%",
    height: 140,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
