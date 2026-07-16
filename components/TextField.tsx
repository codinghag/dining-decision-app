import { TextInput, type TextInputProps } from "react-native";
import { radius, spacing, themedStyles, useTheme } from "../lib/theme";

export function TextField({ style, placeholder, ...rest }: TextInputProps) {
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];
  return (
    <TextInput
      style={[styles.base, style]}
      placeholder={placeholder}
      placeholderTextColor={colors.inkTertiary}
      // Placeholder doubles as the accessible label (this design has no
      // separate visual field labels).
      accessibilityLabel={placeholder}
      {...rest}
    />
  );
}

const themed = themedStyles((colors) => ({
  base: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: 12,
    minHeight: 48, // match Button's touch target
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
}));
