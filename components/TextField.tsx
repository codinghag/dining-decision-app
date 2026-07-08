import { StyleSheet, TextInput, type TextInputProps } from "react-native";
import { colors, radius, spacing } from "../lib/theme";

export function TextField({ style, ...rest }: TextInputProps) {
  return (
    <TextInput style={[styles.base, style]} placeholderTextColor={colors.inkTertiary} {...rest} />
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
});
