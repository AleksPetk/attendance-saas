import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

/** Exact deep link allowlisted by the backend for Android Apple browser OAuth. */
export const MOBILE_APPLE_RETURN_URL = "checkstation://auth/apple-result";

export type AppleBrowserIntent = "login" | "register";

export type AppleBrowserSignInOutcome =
  | { kind: "success"; handoff: string; resultCode: "success" | "two_factor_required" }
  | { kind: "cancelled" }
  | { kind: "unavailable" }
  | { kind: "failed"; resultCode: string }
  | { kind: "error"; message: string };

/**
 * Android-only: browser Services-ID Apple OAuth is available when running on Android.
 * iOS must continue to use native expo-apple-authentication.
 */
export function isBrowserAppleAuthAvailable(): boolean {
  return Platform.OS === "android";
}

function normalizeApiBase(apiBaseUrl: string): string {
  const raw = String(apiBaseUrl || "").trim().replace(/\/$/, "");
  if (!raw) return "https://workspace.checkstation.app/api";
  return raw.endsWith("/api") ? raw : `${raw}/api`;
}

export function buildAppleBrowserStartUrl(options: {
  apiBaseUrl: string;
  intent: AppleBrowserIntent;
  legalAcknowledgement?: boolean;
  mobileReturnUrl?: string;
}): string {
  const apiBase = normalizeApiBase(options.apiBaseUrl);
  const startUrl = new URL(`${apiBase}/auth/apple/start/`);
  startUrl.searchParams.set("intent", options.intent);
  startUrl.searchParams.set(
    "mobile_return_url",
    options.mobileReturnUrl || MOBILE_APPLE_RETURN_URL,
  );
  if (options.intent === "register") {
    startUrl.searchParams.set("legal_acknowledgement", "true");
  }
  return startUrl.toString();
}

export function parseAppleBrowserReturnUrl(url: string): {
  resultCode: string;
  handoff: string;
} {
  const parsed = Linking.parse(url);
  const query = (parsed.queryParams || {}) as Record<string, string | string[] | undefined>;
  const resultRaw = query.result;
  const handoffRaw = query.handoff;
  const resultCode = String(Array.isArray(resultRaw) ? resultRaw[0] : resultRaw || "").trim();
  const handoff = String(Array.isArray(handoffRaw) ? handoffRaw[0] : handoffRaw || "").trim();
  return { resultCode, handoff };
}

function isAppleResultDeepLink(url: string): boolean {
  const parsed = Linking.parse(url);
  const scheme = String(parsed.scheme || "").toLowerCase();
  const host = String(parsed.hostname || "").toLowerCase();
  // Linking may expose path with or without leading slash.
  const path = String(parsed.path || "").replace(/^\//, "");
  return scheme === "checkstation" && host === "auth" && path === "apple-result";
}

/**
 * Open the existing backend Apple Services-ID browser flow and return a one-time
 * handoff for POST /api/auth/desktop-handoff/.
 *
 * Android only. Does not call /auth/apple/native/.
 */
export async function requestBrowserAppleCredential(options: {
  apiBaseUrl: string;
  intent: AppleBrowserIntent;
  legalAcknowledgement?: boolean;
}): Promise<AppleBrowserSignInOutcome> {
  if (!isBrowserAppleAuthAvailable()) {
    return { kind: "unavailable" };
  }
  if (options.intent === "register" && !options.legalAcknowledgement) {
    return { kind: "failed", resultCode: "legal_acknowledgement_required" };
  }

  const startUrl = buildAppleBrowserStartUrl({
    apiBaseUrl: options.apiBaseUrl,
    intent: options.intent,
    legalAcknowledgement: options.legalAcknowledgement,
  });

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(startUrl, MOBILE_APPLE_RETURN_URL);
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Apple sign-in failed",
    };
  }

  if (result.type === "cancel" || result.type === "dismiss") {
    return { kind: "cancelled" };
  }
  if (result.type !== "success" || !result.url) {
    return { kind: "error", message: "Apple sign-in did not complete." };
  }
  if (!isAppleResultDeepLink(result.url)) {
    return { kind: "error", message: "Apple sign-in returned an unexpected destination." };
  }

  const { resultCode, handoff } = parseAppleBrowserReturnUrl(result.url);
  if (!resultCode) {
    return { kind: "error", message: "Apple sign-in did not return a result." };
  }

  if (resultCode === "success" || resultCode === "two_factor_required") {
    if (!handoff) {
      return { kind: "error", message: "Apple sign-in handoff was missing." };
    }
    return { kind: "success", handoff, resultCode };
  }

  return { kind: "failed", resultCode };
}

/** Map backend Apple browser result codes to existing mobile auth copy keys when possible. */
export function appleBrowserFailureMessageKey(resultCode: string): string {
  switch (resultCode) {
    case "no_account":
      return "auth.appleNoAccount";
    case "existing_account_connect_required":
      return "auth.appleExistingAccount";
    case "legal_acknowledgement_required":
      return "auth.legalRequired";
    case "email_missing":
      return "auth.appleEmailMissing";
    case "email_not_verified":
      return "auth.appleEmailNotVerified";
    case "oauth_not_configured":
      return "auth.appleUnavailable";
    case "invalid_state":
    case "authentication_failed":
    case "apple_already_linked":
    default:
      return "auth.appleFailed";
  }
}
