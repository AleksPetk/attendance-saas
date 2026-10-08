import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative: string) => readFileSync(`${root}/${relative}`, "utf8");

const appleBrowser = read("src/lib/appleBrowserAuth.ts");
const appleNative = read("src/lib/appleNativeAuth.ts");
const signIn = read("app/(auth)/sign-in.tsx");
const register = read("app/(auth)/register.tsx");
const googleAuth = read("src/lib/googleNativeAuth.ts");
const appJson = read("app.json");
const packageJson = read("package.json");
const sensitive = read("src/components/AccountSensitive.tsx");
const security = read("src/components/SecurityActions.tsx");

test("expo-web-browser is declared for Android Apple browser OAuth", () => {
  assert.match(packageJson, /"expo-web-browser"/);
  assert.match(appleBrowser, /expo-web-browser/);
  assert.match(appleBrowser, /openAuthSessionAsync/);
});

test("exact mobile Apple return URL is the backend allowlisted deep link", () => {
  assert.match(appleBrowser, /checkstation:\/\/auth\/apple-result/);
  assert.match(appleBrowser, /MOBILE_APPLE_RETURN_URL/);
  assert.match(appleBrowser, /mobile_return_url/);
  assert.match(appleBrowser, /Does not call \/auth\/apple\/native\//);
  assert.doesNotMatch(appleBrowser, /appleNativeComplete|identity_token/);
});

test("browser helper builds login/register start URLs with mobile return", () => {
  assert.match(appleBrowser, /intent/);
  assert.match(appleBrowser, /legal_acknowledgement/);
  assert.match(appleBrowser, /auth\/apple\/start\//);
});

test("browser helper parses handoff from deep link and maps cancel safely", () => {
  assert.match(appleBrowser, /parseAppleBrowserReturnUrl|queryParams/);
  assert.match(appleBrowser, /handoff/);
  assert.match(appleBrowser, /type === "cancel"/);
  assert.match(appleBrowser, /kind: "cancelled"/);
  assert.match(appleBrowser, /kind: "failed"/);
});

test("Android availability helper is platform-gated", () => {
  assert.match(appleBrowser, /Platform\.OS === "android"/);
  assert.match(appleBrowser, /isBrowserAppleAuthAvailable/);
});

test("sign-in and register choose browser Apple on Android and native on iOS", () => {
  assert.match(signIn, /Platform\.OS === "android"/);
  assert.match(signIn, /requestBrowserAppleCredential/);
  assert.match(signIn, /completeDesktopAuthHandoff/);
  assert.match(signIn, /requestNativeAppleCredential/);
  assert.match(signIn, /completeAppleNative/);

  assert.match(register, /Platform\.OS === "android"/);
  assert.match(register, /requestBrowserAppleCredential/);
  assert.match(register, /completeDesktopAuthHandoff/);
  assert.match(register, /requestNativeAppleCredential/);
  assert.match(register, /completeAppleNative/);
  assert.match(register, /legalAcknowledgement:\s*accepted/);
});

test("account link/verify screens still use native Apple only (not Android browser)", () => {
  assert.match(sensitive, /requestNativeAppleCredential/);
  assert.doesNotMatch(sensitive, /requestBrowserAppleCredential/);
  assert.match(security, /requestNativeAppleCredential/);
  assert.doesNotMatch(security, /requestBrowserAppleCredential/);
});

test("iOS native Apple helper remains iOS-gated and unchanged in architecture", () => {
  assert.match(appleNative, /Platform\.OS !== "ios"/);
  assert.match(appleNative, /AppleAuthentication\.signInAsync/);
  assert.match(appleNative, /auth\/apple\/native/);
  assert.match(appleNative, /hashAppleNonceForRequest/);
});

test("Android Google Sign-In remains enabled alongside Apple browser auth", () => {
  assert.match(googleAuth, /Platform\.OS === "android"/);
  assert.match(googleAuth, /hasPlayServices/);
  assert.match(signIn, /requestNativeGoogleCredential/);
  assert.match(register, /requestNativeGoogleCredential/);
});

test("Play Internal versionCode is 8", () => {
  assert.match(appJson, /"versionCode":\s*8/);
  assert.match(appJson, /"package":\s*"app\.checkstation\.mobile"/);
  assert.match(appJson, /"scheme":\s*"checkstation"/);
});
