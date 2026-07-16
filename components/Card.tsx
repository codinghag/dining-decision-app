import { View, type ViewProps } from "react-native";
import { radius, shadow, spacing, themedStyles, useTheme } from "../lib/theme";

interface CardProps extends ViewProps {
  elevated?: boolean;
}

// Shared bordered/rounded container used for restaurant rows, search
// results, and confirm boxes — replaces the near-identical ad hoc card
// styles each screen used to define separately.
export function Card({ elevated = false, style, children, ...rest }: CardProps) {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  return (
    <View style={[styles.base, elevated && styles.elevated, style]} {...rest}>
      {children}
    </View>
  );
}

const themed = themedStyles((colors) => ({
  base: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.base,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.xs,
  },
  elevated: {
    backgroundColor: colors.surface,
    boxShadow: shadow.card,
    borderColor: "transparent",
  },
}));
