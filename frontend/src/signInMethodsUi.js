/** UI helpers for Account → Security sign-in methods (no API logic). */

import i18n from "./i18n/index.js";

export function passwordNotAvailableMessage() {
  return i18n.t("account:signInMethods.errors.passwordNotAvailable");
}

export function signInMethodsStatusSummary(signInMethods) {
  if (!signInMethods) return "";
  const parts = [];
  parts.push(
    signInMethods.password?.enabled
      ? i18n.t("account:signInMethods.statusSummary.passwordConnected")
      : i18n.t("account:signInMethods.statusSummary.passwordNotSet"),
  );
  parts.push(
    signInMethods.google?.linked
      ? i18n.t("account:signInMethods.statusSummary.googleConnected")
      : i18n.t("account:signInMethods.statusSummary.googleNotConnected"),
  );
  parts.push(
    signInMethods.apple?.linked
      ? i18n.t("account:signInMethods.statusSummary.appleConnected")
      : i18n.t("account:signInMethods.statusSummary.appleNotConnected"),
  );
  return parts.join("\n");
}

export function signInMethodsStatusPills(signInMethods) {
  if (!signInMethods) return [];
  const pills = [
    {
      label: signInMethods.password?.enabled
        ? i18n.t("account:signInMethods.passwordConnected")
        : i18n.t("account:signInMethods.passwordNotSet"),
      variant: signInMethods.password?.enabled ? "live" : "default",
    },
  ];
  if (signInMethods.google?.linked) {
    pills.push({ label: i18n.t("account:signInMethods.googleConnected"), variant: "live" });
  }
  if (signInMethods.apple?.linked) {
    pills.push({ label: i18n.t("account:signInMethods.appleConnected"), variant: "live" });
  }
  return pills;
}

export function oauthStartUrl(apiBaseUrl, provider, intent) {
  const base = (apiBaseUrl || "").replace(/\/$/, "");
  return `${base}/api/auth/${provider}/start/?intent=${encodeURIComponent(intent)}`;
}

const OAUTH_RESULT_KEY_PREFIX = "account:signInMethods.oauth";

export function oauthAccountSecurityResultMessage(provider, resultCode) {
  const providerKey = provider === "apple" ? "apple" : "google";
  const key = `${OAUTH_RESULT_KEY_PREFIX}.${providerKey}.${resultCode}`;
  const translated = i18n.t(key, { defaultValue: "" });
  if (translated) return translated;
  return i18n.t("account:signInMethods.oauth.genericFailure");
}

export function isOAuthVerifiedResult(resultCode) {
  return resultCode === "verified";
}

export function isPasswordNotAvailableError(error) {
  return error?.data?.code === "password_not_available";
}

export function passwordNotAvailableGuidance(error) {
  if (isPasswordNotAvailableError(error)) {
    return error.data.detail || passwordNotAvailableMessage();
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
