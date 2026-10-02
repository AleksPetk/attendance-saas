/**
 * DIRECT desktop Sign in with Apple via existing browser Services-ID OAuth.
 *
 * Flow: system browser → /api/auth/apple/start/ → Apple → backend callback →
 * loopback with result + one-time handoff → renderer POSTs /auth/desktop-handoff/.
 *
 * Not used for MAS (native Apple Sign-In later). Never log handoff tokens.
 */

const { shell } = require("electron");
const { listenLoopback, waitForLoopbackCallback } = require("./browserReturn.cjs");

const LOOPBACK_PATH = "/apple-oauth-result";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function resolveApiBaseUrl(options = {}) {
  const raw = String(
    options.apiBaseUrl
    || process.env.VITE_API_BASE_URL
    || "",
  ).trim().replace(/\/$/, "");
  if (raw) {
    return raw.endsWith("/api") ? raw : `${raw}/api`;
  }
  // Packaged DIRECT defaults to production workspace API.
  try {
    const { app } = require("electron");
    if (app && app.isPackaged) {
      return "https://workspace.checkstation.app/api";
    }
  } catch {
    /* ignore */
  }
  return "http://localhost:8000/api";
}

/**
 * Open browser Apple web OAuth and wait for desktop loopback completion.
 * Returns { kind, resultCode?, handoff? } — never logs handoff.
 */
async function requestAppleWebOAuth(options = {}) {
  const intent = options.intent === "register" ? "register" : "login";
  const legalAcknowledgement = Boolean(options.legalAcknowledgement);
  if (intent === "register" && !legalAcknowledgement) {
    return { kind: "error", message: "legal_acknowledgement_required" };
  }

  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const openExternal = options.openExternal || ((url) => shell.openExternal(url));
  const apiBase = resolveApiBaseUrl(options);

  let server;
  let port;
  try {
    ({ server, port } = await listenLoopback());
  } catch {
    return { kind: "error", message: "Could not start local Apple sign-in callback." };
  }

  const desktopReturnUrl = `http://127.0.0.1:${port}${LOOPBACK_PATH}`;
  const startUrl = new URL(`${apiBase}/auth/apple/start/`);
  startUrl.searchParams.set("intent", intent);
  startUrl.searchParams.set("desktop_return_url", desktopReturnUrl);
  if (intent === "register") {
    startUrl.searchParams.set("legal_acknowledgement", "true");
  }

  const callbackPromise = waitForLoopbackCallback(server, {
    pathname: LOOPBACK_PATH,
    timeoutMs,
    title: "Signed in with Apple",
    body: "Returning to CheckStation…",
  });

  try {
    await openExternal(startUrl.toString());
  } catch {
    server.close();
    return { kind: "error", message: "Could not open the system browser for Apple sign-in." };
  }

  try {
    const params = await callbackPromise;
    const resultCode = String(params.get("result") || "").trim();
    const handoff = String(params.get("handoff") || "").trim();

    if (!resultCode) {
      return { kind: "error", message: "Apple sign-in did not return a result." };
    }

    // Valid loopback completion only (match Google: focus after success path, not
    // on timeout / malformed callback). Failed business results still focus so the
    // sign-in UI error is visible.
    if (typeof options.bringToForeground === "function") {
      try {
        options.bringToForeground();
      } catch {
        /* best-effort */
      }
    }

    if (resultCode === "success" || resultCode === "two_factor_required") {
      if (!handoff) {
        return { kind: "error", message: "Apple sign-in handoff was missing." };
      }
      return { kind: "success", resultCode, handoff };
    }

    if (
      resultCode === "no_account"
      || resultCode === "existing_account_connect_required"
      || resultCode === "email_not_verified"
      || resultCode === "email_missing"
      || resultCode === "legal_acknowledgement_required"
      || resultCode === "authentication_failed"
      || resultCode === "invalid_state"
      || resultCode === "oauth_not_configured"
      || resultCode === "apple_already_linked"
    ) {
      return { kind: "failed", resultCode };
    }

    return { kind: "failed", resultCode };
  } catch (err) {
    const code = err && typeof err === "object" ? err.code : "";
    if (code === "timeout") {
      return { kind: "error", message: "Apple sign-in timed out. Try again." };
    }
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "Apple sign-in failed",
    };
  }
}

module.exports = {
  requestAppleWebOAuth,
  resolveApiBaseUrl,
  LOOPBACK_PATH,
};
