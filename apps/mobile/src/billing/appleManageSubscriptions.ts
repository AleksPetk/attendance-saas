/**
 * Pure helpers for iOS Apple subscription management sheet vs deep-link fallback.
 * Kept free of expo-iap native imports so unit tests can run in Node.
 */

export type AppleManageSubscriptionsDeps = {
  showManageSubscriptionsIOS?: () => Promise<unknown>;
  deepLinkToSubscriptions?: (options: Record<string, never>) => Promise<void>;
};

/**
 * True when the native manage-subscriptions API is missing or reports unsupported.
 * Arbitrary programming errors must NOT trigger deep-link fallback.
 */
export function isUnsupportedAppleManageSubscriptionsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: string }).code || "").toLowerCase();
  const message = String((error as { message?: string }).message || "").toLowerCase();
  if (
    code.includes("not-available")
    || code.includes("not_available")
    || code.includes("unsupported")
    || code.includes("unimplemented")
    || code.includes("not-implemented")
    || code.includes("not_implemented")
  ) {
    return true;
  }
  return (
    message.includes("not available")
    || message.includes("unsupported")
    || message.includes("not implemented")
    || message.includes("unimplemented")
    || message.includes("is not a function")
  );
}

/**
 * Prefer native StoreKit management sheet; deep-link only when unsupported.
 */
export async function runAppleManageSubscriptions(
  deps: AppleManageSubscriptionsDeps,
): Promise<"native_sheet" | "deep_link"> {
  const showNative = deps.showManageSubscriptionsIOS;
  const deepLink = deps.deepLinkToSubscriptions;
  if (typeof deepLink !== "function") {
    throw new Error("deepLinkToSubscriptions is required");
  }
  if (typeof showNative !== "function") {
    await deepLink({});
    return "deep_link";
  }
  try {
    await showNative();
    return "native_sheet";
  } catch (error) {
    if (isUnsupportedAppleManageSubscriptionsError(error)) {
      await deepLink({});
      return "deep_link";
    }
    throw error;
  }
}
