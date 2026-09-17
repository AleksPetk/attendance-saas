/**
 * Run: node --test src/accountSecurityProviderReauth.test.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const accountScreen = readFileSync(join(root, "AccountScreen.jsx"), "utf8");
const signInPanel = readFileSync(join(root, "AccountSignInMethodsPanel.jsx"), "utf8");

test("2FA setup uses provider Confirm controls for provider-only owners", () => {
  assert.match(accountScreen, /ProviderReauthControls/);
  assert.match(accountScreen, /ownerNeedsProviderReauth/);
  assert.match(accountScreen, /startProviderVerify\(provider, "2fa-setup"\)/);
  assert.match(accountScreen, /owner2faStartSetup\(payload\)/);
  assert.match(accountScreen, /passwordEnabled\s*\?\s*\{\s*current_password: setupPassword\s*\}\s*:\s*\{\}/);
});

test("2FA disable and recovery regenerate accept provider reauth", () => {
  assert.match(accountScreen, /startProviderVerify\(provider, "2fa-disable"\)/);
  assert.match(accountScreen, /startProviderVerify\(provider, "2fa-regen"\)/);
  assert.match(accountScreen, /needsProviderReauth && !oauthReauthReady/);
});

test("set password still requires provider reauth even when 2FA is enabled", () => {
  assert.match(signInPanel, /needsOAuthReauthForSetPassword/);
  assert.doesNotMatch(
    signInPanel,
    /!passwordEnabled && !twoFactorEnabled && \(methods\?\.google/,
  );
  assert.match(signInPanel, /rememberOAuthSecurityReturn/);
});

test("password owners keep current-password 2FA path", () => {
  assert.match(accountScreen, /passwordEnabled \? \([\s\S]*account:password\.current/);
  assert.match(accountScreen, /current_password: setupPassword/);
});
