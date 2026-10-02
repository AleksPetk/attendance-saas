import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

test("desktop Apple DIRECT uses system-browser web OAuth + desktop handoff", () => {
  const buttons = readFileSync(join(here, "../components/DesktopAuthProviderButtons.tsx"), "utf8");
  const appleMain = readFileSync(join(root, "electron/appleOAuth.cjs"), "utf8");
  const preload = readFileSync(join(root, "electron/preload.cjs"), "utf8");
  const main = readFileSync(join(root, "electron/main.cjs"), "utf8");

  assert.match(buttons, /requestAppleWebOAuth/);
  assert.match(buttons, /completeDesktopAuthHandoff/);
  assert.match(buttons, /web_compatible/);
  assert.match(buttons, /btn-oauth-apple/);
  assert.equal(existsSync(join(root, "src/assets/auth/apple-sign-in.png")), true);

  assert.match(appleMain, /auth\/apple\/start/);
  assert.match(appleMain, /desktop_return_url/);
  assert.match(appleMain, /apple-oauth-result/);
  assert.match(preload, /requestAppleWebOAuth/);
  assert.match(main, /checkstation:appleOAuthSignIn/);
  assert.match(main, /distribution !== "direct"/);
});

test("MAS Apple uses native ASAuthorization → completeAppleNative", () => {
  const buttons = readFileSync(join(here, "../components/DesktopAuthProviderButtons.tsx"), "utf8");
  const preload = readFileSync(join(root, "electron/preload.cjs"), "utf8");
  const main = readFileSync(join(root, "electron/main.cjs"), "utf8");
  const native = readFileSync(join(root, "electron/appleNativeAuth.cjs"), "utf8");
  const bridge = readFileSync(join(root, "native/MacBridge/Sources/main.swift"), "utf8");

  assert.match(buttons, /requestAppleNativeSignIn/);
  assert.match(buttons, /completeAppleNative/);
  assert.match(buttons, /appleMode === "native"/);
  assert.match(buttons, /appleEnabled \? \(\) => void onAppleClick\(\) : undefined/);
  assert.match(buttons, /disabled=\{busy \|\| !appleEnabled\}/);
  assert.match(preload, /requestAppleNativeSignIn/);
  assert.match(main, /checkstation:appleNativeSignIn/);
  assert.match(main, /appleAuthMode !== "native"/);
  assert.match(native, /hashedNonce/);
  assert.match(native, /appleSignIn/);
  assert.match(bridge, /ASAuthorizationAppleIDProvider/);
  assert.match(bridge, /request\.nonce = hashedNonce/);
});

test("Apple and Stripe IPC reuse bringCheckStationToForeground like Google", () => {
  const main = readFileSync(join(root, "electron/main.cjs"), "utf8");
  const apple = readFileSync(join(root, "electron/appleOAuth.cjs"), "utf8");
  const stripe = readFileSync(join(root, "electron/stripeBrowser.cjs"), "utf8");
  assert.match(main, /checkstation:appleOAuthSignIn[\s\S]*bringToForeground:\s*bringCheckStationToForeground/);
  assert.match(main, /checkstation:openBillingReturn[\s\S]*bringToForeground:\s*bringCheckStationToForeground/);
  assert.match(main, /checkstation:appleNativeSignIn[\s\S]*bringToForeground:\s*bringCheckStationToForeground/);
  assert.match(apple, /bringToForeground/);
  assert.match(apple, /resultCode === "success"/);
  assert.doesNotMatch(apple, /timeout[\s\S]{0,80}bringToForeground/);
  assert.match(stripe, /bringToForeground/);
  assert.doesNotMatch(stripe, /kind: "timeout"[\s\S]{0,120}bringToForeground/);
});
