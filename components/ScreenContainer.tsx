import { View, type ViewProps } from "react-native";
import { spacing, themedStyles, useTheme } from "../lib/theme";

// The flex:1 + background + padding wrapper every screen repeated.
export function ScreenContainer({ style, children, ...rest }: ViewProps) {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  return (
    <View style={[styles.base, style]} {...rest}>
      {children}
    </View>
  );
}

const themed = themedStyles((colors) => ({
  base: { flex: 1, backgroundColor: colors.background, padding: spacing.base },
}));
