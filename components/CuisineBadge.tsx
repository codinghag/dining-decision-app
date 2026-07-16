import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { radius, spacing, themedStyles, useTheme } from "../lib/theme";

interface CuisineBadgeProps {
  cuisine: string;
  style?: StyleProp<ViewStyle>;
}

export function CuisineBadge({ cuisine, style }: CuisineBadgeProps) {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.text}>{cuisine}</Text>
    </View>
  );
}

const themed = themedStyles((colors, type) => ({
  badge: {
    alignSelf: "flex-start" as const,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  text: { ...type.label, color: colors.primaryDark },
}));
