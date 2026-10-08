import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative: string) => readFileSync(`${root}/${relative}`, "utf8");

const googleAuth = read("src/lib/googleNativeAuth.ts");
const appJson = read("app.json");
const easJson = read("eas.json");
const appConfig = read("app.config.js");
const authController = readFileSync(
  fileURLToPath(new URL("../../../../packages/auth/src/controller.ts", import.meta.url)),
  "utf8",
);

test("iOS Google native config still requires both iOS and Web client IDs", () => {
  assert.match(googleAuth, /Platform\.OS === "ios"/);
  assert.match(googleAuth, /getGoogleIosClientId\(\)/);
  assert.match(googleAuth, /getGoogleWebClientId\(\)/);
  // iOS branch of isGoogleNativeConfigured requires both client IDs.
  assert.match(
    googleAuth,
    /if \(Platform\.OS === "ios"\) \{\s*return looksLikeGoogleClientId\(getGoogleIosClientId\(\)\) && webOk;/,
  );
  // iOS configure still passes both client IDs.
  assert.match(
    googleAuth,
    /mod\.GoogleSignin\.configure\(\{\s*iosClientId,\s*webClientId,\s*offlineAccess:\s*false,\s*\}\)/,
  );
});

test("Android Google native config requires Web client ID and not iOS client ID", () => {
  // Android configured check is web-only.
  assert.match(
    googleAuth,
    /if \(Platform\.OS === "android"\) \{\s*return webOk;/,
  );
  // Android configure uses webClientId only (no iosClientId in that call).
  assert.match(
    googleAuth,
    /mod\.GoogleSignin\.configure\(\{\s*webClientId,\s*offlineAccess:\s*false,\s*\}\)/,
  );
  // Android OAuth client ID must not be embedded as a runtime configure value.
  assert.doesNotMatch(googleAuth, /androidClientId/);
  assert.doesNotMatch(googleAuth, /EXPO_PUBLIC_GOOGLE_ANDROID/);
  assert.doesNotMatch(appConfig, /googleAndroidClientId/);
  assert.doesNotMatch(easJson, /EXPO_PUBLIC_GOOGLE_ANDROID/);
});

test("Android is no longer hard-gated unavailable solely for Platform.OS !== ios", () => {
  assert.doesNotMatch(googleAuth, /if \(Platform\.OS !== "ios"\) return false;/);
  assert.doesNotMatch(googleAuth, /if \(Platform\.OS !== "ios"\) \{\s*return \{ kind: "unavailable" \};/);
  assert.match(googleAuth, /isSupportedNativeGooglePlatform/);
  assert.match(googleAuth, /Platform\.OS === "ios" \|\| Platform\.OS === "android"/);
});

test("Android Play Services unavailability maps to safe unavailable or error outcomes", () => {
  assert.match(googleAuth, /hasPlayServices/);
  assert.match(googleAuth, /androidPlayServicesUsable\(mod, false\)/);
  assert.match(googleAuth, /showPlayServicesUpdateDialog:\s*showUpdateDialog/);
  assert.match(googleAuth, /showPlayServicesUpdateDialog:\s*true/);
  assert.match(googleAuth, /PLAY_SERVICES_NOT_AVAILABLE/);
  assert.match(googleAuth, /isPlayServicesError/);
  assert.match(googleAuth, /kind: "unavailable"/);
});

test("successful native Google credential still exposes ID token identityToken shape", () => {
  assert.match(googleAuth, /identityToken/);
  assert.match(googleAuth, /response\.data\?\.idToken/);
  assert.match(googleAuth, /kind: "success"/);
  assert.match(googleAuth, /credential:\s*\{\s*identityToken,/);
  assert.doesNotMatch(googleAuth, /serverAuthCode/);
  assert.doesNotMatch(googleAuth, /accessToken/);
});

test("unsupported platforms remain unavailable", () => {
  assert.match(googleAuth, /isSupportedNativeGooglePlatform/);
  assert.match(
    googleAuth,
    /if \(!isSupportedNativeGooglePlatform\(\)\) \{\s*return \{ kind: "unavailable" \};/,
  );
  assert.match(
    googleAuth,
    /if \(!isSupportedNativeGooglePlatform\(\)\) return false;/,
  );
});

test("backend Google native payload path remains identity_token via existing AuthController", () => {
  assert.match(authController, /completeGoogleNative/);
  assert.match(authController, /endpoints\.googleNativeComplete\(\)/);
  assert.match(authController, /identity_token/);
  const googleComplete = authController.slice(authController.indexOf("completeGoogleNative"));
  const googleCompleteBody = googleComplete.slice(0, googleComplete.indexOf("verifyGoogleNative"));
  assert.doesNotMatch(googleCompleteBody, /nonce:/);
  assert.doesNotMatch(googleCompleteBody, /access_token/);
  assert.doesNotMatch(googleCompleteBody, /server_auth_code/);
});

test("Play internal Android profile inherits Web OAuth client env; versionCode is 9", () => {
  assert.match(easJson, /"play-internal-android"/);
  assert.match(easJson, /"extends":\s*"preview"/);
  assert.match(easJson, /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID/);
  assert.match(appJson, /"package":\s*"app\.checkstation\.mobile"/);
  assert.match(appJson, /"versionCode":\s*9/);
});
