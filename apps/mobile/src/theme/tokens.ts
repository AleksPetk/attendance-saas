/**
 * Native translations of the production Workspace tokens in
 * frontend/src/index.css. Keep this palette aligned with that file; the
 * Workspace remains the visual source of truth.
 */

export const colors = {
  navy: "#071426",
  navySoft: "#0C1F3D",
  blue: "#2563EB",
  bluePressed: "#1D4ED8",
  blueSoft: "#DBEAFE",
  cyan: "#22D3EE",
  cyanSoft: "#CFFAFE",
  green: "#22C55E",
  greenSoft: "#DCFCE7",

  bg: "#F6F9FC",
  surface: "#FFFFFF",
  surfaceMuted: "#F8FAFC",
  surfaceSubtle: "#F1F5F9",
  text: "#0F172A",
  textSecondary: "#334155",
  textMuted: "#64748B",
  textInverse: "#F8FAFC",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  placeholder: "#94A3B8",

  primary: "#2563EB",
  primaryPressed: "#1D4ED8",
  primarySoft: "rgba(37, 99, 235, 0.10)",
  focusRing: "rgba(37, 99, 235, 0.12)",
  accent: "#22D3EE",

  danger: "#DC2626",
  dangerPressed: "#B91C1C",
  dangerSoft: "#FEF2F2",
  dangerBorder: "#FECACA",
  dangerText: "#991B1B",
  successSoft: "#ECFDF5",
  successBorder: "#BBF7D0",
  successText: "#15803D",
  warningSoft: "rgba(245, 158, 11, 0.08)",
  warningBorder: "rgba(245, 158, 11, 0.35)",
  warningText: "#B45309",
  infoSoft: "rgba(37, 99, 235, 0.08)",
  infoBorder: "rgba(37, 99, 235, 0.28)",
  infoText: "#1D4ED8",

  overlay: "rgba(7, 20, 38, 0.50)",

  // Backwards-compatible names while the remaining foundation screens migrate.
  brand: "#2563EB",
  brandPressed: "#1D4ED8",
} as const;

/** Workspace's 4px spacing scale expressed in native density-independent px. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xlg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
} as const;

export const radii = {
  sm: 8,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

/** Inter on Workspace; native system faces are the platform-appropriate fallback. */
export const type = {
  title: { fontSize: 26, fontWeight: "700" as const, lineHeight: 32, letterSpacing: -0.5 },
  headline: { fontSize: 22, fontWeight: "700" as const, lineHeight: 28, letterSpacing: -0.3 },
  body: { fontSize: 16, fontWeight: "400" as const, lineHeight: 24 },
  bodyStrong: { fontSize: 16, fontWeight: "600" as const, lineHeight: 24 },
  label: { fontSize: 15, fontWeight: "600" as const, lineHeight: 20 },
  caption: { fontSize: 14, fontWeight: "400" as const, lineHeight: 20 },
  captionStrong: { fontSize: 14, fontWeight: "600" as const, lineHeight: 20 },
  eyebrow: { fontSize: 12, fontWeight: "700" as const, lineHeight: 16, letterSpacing: 0.9 },
} as const;

export const shadows = {
  sm: {
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;

export const touch = {
  min: 44,
} as const;

export const layout = {
  authMaxWidth: 440,
  pageMaxWidth: 1120,
} as const;
