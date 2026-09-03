import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const registerSource = readFileSync(new URL("./RegisterScreen.jsx", import.meta.url), "utf8");
const viewerSource = readFileSync(new URL("./RegistrationLegalViewer.jsx", import.meta.url), "utf8");
const componentsSource = readFileSync(new URL("./components.jsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const authEnglish = JSON.parse(readFileSync(new URL("./i18n/locales/en/auth.json", import.meta.url), "utf8"));
const authJapanese = JSON.parse(readFileSync(new URL("./i18n/locales/ja/auth.json", import.meta.url), "utf8"));

test("registration removes the permanent password requirements panel", () => {
  assert.doesNotMatch(registerSource, /password-requirements|Password requirements/);
  assert.match(registerSource, /error=\{fieldErrors\.password\}/);
});

test("registration requires and submits legal acknowledgement", () => {
  assert.match(registerSource, /legal_acknowledgement: legalAcknowledgement/);
  assert.match(registerSource, /disabled=\{loading \|\| !legalAcknowledgement\}/);
  assert.match(registerSource, /type="checkbox"[\s\S]*required/);
  assert.match(registerSource, /t\("register\.legalAgree"\)/);
  assert.match(registerSource, /t\("register\.termsOfUse"\)/);
  assert.match(registerSource, /t\("register\.privacyPolicy"\)/);
});

test("legal links fetch canonical slugs without replacing form state", () => {
  assert.match(registerSource, /terms: "terms-of-use"/);
  assert.match(registerSource, /privacy: "privacy-policy"/);
  assert.match(registerSource, /api\.getContentDocument\(legalSlug\)/);
  assert.match(registerSource, /const \[email, setEmail\] = useState/);
  assert.match(registerSource, /onClose=\{\(\) => setLegalSlug\(""\)\}/);
  assert.doesNotMatch(registerSource, /onClose=\{[^}]*setEmail/);
});

test("registration legal viewer reuses the safe Markdown renderer", () => {
  assert.match(viewerSource, /ContentMarkdown/);
  assert.match(viewerSource, /stripLeadingDocumentTitle/);
  assert.doesNotMatch(viewerSource, /dangerouslySetInnerHTML/);
  assert.match(viewerSource, /internalDocumentHref/);
});

test("registration exposes google and apple oauth alternatives", () => {
  assert.match(registerSource, /AuthProviderButtons/);
  assert.match(registerSource, /intent="register"/);
  assert.match(registerSource, /legalAcknowledged=\{legalAcknowledgement\}/);
  assert.match(registerSource, /<AuthProviderButtons[\s\S]*intent="register"/);
});

test("registration reuses the auth language switcher in the card header", () => {
  assert.match(registerSource, /import \{ WorkspaceLanguageMenu \} from "\.\/i18n\/LanguageSwitcher\.jsx"/);
  assert.match(registerSource, /headerAction=\{<WorkspaceLanguageMenu \/>\}/);
  assert.doesNotMatch(registerSource, /lead=\{t\("register\.lead"\)\}/);
  assert.doesNotMatch(registerSource, /<LanguageSwitcher|language-switcher-select|<select/);
  assert.match(componentsSource, /headerAction[\s\S]*auth-header-title-row[\s\S]*auth-header-action/);
});

test("language switching does not key or reset the registration form", () => {
  assert.doesNotMatch(registerSource, /key=\{[^}]*language|key=\{[^}]*locale/);
  assert.match(registerSource, /const \[email, setEmail\] = useState\(""\)/);
  assert.match(registerSource, /const \[password, setPassword\] = useState\(""\)/);
  assert.match(registerSource, /const \[passwordConfirm, setPasswordConfirm\] = useState\(""\)/);
  assert.match(registerSource, /const \[firstName, setFirstName\] = useState\(""\)/);
  assert.match(registerSource, /const \[lastName, setLastName\] = useState\(""\)/);
  assert.match(registerSource, /const \[legalAcknowledgement, setLegalAcknowledgement\] = useState\(false\)/);
});

test("registration language control wraps safely at narrow widths", () => {
  assert.match(stylesSource, /\.auth-header-title-row\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.match(stylesSource, /\.workspace-language-menu\s*\{[\s\S]*right:\s*0/);
  assert.match(stylesSource, /@media \(max-width: 560px\)[\s\S]*\.auth-header-title-row/);
});

test("registration promotional panel localizes its copy without changing English", () => {
  assert.equal(authEnglish.register.visual.eyebrow, "Attendance that fits your workspace");
  assert.equal(authEnglish.register.visual.headline, "One workspace. Your attendance, your way.");
  assert.deepEqual(Object.values(authEnglish.register.visual.benefits), [
    "Set up in minutes",
    "Customize every Group",
    "Run attendance from any device",
  ]);
  assert.deepEqual(Object.values(authEnglish.register.visual.flow), ["People", "Groups", "Kiosk", "History"]);

  assert.equal(authJapanese.register.visual.eyebrow, "現場に合わせて使える出欠管理");
  assert.equal(authJapanese.register.visual.headline, "ひとつのワークスペースで、現場に合った出欠管理を。");
  assert.deepEqual(Object.values(authJapanese.register.visual.benefits), [
    "すぐに導入できる",
    "グループごとに柔軟に設定",
    "PC・タブレット・スマホに対応",
  ]);
  assert.deepEqual(Object.values(authJapanese.register.visual.flow), ["メンバー", "グループ", "キオスク", "履歴"]);
  assert.match(registerSource, /register\.visual\.(eyebrow|headline|benefits|flow)/);
});

test("registration submits the current allowlisted UI locale", () => {
  assert.match(registerSource, /const \{ locale \} = useLanguage\(\)/);
  assert.match(registerSource, /api\.registerOwner\(\{[\s\S]*legal_acknowledgement:[\s\S]*locale,/);
});
