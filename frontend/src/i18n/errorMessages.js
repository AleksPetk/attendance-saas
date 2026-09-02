/** Map stable backend error codes to i18n keys (errors namespace). */

const ERROR_CODE_KEYS = {
  plan_feature_locked: "planFeatureLocked",
  plan_capacity_reached: "planCapacityReached",
  plan_account_locked: "planAccountLocked",
  email_not_verified: "emailNotVerified",
  two_factor_required: "twoFactorRequired",
  checkstation_managed_account: "checkstationManaged",
  purchase_source_not_stripe: "notStripeBilling",
  purchase_source_apple: "appleBilling",
  billing_state_error: "billingGeneric",
  stripe_price_missing: "stripeNotConfigured",
  invalid_preferred_language: "invalidLanguage",
};

/**
 * Localize a parsed API error when a known code exists; otherwise return detail.
 */
export function localizedErrorMessage(error, t) {
  const code = error?.data?.code;
  const detail = error?.data?.detail;
  if (code && ERROR_CODE_KEYS[code] && typeof t === "function") {
    return t(`errors:${ERROR_CODE_KEYS[code]}`, {
      defaultValue: typeof detail === "string" ? detail : t("errors:generic"),
    });
  }
  if (typeof detail === "string" && detail.trim()) return detail;
  if (typeof error?.data === "string") return error.data;
  return typeof t === "function" ? t("errors:generic") : "Something went wrong.";
}
