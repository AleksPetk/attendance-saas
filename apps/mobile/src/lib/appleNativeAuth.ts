import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

export type AppleNativeIntent = "login" | "register" | "verify" | "link";

export type AppleNativeCredential = {
  identityToken: string;
  nonce: string;
  fullName: {
    givenName?: string | null;
    familyName?: string | null;
  } | null;
};

export type AppleNativeSignInOutcome =
  | { kind: "success"; credential: AppleNativeCredential }
  | { kind: "cancelled" }
  | { kind: "unavailable" }
  | { kind: "missing_token" }
  | { kind: "error"; message: string };

function isCancelError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return code === "ERR_REQUEST_CANCELED" || code === "ERR_CANCELED";
}

/**
 * Cryptographically secure raw nonce sent to CheckStation backend.
 * AppleAuthentication must receive SHA-256(hex) of this value; Apple embeds
 * that hash unchanged in the identity-token `nonce` claim.
 */
export async function createAppleRawNonce(byteLength = 32): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(byteLength);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

/** SHA-256 hex digest of the raw nonce — the value passed to Apple. */
export async function hashAppleNonceForRequest(rawNonce: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
}

export async function isNativeAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Present the native Apple sheet and return identityToken + raw nonce
 * for POST /api/auth/apple/native/.
 */
export async function requestNativeAppleCredential(): Promise<AppleNativeSignInOutcome> {
  if (!(await isNativeAppleAuthAvailable())) {
    return { kind: "unavailable" };
  }

  const rawNonce = await createAppleRawNonce();
  const hashedNonce = await hashAppleNonceForRequest(rawNonce);
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      // Native Sign in with Apple expects the SHA-256 hex of the raw nonce.
      // Apple returns that hash unchanged in the ID token `nonce` claim.
      nonce: hashedNonce,
    });
    const identityToken = credential.identityToken;
    if (!identityToken) {
      return { kind: "missing_token" };
    }
    return {
      kind: "success",
      credential: {
        identityToken,
        // Backend re-hashes this raw value and compares to the token claim.
        nonce: rawNonce,
        fullName: credential.fullName
          ? {
              givenName: credential.fullName.givenName,
              familyName: credential.fullName.familyName,
            }
          : null,
      },
    };
  } catch (error) {
    if (isCancelError(error)) {
      return { kind: "cancelled" };
    }
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Apple sign-in failed",
    };
  }
}
