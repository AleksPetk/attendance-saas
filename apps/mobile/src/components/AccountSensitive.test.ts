import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  canConfirmDeleteWithApple,
  canConfirmDeleteWithGoogle,
  canConfirmSensitiveWithApple,
  canConfirmSensitiveWithGoogle,
  remainingProviderForUnlink,
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

test("remainingProviderForUnlink requires the other provider when passwordless", () => {
  assert.equal(
    remainingProviderForUnlink({ google: { linked: true }, apple: { linked: true }, password: { enabled: false } }, "google"),
    "apple",
  );
  assert.equal(
    remainingProviderForUnlink({ google: { linked: true }, apple: { linked: true }, password: { enabled: false } }, "apple"),
    "google",
  );
  assert.equal(
    remainingProviderForUnlink({ google: { linked: true }, apple: { linked: true }, password: { enabled: true } }, "google"),
    null,
  );
  assert.equal(
    remainingProviderForUnlink({ google: { linked: true }, password: { enabled: false } }, "google"),
    null,
  );
});

test("Connect is enabled for unlinked providers and uses native link", () => {
  assert.match(sensitive, /connectProvider/);
  assert.match(sensitive, /linkGoogleNative/);
  assert.match(sensitive, /linkAppleNative/);
  assert.match(sensitive, /kind: "unlink"/);
  assert.doesNotMatch(sensitive, /disabled=\{!linked \|\| !canUnlink\}/);
  assert.doesNotMatch(sensitive, /not available yet/);
  assert.doesNotMatch(sensitive, /oauthGap/);
});

test("Disconnect gates on can_unlink and supports OAuth-only remaining-provider reverify", () => {
  assert.match(sensitive, /remainingProviderForUnlink/);
  assert.match(sensitive, /appleUnlinkVerify/);
  assert.match(sensitive, /googleUnlinkVerify/);
  assert.match(sensitive, /unlinkAppleHint/);
  assert.match(sensitive, /unlinkGoogleHint/);
  assert.match(sensitive, /\/auth\/\$\{unlinkProvider\}\/unlink\//);
  assert.match(sensitive, /last_sign_in_method/);
  assert.match(sensitive, /disabled=\{!canUnlink/);
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
});

test("Delete Account shows Confirm with Google for Google-only owners", () => {
  assert.match(sensitive, /canConfirmDeleteWithGoogle/);
  assert.match(sensitive, /confirmWithGoogle/);
  assert.match(sensitive, /Confirm with Google/);
  assert.match(sensitive, /Identity confirmed with Google/);
  assert.match(sensitive, /requestNativeGoogleCredential/);
  assert.match(sensitive, /verifyGoogleNative/);
});

test("password deletion and password unlink paths remain available", () => {
  assert.match(sensitive, /hasPassword/);
  assert.match(sensitive, /current_password: password/);
  assert.match(sensitive, /security\.currentPassword/);
});

test("AuthController verify and link natives use endpoints without login finish", () => {
  assert.match(authController, /async verifyAppleNative/);
  assert.match(authController, /async verifyGoogleNative/);
  assert.match(authController, /async linkAppleNative/);
  assert.match(authController, /async linkGoogleNative/);
  assert.match(authController, /intent:\s*"verify"/);
  assert.match(authController, /intent:\s*"link"/);
  assert.match(authController, /endpoints\.appleNativeComplete\(\)/);
  assert.match(authController, /endpoints\.googleNativeComplete\(\)/);
  const googleLink = authController.slice(authController.indexOf("linkGoogleNative"));
  assert.doesNotMatch(googleLink.slice(0, 500), /finishOwnerFirstFactor/);
  const appleLink = authController.slice(authController.indexOf("linkAppleNative"));
  assert.doesNotMatch(appleLink.slice(0, 500), /finishOwnerFirstFactor/);
});

test("native helpers allow verify and link intent typing", () => {
  assert.match(appleAuth, /"login" \| "register" \| "verify" \| "link"/);
  assert.match(googleAuth, /"login" \| "register" \| "verify" \| "link"/);
});
