/**
 * MAS desktop Google Sign-In via system-browser OAuth (PKCE + loopback).
 *
 * Obtains a Google ID token, then the renderer completes CheckStation auth with
 * AuthController.completeGoogleNative → POST /api/auth/google/native/.
 *
 * Uses the Google Cloud Desktop OAuth client ID + client secret for token
 * exchange (still with PKCE). ID-token audience is that Desktop client ID
 * (backend GOOGLE_NATIVE_DESKTOP_CLIENT_ID). DIRECT uses googleWebOAuth.cjs
 * (Web client + desktop handoff) instead. Never log the secret or tokens.
 */

const http = require("http");
const crypto = require("crypto");
const { shell } = require("electron");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = "openid email profile";
const LOOPBACK_PATH = "/google-oauth-callback";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function looksLikeGoogleClientId(value) {
  const id = String(value || "").trim();
  if (!id) return false;
  if (id.includes("REPLACE_ME") || id.includes("PLACEHOLDER")) return false;
  return id.includes(".apps.googleusercontent.com");
}

function resolveDesktopClientId(options = {}) {
  return String(
    options.clientId
    || process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_ID
    || process.env.VITE_GOOGLE_DESKTOP_OAUTH_CLIENT_ID
    || "",
  ).trim();
}

function resolveDesktopClientSecret(options = {}) {
  return String(
    options.clientSecret
    || process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET
    || "",
  ).trim();
}

function isGoogleDesktopOAuthConfigured(options = {}) {
  return looksLikeGoogleClientId(resolveDesktopClientId(options))
    && Boolean(resolveDesktopClientSecret(options));
}

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomUrlSafe(bytes = 32) {
  return base64Url(crypto.randomBytes(bytes));
}

function createPkce() {
  const verifier = randomUrlSafe(32);
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function listenLoopback() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("loopback_bind_failed"));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

function waitForCallback(server, { expectedState, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      finish(() => reject(Object.assign(new Error("timeout"), { code: "timeout" })));
    }, timeoutMs);

    function finish(fn) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close(() => fn());
    }

    server.on("request", (req, res) => {
      try {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        if (url.pathname !== LOOPBACK_PATH) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }

        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description") || "";
        const state = url.searchParams.get("state") || "";
        const code = url.searchParams.get("code") || "";

        if (error === "access_denied") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(closePage("Google sign-in cancelled", "You can close this window and return to CheckStation."));
          finish(() => reject(Object.assign(new Error("cancelled"), { code: "cancelled" })));
          return;
        }

        if (error) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(closePage("Google sign-in failed", errorDescription || error));
          finish(() => reject(Object.assign(new Error(error), {
            code: "provider_error",
            detail: errorDescription || error,
          })));
          return;
        }

        if (!state || state !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(closePage("Google sign-in failed", "Invalid sign-in state. Try again from CheckStation."));
          finish(() => reject(Object.assign(new Error("invalid_state"), { code: "invalid_state" })));
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(closePage("Google sign-in failed", "Missing authorization code."));
          finish(() => reject(Object.assign(new Error("missing_code"), { code: "missing_code" })));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(closePage(
          "Signed in with Google",
          "Returning to CheckStation…",
          { autoClose: true },
        ));
        finish(() => resolve({ code }));
      } catch (err) {
        try {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Error");
        } catch {
          /* ignore */
        }
        finish(() => reject(err));
      }
    });
  });
}

function closePage(title, body, options = {}) {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);
  const autoClose = options.autoClose !== false;
  // Best-effort tab close; Electron focus does not depend on this succeeding.
  const closeScript = autoClose
    ? `<script>
(function(){
  function tryClose(){ try { window.close(); } catch (e) {} }
  tryClose();
  setTimeout(tryClose, 50);
  setTimeout(tryClose, 400);
})();
</script>`
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;padding:48px;color:#0f172a;background:#f8fafc}
h1{font-size:20px;margin:0 0 8px}p{color:#475569;margin:0}
</style></head>
<body><h1>${safeTitle}</h1><p>${safeBody}</p>
${closeScript}
</body></html>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function exchangeCodeForIdToken({
  clientId,
  clientSecret,
  code,
  redirectUri,
  codeVerifier,
}) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
  const secret = String(clientSecret || "").trim();
  if (secret) {
    body.set("client_secret", secret);
  }
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Object.assign(new Error("token_exchange_failed"), { code: "token_exchange_failed" });
  }
  if (!response.ok) {
    throw Object.assign(new Error(data.error || "token_exchange_failed"), {
      code: "token_exchange_failed",
      detail: data.error_description || data.error || "",
    });
  }
  const identityToken = String(data.id_token || "").trim();
  if (!identityToken) {
    throw Object.assign(new Error("missing_token"), { code: "missing_token" });
  }
  return identityToken;
}

/**
 * Run interactive Google OAuth in the system browser.
 * Returns { kind, identityToken? , message? } — never logs tokens.
 */
async function requestGoogleIdentityToken(options = {}) {
  const clientId = resolveDesktopClientId(options);
  const clientSecret = resolveDesktopClientSecret(options);
  if (!looksLikeGoogleClientId(clientId) || !clientSecret) {
    return { kind: "misconfigured" };
  }

  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const openExternal = options.openExternal || ((url) => shell.openExternal(url));
  const { verifier, challenge } = createPkce();
  const state = randomUrlSafe(24);

  let server;
  let port;
  try {
    ({ server, port } = await listenLoopback());
  } catch {
    return { kind: "error", message: "Could not start local Google sign-in callback." };
  }

  const redirectUri = `http://127.0.0.1:${port}${LOOPBACK_PATH}`;
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("prompt", "select_account");

  const callbackPromise = waitForCallback(server, { expectedState: state, timeoutMs });

  try {
    await openExternal(authUrl.toString());
  } catch {
    server.close();
    return { kind: "error", message: "Could not open the system browser for Google sign-in." };
  }

  try {
    const { code } = await callbackPromise;
    const identityToken = await exchangeCodeForIdToken({
      clientId,
      clientSecret,
      code,
      redirectUri,
      codeVerifier: verifier,
    });
    // Only after successful token exchange — restore/focus the existing main window.
    if (typeof options.bringToForeground === "function") {
      try {
        options.bringToForeground();
      } catch {
        /* best-effort */
      }
    }
    return { kind: "success", identityToken };
  } catch (err) {
    const code = err && typeof err === "object" ? err.code : "";
    if (code === "cancelled") return { kind: "cancelled" };
    if (code === "timeout") {
      return { kind: "error", message: "Google sign-in timed out. Try again." };
    }
    if (code === "provider_error") {
      return { kind: "error", message: "Google sign-in was denied or failed." };
    }
    if (code === "missing_token" || code === "token_exchange_failed") {
      return { kind: "missing_token" };
    }
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "Google sign-in failed",
    };
  }
}

module.exports = {
  requestGoogleIdentityToken,
  isGoogleDesktopOAuthConfigured,
  resolveDesktopClientId,
  resolveDesktopClientSecret,
  looksLikeGoogleClientId,
  LOOPBACK_PATH,
  // test helpers
  _createPkce: createPkce,
  _base64Url: base64Url,
  _exchangeCodeForIdToken: exchangeCodeForIdToken,
  _closePage: closePage,
};
