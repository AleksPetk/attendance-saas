/** Pure helpers for Apple Plan UI gating (unit-tested without StoreKit). */

export type BillingSnapshot = Record<string, any>;

export function applePurchaseEligible(billing: BillingSnapshot | null | undefined): boolean {
  if (!billing || billing.managed_by_platform) return false;
  if (billing.builtin_trial?.active) return false;
  return billing.purchase_source === "none" && Boolean(billing.can_start_apple);
}

export function appleManaged(billing: BillingSnapshot | null | undefined): boolean {
  return Boolean(billing && billing.purchase_source === "apple" && billing.can_manage_apple !== false);
}

export function appleBlockedByOtherProvider(billing: BillingSnapshot | null | undefined): "stripe" | "google" | null {
  if (!billing) return null;
  if (billing.purchase_source === "stripe") return "stripe";
  if (billing.purchase_source === "google") return "google";
  return null;
}

export function shouldShowStripePromoOnMobile(billing: BillingSnapshot | null | undefined): boolean {
  // Apple purchase UI must never show Stripe promo pricing.
  if (applePurchaseEligible(billing) || appleManaged(billing)) return false;
  return true;
}

export function userFacingAppleBillingError(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const code = String((error as { code?: string }).code || "");
  const map: Record<string, string> = {
    purchase_source_locked: "This workspace already has a billing provider.",
    purchase_source_apple: "This workspace is managed by Apple.",
    purchase_source_google: "This workspace is managed through Google Play.",
    purchase_source_not_stripe: "This workspace is not on CheckStation billing.",
    apple_transaction_bound_elsewhere: "This Apple subscription belongs to another workspace.",
    apple_unknown_product: "That Apple product is not available.",
    apple_jws_invalid: "Apple could not verify this purchase. Please try again.",
    apple_bundle_mismatch: "Apple could not verify this purchase. Please try again.",
    apple_app_account_token_mismatch: "This Apple purchase does not match this workspace.",
  };
  if (map[code]) return map[code];
  const detail = String((error as { detail?: string; message?: string }).detail
    || (error as { message?: string }).message
    || "").trim();
  return detail || fallback;
}
