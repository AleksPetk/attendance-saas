import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const authLayout = readFileSync(join(here, "../components/AuthLayout.tsx"), "utf8");
const signIn = readFileSync(join(here, "SignInPage.tsx"), "utf8");
const styles = readFileSync(join(here, "../styles.css"), "utf8");
const shell = readFileSync(join(here, "../shell/DesktopShell.tsx"), "utf8");

test("desktop auth layout puts globe language menu on the card, not left EN/JA pills", () => {
  assert.match(authLayout, /DesktopLanguageMenu/);
  assert.match(authLayout, /auth-header-title-row/);
  assert.match(authLayout, /auth-header-action/);
  assert.doesNotMatch(authLayout, /language-pills/);
  assert.doesNotMatch(authLayout, />EN</);
  assert.doesNotMatch(authLayout, />JA</);
});

test("desktop sign-in OAuth buttons enable Google via shared native completion; Apple uses DIRECT web OAuth", () => {
  assert.match(signIn, /DesktopAuthProviderButtons/);
  const buttons = readFileSync(join(here, "../components/DesktopAuthProviderButtons.tsx"), "utf8");
  assert.match(buttons, /auth-provider-buttons/);
  assert.match(buttons, /btn-oauth-google/);
  assert.match(buttons, /btn-oauth-apple/);
  assert.match(buttons, /auth\.continueGoogle/);
  assert.match(buttons, /auth\.continueApple/);
  assert.match(buttons, /google-g\.png/);
  assert.match(buttons, /apple-sign-in\.png/);
  assert.equal(existsSync(join(root, "src/assets/auth/google-g.png")), true);
  assert.equal(existsSync(join(root, "src/assets/auth/apple-sign-in.png")), true);
  assert.match(buttons, /completeGoogleNative/);
  assert.match(buttons, /completeDesktopAuthHandoff/);
  assert.match(buttons, /requestAppleWebOAuth/);
  assert.doesNotMatch(buttons, /oauthPublicStartUrl/);
  assert.doesNotMatch(signIn, /oauth-grid/);
});

test("desktop auth styles include stacked oauth buttons and auth header action", () => {
  assert.match(styles, /\.auth-provider-buttons/);
  assert.match(styles, /\.btn-oauth/);
  assert.match(styles, /\.auth-header-title-row/);
  assert.doesNotMatch(styles, /\.oauth-grid/);
  assert.doesNotMatch(styles, /\.language-pills/);
});

test("desktop shell still uses shared DesktopLanguageMenu", () => {
  assert.match(shell, /from "\.\.\/components\/DesktopLanguageMenu"/);
  assert.match(shell, /<DesktopLanguageMenu label=\{t\("common\.changeLanguage"\)\} locale=\{locale\} onSelect=\{setLocale\}/);
});
