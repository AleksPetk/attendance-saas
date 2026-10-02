/**
 * Renderer-facing desktop distribution helpers.
 * Mirrors electron/desktopDistribution.cjs — keep values in sync.
 *
 * Prefer window.checkstationDesktop.getDesktopDistribution() at runtime when
 * available; import.meta.env is set at Vite build time for packaged variants.
 */

export type DesktopDistribution = "direct" | "mas";

export type DesktopBillingMode = "stripe_web" | "apple_iap";
export type DesktopAppleAuthMode = "web_compatible" | "native";

export type DesktopDistributionInfo = {
  distribution: DesktopDistribution;
  bundleId: string;
  releaseOutputDir: string;
  billingMode: DesktopBillingMode;
  appleAuthMode: DesktopAppleAuthMode;
  googleAuthEnabled: boolean;
};

export const DESKTOP_BUNDLE_IDS = {
  direct: "app.checkstation.desktop",
  mas: "app.checkstation.client",
} as const;

export const DESKTOP_BILLING_MODES = {
  direct: "stripe_web",
  mas: "apple_iap",
} as const;

export const DESKTOP_APPLE_AUTH_MODES = {
  direct: "web_compatible",
  mas: "native",
} as const;

export function normalizeDesktopDistribution(value: unknown): DesktopDistribution {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "mas" ? "mas" : "direct";
}

export function resolveDesktopDistribution(
  value?: unknown,
): DesktopDistribution {
  if (value != null && String(value).trim() !== "") {
    return normalizeDesktopDistribution(value);
  }
  const fromVite = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env?.VITE_DESKTOP_DISTRIBUTION;
  return normalizeDesktopDistribution(fromVite);
}

export function desktopBundleId(distribution: DesktopDistribution): string {
  return DESKTOP_BUNDLE_IDS[distribution];
}

export function desktopReleaseOutputDir(distribution: DesktopDistribution): string {
  return distribution === "mas" ? "release/mas" : "release/direct";
}

export function desktopBillingMode(distribution: DesktopDistribution): DesktopBillingMode {
  return DESKTOP_BILLING_MODES[distribution];
}

export function desktopAppleAuthMode(distribution: DesktopDistribution): DesktopAppleAuthMode {
  return DESKTOP_APPLE_AUTH_MODES[distribution];
}

export function desktopGoogleAuthEnabled(_distribution: DesktopDistribution): boolean {
  return true;
}

export function getDesktopDistributionInfo(
  value?: unknown,
): DesktopDistributionInfo {
  const distribution = resolveDesktopDistribution(value);
  return {
    distribution,
    bundleId: desktopBundleId(distribution),
    releaseOutputDir: desktopReleaseOutputDir(distribution),
    billingMode: desktopBillingMode(distribution),
    appleAuthMode: desktopAppleAuthMode(distribution),
    googleAuthEnabled: desktopGoogleAuthEnabled(distribution),
  };
}
