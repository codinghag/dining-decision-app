import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radius, spacing } from "../lib/theme";

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
  const isDisabled = disabled || loading;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        flex && styles.flex,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
      disabled={isDisabled}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={textColor(variant)} />
      ) : (
        <Text style={[styles.label, { color: textColor(variant) }]}>{label}</Text>
      )}
    </Pressable>
  );
}

function textColor(variant: Variant): string {
  switch (variant) {
    case "outline":
      return colors.primary;
    case "danger-outline":
      return colors.pass;
    default:
      return colors.white;
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.base,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  label: { fontSize: 16, fontWeight: "700" },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  dark: { backgroundColor: colors.ink },
  outline: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  "danger-outline": {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.pass,
  },
});
