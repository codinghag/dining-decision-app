import { Image } from "react-native";
import { photoUrl } from "../lib/photo";
import { radius, themedStyles, useTheme } from "../lib/theme";

interface RestaurantPhotoProps {
  photoName: string | null;
  variant?: "thumb" | "hero";
}

// Renders a restaurant photo (via the places-photo proxy) as a small square
// thumbnail or a wide hero. Renders nothing when there's no photo, so cards
// gracefully fall back to text-only. Decorative — the restaurant name is
// always adjacent text, so screen readers skip the image itself.
export function RestaurantPhoto({ photoName, variant = "thumb" }: RestaurantPhotoProps) {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  const uri = photoUrl(photoName, variant === "hero" ? 800 : 200);
  if (!uri) return null;
  return (
    <Image
      source={{ uri }}
      style={variant === "hero" ? styles.hero : styles.thumb}
      resizeMode="cover"
      accessible={false}
      importantForAccessibility="no"
    />
  );
}

const themed = themedStyles((colors) => ({
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  hero: {
    width: "100%" as const,
    height: 180,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
}));
