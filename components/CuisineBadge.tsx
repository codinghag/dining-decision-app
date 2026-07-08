import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, spacing, type } from "../lib/theme";

interface CuisineBadgeProps {
  cuisine: string;
  style?: StyleProp<ViewStyle>;
}

export function CuisineBadge({ cuisine, style }: CuisineBadgeProps) {
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.text}>{cuisine}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  text: { ...type.label, color: colors.primaryDark },
});
