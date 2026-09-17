import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canConfirmSensitiveWithApple, canConfirmSensitiveWithGoogle } from "./accountDeleteReauth";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative: string) => readFileSync(`${root}/${relative}`, "utf8");

const securityActions = read("src/components/SecurityActions.tsx");
const securityScreen = read("app/(app)/security.tsx");
const endpoints = readFileSync(
  fileURLToPath(new URL("../../../../packages/api/src/endpoints.ts", import.meta.url)),
  "utf8",
);
const i18n = readFileSync(
  fileURLToPath(new URL("../../../../packages/i18n/src/management.ts", import.meta.url)),
  "utf8",
);

test("Apple-only owners can open Security actions after Confirm with Apple", () => {
  assert.equal(canConfirmSensitiveWithApple({ apple: { linked: true }, password: { enabled: false } }), true);
  assert.match(securityActions, /canConfirmSensitiveWithApple/);
  assert.match(securityActions, /Confirm with Apple/);
  assert.match(securityActions, /Identity confirmed with Apple/);
  assert.match(securityActions, /requestNativeAppleCredential/);
  assert.match(securityActions, /verifyAppleNative/);
  assert.match(securityActions, /oauthReauthReady/);
  assert.match(securityScreen, /appleLinked=\{Boolean\(methods\?\.apple\?\.linked\)\}/);
});

test("Google-only owners can open Security actions after Confirm with Google", () => {
  assert.equal(canConfirmSensitiveWithGoogle({ google: { linked: true }, password: { enabled: false } }), true);
  assert.equal(
    canConfirmSensitiveWithGoogle({ google: { linked: true }, password: { enabled: true } }),
    false,
  );
  assert.match(securityActions, /canConfirmSensitiveWithGoogle/);
  assert.match(securityActions, /Confirm with Google/);
  assert.match(securityActions, /Identity confirmed with Google/);
  assert.match(securityActions, /requestNativeGoogleCredential/);
  assert.match(securityActions, /verifyGoogleNative/);
  assert.doesNotMatch(securityActions, /Secure mobile Google re-verification is not available yet/);
  assert.match(securityScreen, /googleLinked=\{Boolean\(methods\?\.google\?\.linked\)\}/);
});

test("Apple-only 2FA setup/disable/regen omit current_password after provider reverify", () => {
  assert.match(securityActions, /ownerTwoFactorSetup/);
  assert.match(securityActions, /passwordEnabled \? \{ current_password: password \} : \{\}/);
  assert.match(securityActions, /if \(passwordEnabled\) payload\.current_password = password/);
  assert.match(securityActions, /ownerTwoFactorRegenerate/);
  assert.match(securityActions, /ownerTwoFactorDisable/);
});

test("Apple-only Set password uses set-password endpoint without current password", () => {
  assert.match(endpoints, /setPassword: \(\) => "\/auth\/set-password\/"/);
  assert.match(securityActions, /action === "setPassword"/);
  assert.match(securityActions, /endpoints\.setPassword\(\)/);
  assert.match(i18n, /"security\.setPassword": "Set password"/);
  assert.match(securityActions, /new_password: newPassword/);
  assert.match(securityActions, /new_password_confirm: confirmation/);
});

test("Password owner change-password and 2FA paths remain", () => {
  assert.match(securityActions, /security\.changePassword/);
  assert.match(securityActions, /endpoints\.changePassword\(\)/);
  assert.match(securityActions, /current_password: password/);
  assert.match(securityActions, /security\.currentPassword/);
});

test("cancelled Apple or Google verify leaves Security actions gated", () => {
  assert.match(securityActions, /apple\.kind === "cancelled"/);
  assert.match(securityActions, /google\.kind === "cancelled"/);
  assert.match(
    securityActions,
    /actionsUnlocked =\s*passwordEnabled \|\| \(\(appleVerify \|\| googleVerify\) && oauthReauthReady\)/,
  );
});

test("Apple path remains preferred when both Apple and Google are linked without password", () => {
  assert.match(securityActions, /canConfirmSensitiveWithGoogle\(methods\) && !appleVerify/);
});
