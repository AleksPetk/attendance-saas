import Constants from "expo-constants";
import { Platform } from "react-native";

export type GoogleNativeIntent = "login" | "register" | "verify" | "link";

export type GoogleNativeCredential = {
  identityToken: string;
};

export type GoogleNativeSignInOutcome =
  | { kind: "success"; credential: GoogleNativeCredential }
  | { kind: "cancelled" }
  | { kind: "unavailable" }
  | { kind: "misconfigured" }
  | { kind: "missing_token" }
  | { kind: "error"; message: string };

type GoogleSignInModule = {
  GoogleSignin: {
    configure: (options: {
      iosClientId?: string;
      webClientId: string;
      offlineAccess?: boolean;
    }) => void;
    hasPlayServices: (options?: {
      showPlayServicesUpdateDialog?: boolean;
    }) => Promise<boolean>;
    signIn: () => Promise<
      | { type: "success"; data: { idToken: string | null } }
      | { type: "cancelled"; data: null }
    >;
    hasPreviousSignIn: () => boolean;
    signOut: () => Promise<null>;
  };
  statusCodes: {
    SIGN_IN_CANCELLED: string;
    IN_PROGRESS?: string;
    PLAY_SERVICES_NOT_AVAILABLE?: string;
  };
  isErrorWithCode: (error: unknown) => error is { code: string };
};

let googleModule: GoogleSignInModule | null | undefined;
let configuredKey: string | null = null;

function loadGoogleModule(): GoogleSignInModule | null {
  if (googleModule !== undefined) return googleModule;
  try {
    // Native module — unavailable in Expo Go / non-dev-client environments.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    googleModule = require("@react-native-google-signin/google-signin") as GoogleSignInModule;
  } catch {
    googleModule = null;
  }
  return googleModule;
}

function looksLikeGoogleClientId(value: string): boolean {
  if (!value) return false;
  if (value.includes("CHECKSTATION_NATIVE_IOS_CLIENT_PLACEHOLDER")) return false;
  if (value.includes("REPLACE_ME")) return false;
  return value.includes(".apps.googleusercontent.com");
}

export function getGoogleIosClientId(): string {
  const extra = Constants.expoConfig?.extra as { googleIosClientId?: string } | undefined;
  return String(extra?.googleIosClientId || "").trim();
}

export function getGoogleWebClientId(): string {
  const extra = Constants.expoConfig?.extra as { googleWebClientId?: string } | undefined;
  return String(extra?.googleWebClientId || "").trim();
}

export function getGoogleIosUrlScheme(): string {
  const extra = Constants.expoConfig?.extra as { googleIosUrlScheme?: string } | undefined;
  return String(extra?.googleIosUrlScheme || "").trim();
}

