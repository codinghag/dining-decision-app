// Single source of design tokens for the app. Every screen and UI primitive
// pulls colors/spacing/radius/type/shadow from here instead of hard-coding
// its own values, so the look stays consistent as screens are added.
//
// Two palettes (light + dark) share one shape; components define their
// styles once via themedStyles() — which bakes BOTH stylesheets at module
// load — and pick the active one with useTheme(). This keeps StyleSheet
// creation out of render while still following the OS appearance setting.

import { StyleSheet, useColorScheme } from "react-native";

const light = {
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

export type ColorPalette = { [K in keyof typeof light]: string };

// Warm near-black rather than pure gray, mirroring the cream-not-white
// choice of the light palette. Accents are nudged lighter so they keep
// WCAG-ish contrast against the dark ground.
const dark: ColorPalette = {
  primary: "#F07B55",
  primaryDark: "#F49375",
  primaryLight: "#3B2A22",

  yes: "#4CC38A",
  yesLight: "#1E322A",
  pass: "#F2666B",
  passLight: "#3B2527",

  ink: "#F2EAE2",
  inkSecondary: "#BFB1A3",
  inkTertiary: "#8F8275",

  background: "#181411",
  surface: "#221D19",
  surfaceMuted: "#2C2520",
  border: "#3A322B",
  borderStrong: "#4C4238",

  white: "#FFFFFF",
};

export const palettes = { light, dark } as const;
export type Scheme = keyof typeof palettes;

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

function makeType(c: ColorPalette) {
  return {
    title: { fontSize: 28, fontWeight: "800" as const, color: c.ink },
    heading: { fontSize: 20, fontWeight: "700" as const, color: c.ink },
    subtitle: { fontSize: 16, fontWeight: "600" as const, color: c.ink },
    body: { fontSize: 15, fontWeight: "400" as const, color: c.ink },
    caption: { fontSize: 13, fontWeight: "400" as const, color: c.inkTertiary },
    label: { fontSize: 13, fontWeight: "600" as const, color: c.inkSecondary },
  };
}

export type Typography = ReturnType<typeof makeType>;

const typeBy: Record<Scheme, Typography> = {
  light: makeType(light),
  dark: makeType(dark),
};

// RN 0.86 (new arch) supports the unified `boxShadow` string style prop
// cross-platform, replacing the deprecated shadow*/elevation combo.
export const shadow = {
  card: "0px 2px 8px rgba(36, 31, 27, 0.06)",
  raised: "0px 8px 24px rgba(36, 31, 27, 0.12)",
};

export interface Theme {
  scheme: Scheme;
  colors: ColorPalette;
  type: Typography;
}

// The active theme, following the OS appearance setting (app.json sets
// userInterfaceStyle "automatic").
export function useTheme(): Theme {
  const scheme: Scheme = useColorScheme() === "dark" ? "dark" : "light";
  return { scheme, colors: palettes[scheme], type: typeBy[scheme] };
}

// Define styles once, get both palettes' stylesheets. Components pick with:
//   const { scheme } = useTheme();
//   const styles = themed[scheme];
export function themedStyles<
  T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<unknown>,
>(
  factory: (colors: ColorPalette, type: Typography) => T & StyleSheet.NamedStyles<unknown>,
): Record<Scheme, T> {
  return {
    light: StyleSheet.create(factory(light, typeBy.light)),
    dark: StyleSheet.create(factory(dark, typeBy.dark)),
  };
}
