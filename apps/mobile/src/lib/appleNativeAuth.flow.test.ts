import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative: string) => readFileSync(`${root}/${relative}`, "utf8");

const appleAuth = read("src/lib/appleNativeAuth.ts");
const ui = read("src/components/ui.tsx");
const signIn = read("app/(auth)/sign-in.tsx");
const register = read("app/(auth)/register.tsx");
const appJson = read("app.json");
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

test("OAuthProviderButtons wires Apple press while Google stays coming-soon", () => {
  assert.match(ui, /onApplePress\?:/);
  assert.match(ui, /appleAvailable\?:/);
  assert.match(ui, /onApplePress/);
  assert.match(ui, /notifyUnavailable/);
  assert.match(ui, /googleLabel/);
});

test("Sign In uses login intent through AuthController.completeAppleNative", () => {
  assert.match(signIn, /requestNativeAppleCredential/);
  assert.match(signIn, /completeAppleNative/);
  assert.match(signIn, /intent:\s*"login"/);
  assert.match(signIn, /kind === "cancelled"/);
  assert.match(signIn, /kind === "two_factor_required"/);
  assert.match(signIn, /signInErrorMessage/);
});

test("Create Account uses register intent and requires legal acknowledgement", () => {
  assert.match(register, /requestNativeAppleCredential/);
  assert.match(register, /completeAppleNative/);
  assert.match(register, /intent:\s*"register"/);
  assert.match(register, /legalAcknowledgement:\s*accepted/);
  assert.match(register, /auth\.legalRequired/);
});

test("AuthController Apple completion uses cookie jar session path", () => {
  assert.match(authController, /completeAppleNative/);
  assert.match(authController, /endpoints\.appleNativeComplete\(\)/);
  assert.match(authController, /identity_token/);
  assert.match(authController, /finishOwnerFirstFactor/);
  assert.match(authController, /endpoints\.workspace\(\)/);
  assert.match(authController, /two_factor_required/);
});