function isSupportedNativeGooglePlatform(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

/**
 * Platform-aware Google native config check.
 *
 * iOS requires both the iOS client ID (app identity) and Web client ID
 * (ID-token audience / serverClientID).
 * Android requires only the Web client ID — package + Play SHA-1 identify
 * the app in Google Cloud; the Android OAuth client ID is not configured here.
 */
export function isGoogleNativeConfigured(): boolean {
  const webOk = looksLikeGoogleClientId(getGoogleWebClientId());
  if (Platform.OS === "ios") {
    return looksLikeGoogleClientId(getGoogleIosClientId()) && webOk;
  }
  if (Platform.OS === "android") {
    return webOk;
  }
  return false;
}

async function androidPlayServicesUsable(
  mod: GoogleSignInModule,
  showUpdateDialog: boolean,
): Promise<boolean> {
  try {
    return await mod.GoogleSignin.hasPlayServices({
      showPlayServicesUpdateDialog: showUpdateDialog,
    });
  } catch {
    return false;
  }
}

export async function isNativeGoogleAuthAvailable(): Promise<boolean> {
  if (!isSupportedNativeGooglePlatform()) return false;
  if (!isGoogleNativeConfigured()) return false;
  const mod = loadGoogleModule();
  if (!mod) return false;
  if (Platform.OS === "android") {
    return androidPlayServicesUsable(mod, false);
  }
  return true;
}

function ensureConfigured(mod: GoogleSignInModule): boolean {
  if (!isGoogleNativeConfigured()) return false;
  const webClientId = getGoogleWebClientId();

  if (Platform.OS === "ios") {
    const iosClientId = getGoogleIosClientId();
    const key = `ios|${iosClientId}|${webClientId}`;
    if (configuredKey === key) return true;
    try {
      mod.GoogleSignin.configure({
        iosClientId,
        webClientId,
        offlineAccess: false,
      });
      configuredKey = key;
      return true;
    } catch {
      return false;
    }
  }

  if (Platform.OS === "android") {
    const key = `android|${webClientId}`;
    if (configuredKey === key) return true;
    try {
      // webClientId sets ID-token audience to the existing Web OAuth client.
      // Android OAuth client ID is not passed — Play package/SHA identify the app.
      mod.GoogleSignin.configure({
        webClientId,
        offlineAccess: false,
      });
      configuredKey = key;
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

function isCancelError(mod: GoogleSignInModule, error: unknown): boolean {
  if (mod.isErrorWithCode?.(error) && error.code === mod.statusCodes.SIGN_IN_CANCELLED) {
    return true;
  }
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return code === "SIGN_IN_CANCELLED" || code === "-5" || code === "12501";
}

function isPlayServicesError(mod: GoogleSignInModule, error: unknown): boolean {
  const playCode = mod.statusCodes.PLAY_SERVICES_NOT_AVAILABLE;
  if (playCode && mod.isErrorWithCode?.(error) && error.code === playCode) {
    return true;
  }
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return code === "PLAY_SERVICES_NOT_AVAILABLE" || code === "2";
}

/**
 * Present native Google Sign-In and return an ID token for
 * POST /api/auth/google/native/.
 *
 * Uses the system Google Sign-In sheet — not browser OAuth redirects.
 * Does not generate or send an unbound nonce. Original Google Sign-In does not
 * bind a custom nonce to signIn(); AppAuth may embed an opaque value we cannot match.
 *
 * Supported on iOS and Android. ID-token audience is always the Web OAuth client.
 */
export async function requestNativeGoogleCredential(): Promise<GoogleNativeSignInOutcome> {
  if (!isSupportedNativeGooglePlatform()) {
    return { kind: "unavailable" };
  }
  if (!isGoogleNativeConfigured()) {
    return { kind: "misconfigured" };
  }

  const mod = loadGoogleModule();
  if (!mod) {
    return { kind: "unavailable" };
  }
  if (!ensureConfigured(mod)) {
    return { kind: "misconfigured" };
  }

  if (Platform.OS === "android") {
    try {
      const playOk = await mod.GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      if (!playOk) {
        return { kind: "unavailable" };
      }
    } catch (error) {
      if (isPlayServicesError(mod, error)) {
        return { kind: "unavailable" };
      }
      return {
        kind: "error",
        message: error instanceof Error ? error.message : "Google Play Services unavailable",
      };
    }
  }

  try {
    // Clear prior interactive session so account picker can appear.
    if (mod.GoogleSignin.hasPreviousSignIn()) {
      try {
        await mod.GoogleSignin.signOut();
      } catch {
        // Ignore sign-out failures; sign-in may still succeed.
      }
    }

    const response = await mod.GoogleSignin.signIn();
    if (response.type === "cancelled") {
      return { kind: "cancelled" };
    }
    const identityToken = response.data?.idToken;
    if (!identityToken) {
      return { kind: "missing_token" };
    }
    return {
      kind: "success",
      credential: {
        identityToken,
      },
    };
  } catch (error) {
    if (isCancelError(mod, error)) {
      return { kind: "cancelled" };
    }
    if (Platform.OS === "android" && isPlayServicesError(mod, error)) {
      return { kind: "unavailable" };
    }
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Google sign-in failed",
    };
  }
}
