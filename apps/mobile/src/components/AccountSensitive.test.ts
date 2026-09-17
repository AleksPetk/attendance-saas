import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canConfirmDeleteWithApple } from "./accountDeleteReauth";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative: string) => readFileSync(`${root}/${relative}`, "utf8");

const sensitive = read("src/components/AccountSensitive.tsx");
const appleAuth = read("src/lib/appleNativeAuth.ts");
const authController = readFileSync(
  fileURLToPath(new URL("../../../../packages/auth/src/controller.ts", import.meta.url)),
  "utf8",
);

test("canConfirmDeleteWithApple is true only for Apple-linked passwordless owners", () => {
  assert.equal(canConfirmDeleteWithApple({ apple: { linked: true }, password: { enabled: false } }), true);
  assert.equal(canConfirmDeleteWithApple({ apple: { linked: true }, password: { enabled: true } }), false);
  assert.equal(canConfirmDeleteWithApple({ google: { linked: true }, password: { enabled: false } }), false);
  assert.equal(canConfirmDeleteWithApple({ apple: { linked: false } }), false);
});

test("Delete Account shows Confirm with Apple for Apple-only owners", () => {
  assert.match(sensitive, /canConfirmDeleteWithApple/);
  assert.match(sensitive, /confirmWithApple/);
  assert.match(sensitive, /Confirm with Apple/);
  assert.match(sensitive, /Identity confirmed with Apple/);
  assert.match(sensitive, /requestNativeAppleCredential/);
  assert.match(sensitive, /verifyAppleNative/);
  assert.match(sensitive, /oauthReauthReady/);
  assert.match(sensitive, /\/auth\/account\/delete\//);
  assert.doesNotMatch(sensitive, /Secure mobile Google\/Apple re-verification is not available yet/);
});

test("Google-only oauth deletion still shows Google unavailable guidance", () => {
  assert.match(sensitive, /oauthSensitiveGoogle/);
  assert.match(sensitive, /Secure mobile Google re-verification is not available yet/);
});

test("password deletion path remains available", () => {
  assert.match(sensitive, /hasPassword/);
  assert.match(sensitive, /current_password: password/);
  assert.match(sensitive, /security\.currentPassword/);
});

test("AuthController verifyAppleNative uses native endpoint with intent verify and no login finish", () => {
  assert.match(authController, /async verifyAppleNative/);
  assert.match(authController, /intent:\s*"verify"/);
  assert.match(authController, /endpoints\.appleNativeComplete\(\)/);
  const verifyBlock = authController.slice(authController.indexOf("verifyAppleNative"));
  assert.doesNotMatch(verifyBlock.slice(0, 500), /finishOwnerFirstFactor/);
});

test("native Apple helper allows verify intent typing", () => {
  assert.match(appleAuth, /"login" \| "register" \| "verify"/);
});
