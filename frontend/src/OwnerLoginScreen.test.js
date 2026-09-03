import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const loginSource = readFileSync(new URL("./OwnerLoginScreen.jsx", import.meta.url), "utf8");
const providerButtonsSource = readFileSync(new URL("./AuthProviderButtons.jsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./index.css", import.meta.url), "utf8");

test("owner login screen does not use fetch for oauth", () => {
  assert.doesNotMatch(loginSource, /fetch\([^)]*google\/start/);
  assert.match(loginSource, /AuthProviderButtons/);
});

test("owner login reuses the registration globe menu in the card header", () => {
  assert.match(loginSource, /import \{ WorkspaceLanguageMenu \} from "\.\/i18n\/LanguageSwitcher\.jsx"/);
  assert.match(loginSource, /headerAction=\{<WorkspaceLanguageMenu \/>\}/);
  assert.match(loginSource, /lead=\{needsTwoFactor \? t\("ownerLogin\.lead2fa"\) : undefined\}/);
  assert.doesNotMatch(loginSource, /t\("ownerLogin\.lead"\)/);
  assert.doesNotMatch(loginSource, /<LanguageSwitcher|owner-login-language|auth-language-row|<select/);
});

test("owner login language changes do not key or reset credentials", () => {
  assert.doesNotMatch(loginSource, /key=\{[^}]*language|key=\{[^}]*locale/);
  assert.match(loginSource, /const \[email, setEmail\] = useState\(""\)/);
  assert.match(loginSource, /const \[password, setPassword\] = useState\(""\)/);
});

test("owner login opts into official provider image assets without changing oauth flow", () => {
  assert.match(loginSource, /<AuthProviderButtons intent="login" \/>/);
  assert.match(providerButtonsSource, /assets\/auth\/google-g\.png/);
  assert.match(providerButtonsSource, /assets\/auth\/apple-sign-in\.png/);
  assert.match(providerButtonsSource, /auth-provider-icon-frame-google/);
  assert.match(providerButtonsSource, /auth-provider-icon-frame-apple/);
  assert.match(providerButtonsSource, /oauthPublicStartUrl/);
  assert.match(stylesSource, /\.btn-oauth\s*\{[\s\S]*min-height:\s*2\.75rem/);
  assert.match(stylesSource, /\.btn-oauth\.has-provider-icon\s*\{[\s\S]*align-items:\s*center/);
  assert.match(stylesSource, /\.auth-provider-icon-google\s*\{[\s\S]*width:\s*21px;[\s\S]*height:\s*22px/);
  assert.match(stylesSource, /\.auth-provider-icon-frame-apple\s*\{[\s\S]*position:\s*relative;[\s\S]*width:\s*26px;[\s\S]*height:\s*26px;[\s\S]*overflow:\s*hidden/);
  assert.match(stylesSource, /\.auth-provider-icon-apple\s*\{[\s\S]*position:\s*absolute;[\s\S]*top:\s*50%;[\s\S]*left:\s*50%;[\s\S]*width:\s*50px;[\s\S]*height:\s*50px;[\s\S]*transform:\s*translate\(-50%, -50%\)/);
});
