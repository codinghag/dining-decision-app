import { StyleSheet, View, type ViewProps } from "react-native";
import { colors, spacing } from "../lib/theme";

// The flex:1 + background + padding wrapper every screen repeated.
export function ScreenContainer({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.base, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flex: 1, backgroundColor: colors.background, padding: spacing.base },
});
