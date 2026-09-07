/** CheckStation mobile design tokens — app-native, not a clone of the web SPA. */

export const colors = {
  bg: "#F4F7F6",
  surface: "#FFFFFF",
  surfaceMuted: "#E8EEEC",
  text: "#102220",
  textSecondary: "#5B6B66",
  border: "#D5DEDB",
  brand: "#0F766E",
  brandPressed: "#0B5F59",
  danger: "#B42318",
  warning: "#B54708",
  success: "#027A48",
  overlay: "rgba(16, 34, 32, 0.45)",
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const type = {
  title: { fontSize: 28, fontWeight: "700" as const, lineHeight: 34 },
  headline: { fontSize: 22, fontWeight: "700" as const, lineHeight: 28 },
  body: { fontSize: 16, fontWeight: "400" as const, lineHeight: 22 },
  bodyStrong: { fontSize: 16, fontWeight: "600" as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: "400" as const, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: "600" as const, lineHeight: 18 },
};

export const touch = {
  min: 44,
};
