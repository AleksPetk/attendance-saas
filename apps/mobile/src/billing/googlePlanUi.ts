/** Pure helpers for Google Plan UI gating (unit-tested without Play Billing). */

export type BillingSnapshot = Record<string, any>;

export function googlePurchaseEligible(billing: BillingSnapshot | null | undefined): boolean {
  if (!billing || billing.managed_by_platform) return false;
  if (billing.builtin_trial?.active) return false;
  return billing.purchase_source === "none" && Boolean(billing.can_start_google);
}

export function googleManaged(billing: BillingSnapshot | null | undefined): boolean {
  return Boolean(
    billing && billing.purchase_source === "google" && billing.can_manage_google !== false,
  );
}

/** Built-in trial: choose a future Google plan without purchasing yet. */
export function googleTrialFutureSelectionMode(
  billing: BillingSnapshot | null | undefined,
): boolean {
  if (!billing || billing.managed_by_platform) return false;
  if (!billing.builtin_trial?.active) return false;
  return billing.purchase_source === "none";
}

export function googleBlockedByOtherProvider(
  billing: BillingSnapshot | null | undefined,
): "stripe" | "apple" | null {
  if (!billing) return null;
  if (billing.purchase_source === "stripe") return "stripe";
  if (billing.purchase_source === "apple") return "apple";
  return null;
}

export function shouldLoadGoogleStoreProducts(
  billing: BillingSnapshot | null | undefined,
): boolean {
  return (
    googlePurchaseEligible(billing)
    || googleManaged(billing)
    || googleTrialFutureSelectionMode(billing)
  );
}

export function futurePaidMatchesGoogleOption(
  billing: BillingSnapshot | null | undefined,
  plan: string | undefined,
  interval: string | undefined,
): boolean {
  const future = billing?.future_paid_plan;
  if (!future?.key || !future?.interval || !plan || !interval) return false;
  return future.key === plan && future.interval === interval;
}

export function isActiveGooglePaidEntitlement(
  billing: BillingSnapshot | null | undefined,
): boolean {
  if (!billing || billing.purchase_source !== "google") return false;
  const status = String(billing.status || "").toLowerCase();
  if (status !== "active" && status !== "trialing" && status !== "past_due") {
    return false;
  }
  const subscribed = String(billing.subscribed_plan?.key || "").toLowerCase();
  const effective = String(billing.effective_plan?.key || "").toLowerCase();
  return (
    subscribed === "plus"
    || subscribed === "business"
    || effective === "plus"
    || effective === "business"
  );
}

export function userFacingGoogleBillingError(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const code = String((error as { code?: string }).code || "");
  const map: Record<string, string> = {
    purchase_source_locked: "This workspace already has a billing provider.",
    purchase_source_apple: "This workspace is managed by Apple.",
    purchase_source_stripe: "This workspace is managed through CheckStation billing.",
    purchase_source_google: "This workspace is managed through Google Play.",
    google_purchase_bound_elsewhere:
      "This Google Play subscription belongs to another workspace.",
    google_unknown_product: "That Google Play product is not available.",
    google_unknown_base_plan: "That Google Play plan is not available.",
    google_purchase_not_found: "Google Play could not verify this purchase. Please try again.",
    google_entitlement_inactive:
      "The purchase could not be activated. Please try again or restore purchases.",
    google_play_not_configured: "Google Play billing is temporarily unavailable.",
    builtin_trial_required:
      "That plan choice is only available during the included Business trial.",
  };
  if (map[code]) return map[code];
  const detail = String(
    (error as { detail?: string; message?: string }).detail
      || (error as { message?: string }).message
      || "",
  ).trim();
  return detail || fallback;
}
