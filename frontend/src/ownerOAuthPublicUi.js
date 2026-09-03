/** Public owner OAuth UI helpers (login/register start URLs and result handling). */

export const OAUTH_PUBLIC_RESULT_ACTION = {
  ENTER_WORKSPACE: "enter_workspace",
  TWO_FACTOR: "two_factor",
  SHOW_ERROR: "show_error",
  SHOW_ERROR_WITH_LOGIN: "show_error_with_login",
  SHOW_ERROR_WITH_REGISTER: "show_error_with_register",
};

const SHARED_RESULT_KEYS = {
  legal_acknowledgement_required: "oauth.results.legalAcknowledgementRequired",
  invalid_state: "oauth.results.invalidState",
  authentication_failed: "oauth.results.authenticationFailed",
  oauth_not_configured: "oauth.results.oauthNotConfigured",
  email_not_verified: "oauth.results.emailNotVerified",
  email_missing: "oauth.results.emailMissing",
  authentication_required: "oauth.results.authenticationRequired",
  invalid_intent: "oauth.results.invalidIntent",
};

const PROVIDER_RESULT_KEYS = {
  google: {
    no_account: "oauth.results.google.noAccount",
    existing_account_connect_required: "oauth.results.google.existingAccountConnectRequired",
    google_already_linked: "oauth.results.google.alreadyLinked",
    different_google_linked: "oauth.results.google.differentLinked",
  },
  apple: {
    no_account: "oauth.results.apple.noAccount",
    existing_account_connect_required: "oauth.results.apple.existingAccountConnectRequired",
    apple_already_linked: "oauth.results.apple.alreadyLinked",
    different_apple_linked: "oauth.results.apple.differentLinked",
  },
};

export function oauthPublicStartUrl(apiBaseUrl, provider, intent, options = {}) {
  const base = (apiBaseUrl || "").replace(/\/$/, "");
  const params = new URLSearchParams({ intent });
  if (intent === "register" && options.legalAcknowledgement) {
    params.set("legal_acknowledgement", "true");
  }
  return `${base}/api/auth/${provider}/start/?${params.toString()}`;
}

export function oauthPublicResultMessageKey(provider, resultCode) {
  const providerKey = provider === "apple" ? "apple" : "google";
  const providerMessages = PROVIDER_RESULT_KEYS[providerKey] || {};
  return (
    providerMessages[resultCode] ||
    SHARED_RESULT_KEYS[resultCode] ||
    SHARED_RESULT_KEYS.authentication_failed
  );
}

export function oauthPublicResultMessage(t, provider, resultCode) {
  return t(oauthPublicResultMessageKey(provider, resultCode));
}

export function oauthPublicResultAction(resultCode) {
  if (resultCode === "success") return OAUTH_PUBLIC_RESULT_ACTION.ENTER_WORKSPACE;
  if (resultCode === "two_factor_required") return OAUTH_PUBLIC_RESULT_ACTION.TWO_FACTOR;
  if (resultCode === "no_account") return OAUTH_PUBLIC_RESULT_ACTION.SHOW_ERROR_WITH_REGISTER;
  if (resultCode === "existing_account_connect_required") {
    return OAUTH_PUBLIC_RESULT_ACTION.SHOW_ERROR_WITH_LOGIN;
  }
  if (resultCode === "legal_acknowledgement_required") {
    return OAUTH_PUBLIC_RESULT_ACTION.SHOW_ERROR_WITH_REGISTER;
  }
  return OAUTH_PUBLIC_RESULT_ACTION.SHOW_ERROR;
}

export function providerButtonLabelKey(provider) {
  return provider === "apple" ? "oauth.continueWithApple" : "oauth.continueWithGoogle";
}

export function providerButtonLabel(t, provider) {
  return t(providerButtonLabelKey(provider));
}

export const REGISTRATION_LEGAL_REQUIRED_MESSAGE_KEY = "oauth.registrationLegalRequired";
