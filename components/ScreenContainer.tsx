import { ScrollView, View, type ViewProps } from "react-native";
import { spacing, themedStyles, useTheme } from "../lib/theme";

interface ScreenContainerProps extends ViewProps {
  // Screens that manage their own scrolling region (a FlatList filling the
  // rest of the screen) opt out with scroll={false} — nesting a ScrollView
  // around a same-direction FlatList breaks the list's own virtualization
  // and throws a React Native warning. Every other screen defaults to
  // scrollable, since static content stacked here has no other way to
  // reach what overflows past the screen height.
  scroll?: boolean;
}

// The flex:1 + background + padding wrapper every screen repeated.
export function ScreenContainer({ style, children, scroll = true, ...rest }: ScreenContainerProps) {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  if (!scroll) {
    return (
      <View style={[styles.base, style]} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      style={[styles.scrollBase, style]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

const themed = themedStyles((colors) => ({
  base: { flex: 1, backgroundColor: colors.background, padding: spacing.base },
  scrollBase: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.base, flexGrow: 1 },
}));
