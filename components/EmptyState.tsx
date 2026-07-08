import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, type } from "../lib/theme";

interface EmptyStateProps {
  icon?: string;
  message: string;
}

export function EmptyState({ icon = "🍽️", message }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingTop: spacing.xl * 1.5, gap: spacing.sm },
  icon: { fontSize: 40 },
  message: { ...type.body, color: colors.inkTertiary, textAlign: "center", maxWidth: 260 },
});
