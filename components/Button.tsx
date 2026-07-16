import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { radius, spacing, themedStyles, useTheme, type ColorPalette } from "../lib/theme";

type Variant = "primary" | "dark" | "outline" | "danger-outline";

interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  flex?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Shared button primitive. Deliberately takes `flex` as its own boolean prop
// (rather than requiring an array `style`) so it stays safe to use as the
// direct child of `<Link asChild>` — expo-router's Slot throws when the
// child it clones onto declares an array `style` prop directly.
export function Button({
  label,
  variant = "primary",
  loading = false,
  flex = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        flex && styles.flex,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
      disabled={isDisabled}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={textColor(variant, colors)} />
      ) : (
        <Text style={[styles.label, { color: textColor(variant, colors) }]}>{label}</Text>
      )}
    </Pressable>
  );
}

function textColor(variant: Variant, colors: ColorPalette): string {
  switch (variant) {
    case "outline":
      return colors.primary;
    case "danger-outline":
      return colors.pass;
    case "dark":
      // "dark" is an ink-colored fill; on the dark palette ink is near-white,
      // so the label must flip to the background color to stay readable.
      return colors.background;
    default:
      return colors.white;
  }
}

const themed = themedStyles((colors) => ({
  // Pill buttons — part of the editorial-menu design language.
  base: {
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    minHeight: 50, // comfortable touch target
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexDirection: "row" as const,
  },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  label: { fontSize: 16, fontWeight: "700" as const, letterSpacing: 0.2 },
  primary: { backgroundColor: colors.primary },
  dark: { backgroundColor: colors.ink },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  "danger-outline": {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.pass,
  },
}));
