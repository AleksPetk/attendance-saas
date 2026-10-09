/** When to show cross-platform billing explanation banners on mobile Plan. */

export type BillingSnapshot = Record<string, any>;
export type MobilePlanPlatform = "ios" | "android";

export function nativePurchaseSourceForPlatform(platform: MobilePlanPlatform): "apple" | "google" {
  return platform === "ios" ? "apple" : "google";
}

/**
 * Show explanatory provider banners only when VPS billing is owned by a store
 * other than this device's native store (Apple on iOS, Google Play on Android).
 */
export function shouldShowMobileCrossProviderBillingNotice(
  billing: BillingSnapshot | null | undefined,
  platform: MobilePlanPlatform,
): boolean {
  if (!billing) return false;
  const source = String(billing.purchase_source || "none").trim();
  if (!source || source === "none") return false;
  return source !== nativePurchaseSourceForPlatform(platform);
}
