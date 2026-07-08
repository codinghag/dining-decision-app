import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, spacing, type } from "../lib/theme";

interface PriceBadgeProps {
  level: number; // 1-4, maps to $ .. $$$$
  style?: StyleProp<ViewStyle>;
}

// Neutral gray tone (vs. CuisineBadge's coral) -- a price tier isn't a
// category the same way cuisine is, so it reads better visually distinct.
export function PriceBadge({ level, style }: PriceBadgeProps) {
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.text}>{"$".repeat(Math.max(1, Math.min(4, level)))}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  text: { ...type.label, color: colors.inkSecondary },
});
