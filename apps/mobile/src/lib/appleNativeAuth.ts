import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

export type AppleNativeIntent = "login" | "register";

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

/** Cryptographically secure raw nonce for AppleAuthentication.signInAsync. */
export async function createAppleRawNonce(byteLength = 32): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(byteLength);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
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

  const nonce = await createAppleRawNonce();
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce,
    });
    const identityToken = credential.identityToken;
    if (!identityToken) {
      return { kind: "missing_token" };
    }
    return {
      kind: "success",
      credential: {
        identityToken,
        nonce,
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
