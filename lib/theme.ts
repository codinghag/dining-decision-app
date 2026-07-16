// Single source of design tokens. Every screen and UI primitive pulls
// colors/spacing/radius/type/shadow from here, so the look stays consistent.
//
// Design language: "editorial menu" — warm paper ground, deep green primary,
// saffron accent, serif display headings (like a good restaurant menu), pill
// buttons, photo-forward cards.
//
// Two palettes (light + dark) share one shape; components define their
// styles once via themedStyles() — which bakes BOTH stylesheets at module
// load — and pick the active one with useTheme().

import { Platform, StyleSheet, useColorScheme } from "react-native";

const light = {
  // Deep menu-green — primary actions, links, the "in" vote.
  primary: "#1E6B47",
  primaryDark: "#145235",
  primaryLight: "#E3EFE7",

  // Saffron — warm highlight for stats, tallies, and moments of delight.
  accent: "#D99A2B",
  accentLight: "#F9EFDB",

  // Vote semantics. "Yes" leans on the green family; "pass" is brick red.
  yes: "#1E6B47",
  yesLight: "#E3EFE7",
  pass: "#B8433A",
  passLight: "#F7E6E4",

  ink: "#1D1A16",
  inkSecondary: "#5F594F",
  inkTertiary: "#958D80",

  background: "#F6F3EC",
  surface: "#FFFFFF",
  surfaceMuted: "#EEE9DF",
  border: "#E2DCCF",
  borderStrong: "#CFC6B4",

  white: "#FFFFFF",
} as const;

export type ColorPalette = { [K in keyof typeof light]: string };

// Candlelit version of the same menu: deep warm charcoal, green and saffron
// lifted to hold contrast.
const dark: ColorPalette = {
  primary: "#57B183",
  primaryDark: "#79C69E",
  primaryLight: "#1E2E26",

  accent: "#E4B45E",
  accentLight: "#332A1A",

  yes: "#57B183",
  yesLight: "#1E2E26",
  pass: "#E07067",
  passLight: "#392422",

  ink: "#EFEAE1",
  inkSecondary: "#B5AC9E",
  inkTertiary: "#847B6E",

  background: "#161310",
  surface: "#201C17",
  surfaceMuted: "#2A241E",
  border: "#39322A",
  borderStrong: "#4B4238",

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
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

// Serif display face for headings — Georgia on web/iOS, the system serif
// (Noto Serif) on Android. Body copy stays on the system sans.
export const fonts = {
  display: Platform.select({
    android: "serif",
    web: "Georgia, 'Times New Roman', serif",
    default: "Georgia",
  }) as string,
};

function makeType(c: ColorPalette) {
  return {
    // Serif display tiers — screen titles, section headings, dish/place names.
    title: {
      fontSize: 32,
      fontWeight: "700" as const,
      color: c.ink,
      fontFamily: fonts.display,
      letterSpacing: -0.5,
    },
    heading: {
      fontSize: 22,
      fontWeight: "700" as const,
      color: c.ink,
      fontFamily: fonts.display,
      letterSpacing: -0.3,
    },
    // Sans tiers — UI copy.
    subtitle: { fontSize: 16, fontWeight: "600" as const, color: c.ink },
    body: { fontSize: 15, fontWeight: "400" as const, color: c.ink },
    caption: { fontSize: 13, fontWeight: "400" as const, color: c.inkTertiary },
    label: {
      fontSize: 12,
      fontWeight: "700" as const,
      color: c.inkSecondary,
      letterSpacing: 0.6,
      textTransform: "uppercase" as const,
    },
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
  card: "0px 2px 10px rgba(29, 26, 22, 0.07)",
  raised: "0px 10px 30px rgba(29, 26, 22, 0.14)",
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
