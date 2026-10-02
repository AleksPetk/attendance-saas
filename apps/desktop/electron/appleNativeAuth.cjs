/**
 * MAS native Sign in with Apple via in-process ASAuthorization (MacApple native module).
 * Reuses AuthController.completeAppleNative → POST /api/auth/apple/native/.
 * Never logs identity tokens.
 */

const crypto = require("crypto");
const { invokeMacBridge, isMacBridgeAvailable } = require("./macBridge.cjs");

function createAppleRawNonce(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString("hex");
}

function hashAppleNonceForRequest(rawNonce) {
  return crypto.createHash("sha256").update(String(rawNonce || ""), "utf8").digest("hex");
}

/**
 * @returns {Promise<
 *   | { kind: "success"; identityToken: string; nonce: string; fullName?: object|null }
 *   | { kind: "cancelled" }
 *   | { kind: "unavailable" }
 *   | { kind: "signing_required" }
 *   | { kind: "missing_token" }
 *   | { kind: "error"; message?: string }
 * >}
 */
async function requestAppleNativeIdentity(options = {}) {
  const invoke = options.invoke || invokeMacBridge;
  if (!options.invoke && !isMacBridgeAvailable()) {
    return { kind: "signing_required" };
  }

  const rawNonce = createAppleRawNonce();
  const hashedNonce = hashAppleNonceForRequest(rawNonce);
  const result = await invoke({ cmd: "appleSignIn", hashedNonce });

  if (!result || result.ok !== true) {
    const code = String(result?.code || "");
    if (code === "cancelled") return { kind: "cancelled" };
    if (code === "signing_required" || code === "unavailable") {
      return { kind: "signing_required" };
    }
    if (code === "missing_token") return { kind: "missing_token" };
    return {
      kind: "error",
      message: String(result?.message || "Apple sign-in failed"),
    };
  }

  const identityToken = String(result.identityToken || "").trim();
  if (!identityToken) return { kind: "missing_token" };

  if (typeof options.bringToForeground === "function") {
    try {
      options.bringToForeground();
    } catch {
      /* best-effort */
    }
  }

  return {
    kind: "success",
    identityToken,
    nonce: rawNonce,
    fullName: result.fullName && typeof result.fullName === "object" ? result.fullName : null,
  };
}

module.exports = {
  requestAppleNativeIdentity,
  createAppleRawNonce,
  hashAppleNonceForRequest,
  isMacBridgeAvailable,
};
