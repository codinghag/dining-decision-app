import { Text, View } from "react-native";
import { spacing, themedStyles, useTheme } from "../lib/theme";

interface EmptyStateProps {
  icon?: string;
  message: string;
}

export function EmptyState({ icon = "🍽️", message }: EmptyStateProps) {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  return (
    <View style={styles.container}>
      <Text accessible={false} style={styles.icon}>
        {icon}
      </Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const themed = themedStyles((colors, type) => ({
  container: {
    alignItems: "center" as const,
    paddingTop: spacing.xl * 1.5,
    gap: spacing.sm,
  },
  icon: { fontSize: 40 },
  message: {
    ...type.body,
    color: colors.inkTertiary,
    textAlign: "center" as const,
    maxWidth: 260,
  },
}));
