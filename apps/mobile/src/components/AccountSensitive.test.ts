import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  canConfirmDeleteWithApple,
  canConfirmDeleteWithGoogle,
  canConfirmSensitiveWithApple,
  canConfirmSensitiveWithGoogle,
} from "./accountDeleteReauth";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative: string) => readFileSync(`${root}/${relative}`, "utf8");

const sensitive = read("src/components/AccountSensitive.tsx");
const appleAuth = read("src/lib/appleNativeAuth.ts");
const googleAuth = read("src/lib/googleNativeAuth.ts");
const authController = readFileSync(
  fileURLToPath(new URL("../../../../packages/auth/src/controller.ts", import.meta.url)),
  "utf8",
);

test("canConfirmSensitiveWithApple aliases delete helper for Apple-only owners", () => {
  assert.equal(canConfirmSensitiveWithApple({ apple: { linked: true }, password: { enabled: false } }), true);
  assert.equal(canConfirmDeleteWithApple({ apple: { linked: true }, password: { enabled: false } }), true);
  assert.equal(canConfirmDeleteWithApple({ apple: { linked: true }, password: { enabled: true } }), false);
  assert.equal(canConfirmDeleteWithApple({ google: { linked: true }, password: { enabled: false } }), false);
});

test("canConfirmSensitiveWithGoogle aliases delete helper for Google-only owners", () => {
  assert.equal(canConfirmSensitiveWithGoogle({ google: { linked: true }, password: { enabled: false } }), true);
  assert.equal(canConfirmDeleteWithGoogle({ google: { linked: true }, password: { enabled: false } }), true);
  assert.equal(canConfirmDeleteWithGoogle({ google: { linked: true }, password: { enabled: true } }), false);
  assert.equal(canConfirmDeleteWithGoogle({ apple: { linked: true }, password: { enabled: false } }), false);
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

test("Delete Account shows Confirm with Google for Google-only owners", () => {
  assert.match(sensitive, /canConfirmDeleteWithGoogle/);
  assert.match(sensitive, /confirmWithGoogle/);
  assert.match(sensitive, /Confirm with Google/);
  assert.match(sensitive, /Identity confirmed with Google/);
  assert.match(sensitive, /requestNativeGoogleCredential/);
  assert.match(sensitive, /verifyGoogleNative/);
  assert.doesNotMatch(sensitive, /Secure mobile Google re-verification is not available yet/);
  assert.doesNotMatch(sensitive, /oauthSensitiveGoogle/);
});

test("password deletion path remains available", () => {
  assert.match(sensitive, /hasPassword/);
  assert.match(sensitive, /current_password: password/);
  assert.match(sensitive, /security\.currentPassword/);
});

test("AuthController verifyAppleNative and verifyGoogleNative use native endpoints without login finish", () => {
  assert.match(authController, /async verifyAppleNative/);
  assert.match(authController, /async verifyGoogleNative/);
  assert.match(authController, /intent:\s*"verify"/);
  assert.match(authController, /endpoints\.appleNativeComplete\(\)/);
  assert.match(authController, /endpoints\.googleNativeComplete\(\)/);
  const appleVerify = authController.slice(authController.indexOf("verifyAppleNative"));
  assert.doesNotMatch(appleVerify.slice(0, 500), /finishOwnerFirstFactor/);
  const googleVerify = authController.slice(authController.indexOf("verifyGoogleNative"));
  assert.doesNotMatch(googleVerify.slice(0, 500), /finishOwnerFirstFactor/);
});

test("native helpers allow verify intent typing", () => {
  assert.match(appleAuth, /"login" \| "register" \| "verify"/);
  assert.match(googleAuth, /"login" \| "register" \| "verify"/);
});
