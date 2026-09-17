import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canConfirmSensitiveWithApple, canConfirmSensitiveWithGoogle } from "./accountDeleteReauth";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative: string) => readFileSync(`${root}/${relative}`, "utf8");

const emailActions = read("src/components/AccountEmailActions.tsx");
const accountScreen = read("app/(app)/account.tsx");

test("canConfirmSensitiveWithApple gates Apple-only sensitive Account actions", () => {
  assert.equal(canConfirmSensitiveWithApple({ apple: { linked: true }, password: { enabled: false } }), true);
  assert.equal(canConfirmSensitiveWithApple({ apple: { linked: true }, password: { enabled: true } }), false);
  assert.equal(canConfirmSensitiveWithApple({ google: { linked: true }, password: { enabled: false } }), false);
});

test("login and backup email show Confirm with Apple for Apple-linked passwordless owners", () => {
  assert.match(emailActions, /canConfirmSensitiveWithApple/);
  assert.match(emailActions, /Confirm with Apple/);
  assert.match(emailActions, /Identity confirmed with Apple/);
  assert.match(emailActions, /requestNativeAppleCredential/);
  assert.match(emailActions, /verifyAppleNative/);
  assert.match(emailActions, /oauthReauthReady/);
  assert.match(accountScreen, /appleLinked=\{!!account\?\.sign_in_methods\?\.apple\?\.linked\}/);
  assert.match(accountScreen, /kind="primary"/);
  assert.match(accountScreen, /kind="backup"/);
  assert.doesNotMatch(emailActions, /Native Google\/Apple verification is not available yet/);
});

test("Google-only email actions use Confirm with Google", () => {
  assert.equal(canConfirmSensitiveWithGoogle({ google: { linked: true }, password: { enabled: false } }), true);
  assert.match(emailActions, /canConfirmSensitiveWithGoogle/);
  assert.match(emailActions, /Confirm with Google/);
  assert.match(emailActions, /Identity confirmed with Google/);
  assert.match(emailActions, /requestNativeGoogleCredential/);
  assert.match(emailActions, /verifyGoogleNative/);
  assert.doesNotMatch(emailActions, /Secure mobile Google re-verification is not available yet/);
  assert.match(accountScreen, /googleLinked=\{!!account\?\.sign_in_methods\?\.google\?\.linked\}/);
});

test("password email path remains available without Apple verify", () => {
  assert.match(emailActions, /passwordEnabled/);
  assert.match(emailActions, /current_password: password/);
  assert.match(emailActions, /security\.currentPassword/);
});
