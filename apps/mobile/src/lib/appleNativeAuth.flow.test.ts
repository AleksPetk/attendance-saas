import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative: string) => readFileSync(`${root}/${relative}`, "utf8");

const appleAuth = read("src/lib/appleNativeAuth.ts");
const googleAuth = read("src/lib/googleNativeAuth.ts");
const ui = read("src/components/ui.tsx");
const signIn = read("app/(auth)/sign-in.tsx");
const register = read("app/(auth)/register.tsx");
const appJson = read("app.json");
const appConfig = read("app.config.js");
const packageJson = read("package.json");
const authController = readFileSync(
  fileURLToPath(new URL("../../../../packages/auth/src/controller.ts", import.meta.url)),
  "utf8",
);

test("expo-apple-authentication is declared and iOS Sign in with Apple is enabled", () => {
  assert.match(packageJson, /"expo-apple-authentication"/);
  assert.match(appJson, /"expo-apple-authentication"/);
  assert.match(appJson, /"usesAppleSignIn"\s*:\s*true/);
  assert.match(appJson, /"bundleIdentifier"\s*:\s*"app\.checkstation\.client"/);
});

test("native Google Sign-In package and Expo plugin are configured for iOS", () => {
  assert.match(packageJson, /"@react-native-google-signin\/google-signin"/);
  assert.match(appConfig, /@react-native-google-signin\/google-signin/);
  assert.match(appConfig, /iosUrlScheme/);
  assert.match(appConfig, /googleIosClientId/);
  assert.match(appConfig, /533996414208-a130ppp91kc0seu6jondvrth2i94i7qa\.apps\.googleusercontent\.com/);
  assert.match(appConfig, /com\.googleusercontent\.apps\.533996414208-a130ppp91kc0seu6jondvrth2i94i7qa/);
  assert.doesNotMatch(googleAuth, /auth\/google\/start/);
});

test("native Apple helper hashes the raw nonce for Apple and sends raw to backend", () => {
  assert.match(appleAuth, /AppleAuthentication\.signInAsync/);
  assert.match(appleAuth, /AppleAuthenticationScope\.FULL_NAME/);
  assert.match(appleAuth, /AppleAuthenticationScope\.EMAIL/);
  assert.match(appleAuth, /createAppleRawNonce/);
  assert.match(appleAuth, /hashAppleNonceForRequest/);
  assert.match(appleAuth, /CryptoDigestAlgorithm\.SHA256/);
  assert.match(appleAuth, /digestStringAsync/);
  assert.match(appleAuth, /nonce:\s*hashedNonce/);
  assert.match(appleAuth, /nonce:\s*rawNonce/);
  assert.match(appleAuth, /getRandomBytesAsync/);
  assert.match(appleAuth, /ERR_REQUEST_CANCELED/);
  assert.match(appleAuth, /identityToken/);
  assert.doesNotMatch(appleAuth, /WebView/);
});

test("native Google helper uses GoogleSignin and configures iosClientId only", () => {
  assert.match(googleAuth, /GoogleSignin/);
  assert.match(googleAuth, /iosClientId/);
  assert.match(googleAuth, /offlineAccess:\s*false/);
  assert.match(googleAuth, /requestNativeGoogleCredential/);
  assert.match(googleAuth, /isNativeGoogleAuthAvailable/);
  assert.match(googleAuth, /type === "cancelled"/);
  assert.match(googleAuth, /kind: "cancelled"/);
  assert.match(googleAuth, /SIGN_IN_CANCELLED/);
  assert.match(googleAuth, /Platform\.OS !== "ios"/);
  assert.doesNotMatch(googleAuth, /webClientId/);
});

test("OAuthProviderButtons wires Google and Apple native presses", () => {
  assert.match(ui, /onApplePress\?:/);
  assert.match(ui, /onGooglePress\?:/);
  assert.match(ui, /googleAvailable\?:/);
  assert.match(ui, /appleAvailable\?:/);
  assert.match(ui, /onApplePress/);
  assert.match(ui, /onGooglePress/);
  assert.match(ui, /notifyUnavailable/);
  assert.match(ui, /googleLabel/);
});

test("Sign In uses login intent through AuthController for Apple and Google", () => {
  assert.match(signIn, /requestNativeAppleCredential/);
  assert.match(signIn, /requestNativeGoogleCredential/);
  assert.match(signIn, /completeAppleNative/);
  assert.match(signIn, /completeGoogleNative/);
  assert.match(signIn, /intent:\s*"login"/);
  assert.match(signIn, /kind === "cancelled"/);
  assert.match(signIn, /kind === "two_factor_required"/);
  assert.match(signIn, /signInErrorMessage/);
  assert.match(signIn, /onGooglePress/);
});

test("Create Account uses register intent and requires legal acknowledgement for Google and Apple", () => {
  assert.match(register, /requestNativeAppleCredential/);
  assert.match(register, /requestNativeGoogleCredential/);
  assert.match(register, /completeAppleNative/);
  assert.match(register, /completeGoogleNative/);
  assert.match(register, /intent:\s*"register"/);
  assert.match(register, /legalAcknowledgement:\s*accepted/);
  assert.match(register, /auth\.legalRequired/);
  assert.match(register, /onGooglePress/);
});

test("AuthController Apple and Google completion use cookie jar session path", () => {
  assert.match(authController, /completeAppleNative/);
  assert.match(authController, /completeGoogleNative/);
  assert.match(authController, /endpoints\.appleNativeComplete\(\)/);
  assert.match(authController, /endpoints\.googleNativeComplete\(\)/);
  assert.match(authController, /identity_token/);
  assert.match(authController, /finishOwnerFirstFactor/);
  assert.match(authController, /endpoints\.workspace\(\)/);
  assert.match(authController, /two_factor_required/);
  assert.match(authController, /verifyAppleNative/);
  assert.match(authController, /verifyGoogleNative/);
  assert.match(authController, /intent:\s*"verify"/);
});
