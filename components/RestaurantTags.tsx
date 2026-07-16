import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { CuisineBadge } from "./CuisineBadge";
import { PriceBadge } from "./PriceBadge";
import { radius, spacing, themedStyles, useTheme } from "../lib/theme";

interface RestaurantTagsProps {
  cuisine?: string | null;
  priceLevel?: number | null;
  rating?: number | null;
  ratingCount?: number | null;
  openNow?: boolean | null; // caller computes via lib/hours isOpenNow
  style?: StyleProp<ViewStyle>;
}

// Combined cuisine + price + rating + open/closed row, reused everywhere a
// restaurant is shown so the treatment stays consistent in one place.
export function RestaurantTags({
  cuisine,
  priceLevel,
  rating,
  ratingCount,
  openNow,
  style,
}: RestaurantTagsProps) {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  if (!cuisine && !priceLevel && !rating && openNow == null) return null;
  return (
    <View style={[styles.row, style]}>
      {cuisine ? <CuisineBadge cuisine={cuisine} /> : null}
      {priceLevel ? <PriceBadge level={priceLevel} /> : null}
      {rating ? (
        <View
          style={styles.rating}
          accessibilityLabel={`Rated ${rating.toFixed(1)} stars${
            ratingCount ? ` from ${ratingCount} reviews` : ""
          }`}
        >
          <Text style={styles.ratingText}>
            ★ {rating.toFixed(1)}
            {ratingCount ? (
              <Text style={styles.ratingCount}> ({formatCount(ratingCount)})</Text>
            ) : null}
          </Text>
        </View>
      ) : null}
      {openNow != null ? (
        <View style={[styles.pill, openNow ? styles.openYes : styles.openNo]}>
          <Text style={[styles.pillText, openNow ? styles.openYesText : styles.openNoText]}>
            {openNow ? "Open now" : "Closed"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

const themed = themedStyles((colors, type) => ({
  row: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: spacing.xs,
    alignItems: "center" as const,
  },
  rating: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ratingText: { ...type.label, color: colors.ink },
  ratingCount: { ...type.label, color: colors.inkTertiary, fontWeight: "400" as const },
  pill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillText: { ...type.label },
  openYes: { backgroundColor: colors.yesLight },
  openYesText: { color: colors.yes },
  openNo: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  openNoText: { color: colors.inkTertiary },
}));
