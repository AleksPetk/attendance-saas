import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import i18n from "./index.js";
import { LOCALE_LABELS, normalizeLocale } from "./language.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = dirname(ROOT);

function readSrc(relativePath) {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

describe("workspace header language menu placement", () => {
  it("lives in WorkspaceLayout before the notification bell", () => {
    const source = readSrc("WorkspaceLayout.jsx");
    const actionsIndex = source.indexOf('className="workspace-topbar-actions"');
    const languageIndex = source.indexOf("<WorkspaceLanguageMenu");
    const bellIndex = source.indexOf("<WorkspaceAnnouncementBell");
    assert.ok(actionsIndex >= 0);
    assert.ok(languageIndex > actionsIndex);
    assert.ok(bellIndex > languageIndex);
  });

  it("is removed from Account security settings", () => {
    const source = readSrc("AccountScreen.jsx");
    assert.doesNotMatch(source, /LanguageSwitcher/);
    assert.doesNotMatch(source, /id="language"/);
    assert.doesNotMatch(source, /account-language/);
  });
});

describe("workspace language menu component contract", () => {
  it("reuses shared language selection with immediate persistence", () => {
    const source = readSrc("i18n/LanguageSwitcher.jsx");
    assert.match(source, /export function useLanguageSelection/);
    assert.match(source, /export function WorkspaceLanguageMenu/);
    assert.match(source, /selectLanguage\(code\)/);
    assert.match(source, /explicit: true, persistBackend/);
    assert.match(source, /setOpen\(false\)/);
  });

  it("supports outside click and Escape to close", () => {
    const source = readSrc("i18n/LanguageSwitcher.jsx");
    assert.match(source, /pointerdown/);
    assert.match(source, /event\.key === "Escape"/);
  });

  it("exposes accessible menu semantics", () => {
    const source = readSrc("i18n/LanguageSwitcher.jsx");
    assert.match(source, /aria-expanded=\{open\}/);
    assert.match(source, /aria-haspopup="menu"/);
    assert.match(source, /role="menu"/);
    assert.match(source, /role="menuitemradio"/);
    assert.match(source, /languageMenu\.aria/);
  });

  it("shows English and 日本語 option labels", () => {
    assert.equal(LOCALE_LABELS.en, "English");
    assert.equal(LOCALE_LABELS.ja, "日本語");
  });
});

describe("language selection persistence", () => {
  it("keeps owner-only backend persistence in LanguageProvider", () => {
    const providerSource = readSrc("i18n/LanguageProvider.jsx");
    assert.match(providerSource, /session\?\.workspace\?\.account_kind === "owner"/);
    assert.match(providerSource, /updatePreferredLanguage\(normalized\)/);
    assert.match(providerSource, /saveLocalePreference\(normalized, \{ explicit \}\)/);
  });

  it("switches i18n locale between EN and JA", async () => {
    await i18n.changeLanguage("en");
    assert.equal(normalizeLocale(i18n.language), "en");

    await i18n.changeLanguage("ja");
    assert.equal(normalizeLocale(i18n.language), "ja");

    await i18n.changeLanguage("en");
    assert.equal(normalizeLocale(i18n.language), "en");
  });
});

describe("header language menu accessibility copy", () => {
  it("localizes menu aria labels in EN and JA", () => {
    const en = JSON.parse(readFileSync(join(ROOT, "locales/en/common.json"), "utf8"));
    const ja = JSON.parse(readFileSync(join(ROOT, "locales/ja/common.json"), "utf8"));
    assert.equal(en.languageMenu.aria, "Change language");
    assert.equal(ja.languageMenu.aria, "言語を変更");
    assert.equal(en.languageMenu.activeLabel, "Current language");
    assert.equal(ja.languageMenu.activeLabel, "現在の言語");
  });
});
