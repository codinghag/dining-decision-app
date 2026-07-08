import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { CuisineBadge } from "./CuisineBadge";
import { PriceBadge } from "./PriceBadge";
import { spacing } from "../lib/theme";

interface RestaurantTagsProps {
  cuisine?: string | null;
  priceLevel?: number | null;
  style?: StyleProp<ViewStyle>;
}

// Combined cuisine + price row, reused everywhere a restaurant is shown
// (search/import results, collection cards, the Decide swipe card) so any
// future change to how these read together happens in one place.
export function RestaurantTags({ cuisine, priceLevel, style }: RestaurantTagsProps) {
  if (!cuisine && !priceLevel) return null;
  return (
    <View style={[styles.row, style]}>
      {cuisine ? <CuisineBadge cuisine={cuisine} /> : null}
      {priceLevel ? <PriceBadge level={priceLevel} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.xs, alignItems: "center" },
});
