// Single source of design tokens for the app. Every screen and UI primitive
// pulls colors/spacing/radius/type/shadow from here instead of hard-coding
// its own values, so the look stays consistent as screens are added.

export const colors = {
  // Warm, food-themed accent — used for primary actions and the "in" swipe.
  primary: "#E8623B",
  primaryDark: "#C94E2B",
  primaryLight: "#FDECE5",

  // Swipe / vote semantics.
  yes: "#2BAA6E",
  yesLight: "#E6F6EE",
  pass: "#E5484D",
  passLight: "#FCEAEA",

  ink: "#241F1B",
  inkSecondary: "#6B5F55",
  inkTertiary: "#9C8F82",

  background: "#FFFBF8",
  surface: "#FFFFFF",
  surfaceMuted: "#F7F0E9",
  border: "#ECE1D6",
  borderStrong: "#DFD0C0",

  white: "#FFFFFF",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  full: 999,
} as const;

export const type = {
  title: { fontSize: 28, fontWeight: "800" as const, color: colors.ink },
  heading: { fontSize: 20, fontWeight: "700" as const, color: colors.ink },
  subtitle: { fontSize: 16, fontWeight: "600" as const, color: colors.ink },
  body: { fontSize: 15, fontWeight: "400" as const, color: colors.ink },
  caption: { fontSize: 13, fontWeight: "400" as const, color: colors.inkTertiary },
  label: { fontSize: 13, fontWeight: "600" as const, color: colors.inkSecondary },
};

// RN 0.86 (new arch) supports the unified `boxShadow` string style prop
// cross-platform, replacing the deprecated shadow*/elevation combo.
export const shadow = {
  card: "0px 2px 8px rgba(36, 31, 27, 0.06)",
  raised: "0px 8px 24px rgba(36, 31, 27, 0.12)",
};
