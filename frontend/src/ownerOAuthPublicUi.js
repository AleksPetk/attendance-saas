/** Public owner OAuth UI helpers (login/register start URLs and result handling). */

export const OAUTH_PUBLIC_RESULT_ACTION = {
  ENTER_WORKSPACE: "enter_workspace",
  TWO_FACTOR: "two_factor",
  SHOW_ERROR: "show_error",
  SHOW_ERROR_WITH_LOGIN: "show_error_with_login",
  SHOW_ERROR_WITH_REGISTER: "show_error_with_register",
};

const SHARED_PUBLIC_MESSAGES = {
  success: null,
  two_factor_required: null,
  legal_acknowledgement_required:
    "Accept the Terms of Use and Privacy Policy before creating an account.",
  invalid_state: "This sign-in request expired. Try again.",
  authentication_failed: "Sign-in could not be completed. Try again.",
  oauth_not_configured: "This sign-in method is not available right now.",
  email_not_verified: "A verified email address is required to continue.",
  email_missing: "An email address is required to continue.",
  authentication_required: "Sign in to your CheckStation account to continue.",
  invalid_intent: "This sign-in request was not valid. Try again.",
};

const GOOGLE_PUBLIC_MESSAGES = {
  ...SHARED_PUBLIC_MESSAGES,
  no_account:
    "No CheckStation account is linked to this Google sign-in. Create an account to continue.",
  existing_account_connect_required:
    "A CheckStation account already exists for this email. Sign in using your existing method, then connect Google from Account → Security.",
  google_already_linked: "This Google account is already connected to CheckStation.",
  different_google_linked: "A different Google account is already connected to this CheckStation account.",
};

const APPLE_PUBLIC_MESSAGES = {
  ...SHARED_PUBLIC_MESSAGES,
  no_account:
    "No CheckStation account is linked to this Apple sign-in. Create an account to continue.",
  existing_account_connect_required:
    "A CheckStation account already exists for this email. Sign in using your existing method, then connect Apple from Account → Security.",
  apple_already_linked: "This Apple account is already connected to CheckStation.",
  different_apple_linked: "A different Apple account is already connected to this CheckStation account.",
};

export function oauthPublicStartUrl(apiBaseUrl, provider, intent, options = {}) {
  const base = (apiBaseUrl || "").replace(/\/$/, "");
  const params = new URLSearchParams({ intent });
  if (intent === "register" && options.legalAcknowledgement) {
    params.set("legal_acknowledgement", "true");
  }
  return `${base}/api/auth/${provider}/start/?${params.toString()}`;
}

export function oauthPublicResultMessage(provider, resultCode) {
  const providerKey = provider === "apple" ? "apple" : "google";
  const messages = providerKey === "apple" ? APPLE_PUBLIC_MESSAGES : GOOGLE_PUBLIC_MESSAGES;
  return (
    messages[resultCode] ||
  "Sign-in could not be completed. Try again."
  );
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

export function providerButtonLabel(provider) {
  if (provider === "apple") return "Continue with Apple";
  return "Continue with Google";
}

export const REGISTRATION_LEGAL_REQUIRED_MESSAGE =
  "You must agree to the Terms of Use and Privacy Policy before continuing.";
