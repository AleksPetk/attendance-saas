/** UI helpers for Account → Security sign-in methods (no API logic). */

export const PASSWORD_NOT_AVAILABLE_MESSAGE =
  "Set a CheckStation password before performing this security-sensitive action.";

export function signInMethodsStatusSummary(signInMethods) {
  if (!signInMethods) return "";
  const parts = [];
  parts.push(signInMethods.password?.enabled ? "Password: Connected" : "Password: Not set");
  parts.push(signInMethods.google?.linked ? "Google: Connected" : "Google: Not connected");
  parts.push(signInMethods.apple?.linked ? "Apple: Connected" : "Apple: Not connected");
  return parts.join("\n");
}

export function signInMethodsStatusPills(signInMethods) {
  if (!signInMethods) return [];
  const pills = [
    {
      label: signInMethods.password?.enabled ? "Password connected" : "Password not set",
      variant: signInMethods.password?.enabled ? "live" : "default",
    },
  ];
  if (signInMethods.google?.linked) {
    pills.push({ label: "Google connected", variant: "live" });
  }
  if (signInMethods.apple?.linked) {
    pills.push({ label: "Apple connected", variant: "live" });
  }
  return pills;
}

export function oauthStartUrl(apiBaseUrl, provider, intent) {
  const base = (apiBaseUrl || "").replace(/\/$/, "");
  return `${base}/api/auth/${provider}/start/?intent=${encodeURIComponent(intent)}`;
}

const OAUTH_RESULT_MESSAGES = {
  google: {
    linked: "Google is now connected to your account.",
    already_linked: "Google is already connected to your account.",
    google_already_linked: "This Google account is connected to another CheckStation account.",
    different_google_linked: "A different Google account is already connected. Disconnect it first.",
    existing_account_connect_required:
      "Sign in to your existing CheckStation account before connecting Google.",
    oauth_not_configured: "Google sign-in is not available right now.",
    invalid_state: "This Google connection request expired. Try again.",
    authentication_failed: "Google sign-in could not be completed.",
    authentication_required: "Sign in to your CheckStation account before connecting Google.",
    email_not_verified: "Google did not return a verified email address.",
    verified: "Identity confirmed. You can continue in CheckStation.",
  },
  apple: {
    linked: "Apple is now connected to your account.",
    already_linked: "Apple is already connected to your account.",
    apple_already_linked: "This Apple account is connected to another CheckStation account.",
    different_apple_linked: "A different Apple account is already connected. Disconnect it first.",
    existing_account_connect_required:
      "Sign in to your existing CheckStation account before connecting Apple.",
    oauth_not_configured: "Apple sign-in is not available right now.",
    invalid_state: "This Apple connection request expired. Try again.",
    authentication_failed: "Apple sign-in could not be completed.",
    authentication_required: "Sign in to your CheckStation account before connecting Apple.",
    email_not_verified: "Apple did not return a verified email address.",
    email_missing: "Apple did not return an email address.",
    verified: "Identity confirmed. You can continue in CheckStation.",
  },
};

export function oauthAccountSecurityResultMessage(provider, resultCode) {
  const providerKey = provider === "apple" ? "apple" : "google";
  const messages = OAUTH_RESULT_MESSAGES[providerKey] || {};
  return (
    messages[resultCode] ||
    "Sign-in provider connection could not be completed. Try again."
  );
}

export function isOAuthVerifiedResult(resultCode) {
  return resultCode === "verified";
}

export function isPasswordNotAvailableError(error) {
  return error?.data?.code === "password_not_available";
}

export function passwordNotAvailableGuidance(error) {
  if (isPasswordNotAvailableError(error)) {
    return error.data.detail || PASSWORD_NOT_AVAILABLE_MESSAGE;
  }
  return "";
}

export function otherLinkedProviderForReauth(signInMethods, excludeProvider) {
  if (!signInMethods) return null;
  if (excludeProvider !== "google" && signInMethods.google?.linked) return "google";
  if (excludeProvider !== "apple" && signInMethods.apple?.linked) return "apple";
  return null;
}

export function providerDisplayName(provider) {
  if (provider === "apple") return "Apple";
  if (provider === "google") return "Google";
  return "Provider";
}
