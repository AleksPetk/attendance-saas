import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const buttons = readFileSync(join(here, "../components/DesktopAuthProviderButtons.tsx"), "utf8");
const signIn = readFileSync(join(here, "SignInPage.tsx"), "utf8");
const register = readFileSync(join(here, "AuthAccountFlowPage.tsx"), "utf8");
const preload = readFileSync(join(here, "../../electron/preload.cjs"), "utf8");
const main = readFileSync(join(here, "../../electron/main.cjs"), "utf8");
const googleOAuth = readFileSync(join(here, "../../electron/googleOAuth.cjs"), "utf8");
const appProvider = readFileSync(join(here, "../lib/AppProvider.tsx"), "utf8");

test("desktop Google uses system-browser PKCE bridge then completeGoogleNative", () => {
  assert.match(buttons, /requestGoogleIdentityToken/);
  assert.match(buttons, /completeGoogleNative/);
  assert.match(buttons, /intent/);
  assert.match(buttons, /legalAcknowledgement/);
  assert.doesNotMatch(buttons, /oauthPublicStartUrl|\/api\/auth\/.*\/start/);
  assert.doesNotMatch(buttons, /console\.(log|debug|info).*identityToken|identity_token/);
});

test("desktop Google button is enabled; Apple gated by DIRECT web_compatible mode", () => {
  assert.match(buttons, /btn-oauth-google/);
  assert.match(buttons, /onClick=\{\(\) => void onGoogleClick\(\)\}/);
  assert.match(buttons, /appleEnabled/);
  assert.match(buttons, /web_compatible/);
  assert.match(buttons, /disabled=\{busy \|\| !appleEnabled\}/);
  assert.doesNotMatch(buttons, /auth\.oauthComingBody/);
});

test("sign-in and register wire Google intent without changing email/password", () => {
  assert.match(signIn, /intent="login"/);
  assert.match(signIn, /loginOwner\(email/);
  assert.match(register, /intent="register"/);
  assert.match(register, /legalAcknowledgement=\{accepted\}/);
  assert.match(register, /endpoints\.register\(\)/);
});

test("electron main/preload expose Google OAuth without logging tokens", () => {
  assert.match(preload, /requestGoogleIdentityToken/);
  assert.match(preload, /isGoogleOAuthConfigured/);
  assert.match(preload, /getDesktopDistribution/);
  assert.match(main, /checkstation:googleOAuthSignIn/);
  assert.match(main, /requestGoogleIdentityToken/);
  assert.match(main, /GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET/);
  assert.match(main, /process\.resourcesPath/);
  assert.match(main, /bringToForeground:\s*bringCheckStationToForeground/);
  assert.match(main, /app\.focus\(\{\s*steal:\s*true\s*\}\)/);
  assert.match(main, /setTimeout\(focusOnce,\s*80\)/);
  assert.match(main, /setTimeout\(focusOnce,\s*320\)/);
  assert.match(main, /checkstation:desktopDistribution/);
  assert.match(googleOAuth, /code_challenge/);
  assert.match(googleOAuth, /127\.0\.0\.1/);
  assert.match(googleOAuth, /shell\.openExternal|openExternal/);
  assert.match(googleOAuth, /GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET/);
  assert.match(googleOAuth, /client_secret/);
  assert.match(googleOAuth, /bringToForeground/);
  assert.match(googleOAuth, /Returning to CheckStation/);
  assert.match(googleOAuth, /window\.close\(\)/);
  assert.doesNotMatch(googleOAuth, /console\.(log|debug|info)/);
  assert.match(appProvider, /requestGoogleIdentityToken\?:/);
  assert.match(appProvider, /getDesktopDistribution\?:/);
});

test("desktop Google cancels and provider errors map to UI outcomes", () => {
  assert.match(buttons, /google\.kind === "cancelled"/);
  assert.match(buttons, /google\.kind === "misconfigured"/);
  assert.match(buttons, /google\.kind === "missing_token"/);
  assert.match(buttons, /google\.kind === "error"/);
  assert.match(buttons, /auth\.googleFailed/);
});
