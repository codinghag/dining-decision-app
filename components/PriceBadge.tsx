import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { radius, spacing, themedStyles, useTheme } from "../lib/theme";

interface PriceBadgeProps {
  level: number; // 1-4, maps to $ .. $$$$
  style?: StyleProp<ViewStyle>;
}

// Neutral gray tone (vs. CuisineBadge's coral) -- a price tier isn't a
// category the same way cuisine is, so it reads better visually distinct.
export function PriceBadge({ level, style }: PriceBadgeProps) {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  const clamped = Math.max(1, Math.min(4, level));
  return (
    <View
      style={[styles.badge, style]}
      accessibilityLabel={`Price level ${clamped} of 4`}
    >
      <Text style={styles.text}>{"$".repeat(clamped)}</Text>
    </View>
  );
}

const themed = themedStyles((colors, type) => ({
  badge: {
    alignSelf: "flex-start" as const,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  text: { ...type.label, color: colors.inkSecondary },
}));
