import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = dirname(fileURLToPath(import.meta.url));

function loadLocale(lang, namespace) {
  const path = join(ROOT, "locales", lang, `${namespace}.json`);
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("translation files", () => {
  it("provides different English and Japanese proof strings", () => {
    const en = loadLocale("en", "common");
    const ja = loadLocale("ja", "common");
    assert.equal(en.save, "Save");
    assert.equal(ja.save, "保存");
    assert.notEqual(en.save, ja.save);
  });

  it("keeps auth sign-in strings in both locales", () => {
    const en = loadLocale("en", "auth");
    const ja = loadLocale("ja", "auth");
    assert.equal(en.signIn, "Sign in");
    assert.equal(ja.signIn, "サインイン");
  });

  it("keeps workspace navigation strings in both locales", () => {
    const en = loadLocale("en", "workspace");
    const ja = loadLocale("ja", "workspace");
    assert.equal(en.nav.dashboard, "Dashboard");
    assert.equal(ja.nav.dashboard, "ダッシュボード");
    assert.equal(en.nav.members, "Members");
    assert.equal(ja.nav.members, "メンバー");
    assert.notEqual(en.nav.groups, ja.nav.groups);
  });

  it("keeps billing flow label in entitlements for both locales", () => {
    const en = loadLocale("en", "entitlements");
    const ja = loadLocale("ja", "entitlements");
    assert.equal(en.adsRequired, "Ads supported on Basic plan");
    assert.equal(ja.adsRequired, "Basic プランでは広告が表示されます");
    assert.notEqual(en.adsRequired, ja.adsRequired);
  });

  it("keeps error and empty state strings in both locales", () => {
    const enWorkspace = loadLocale("en", "workspace");
    const jaWorkspace = loadLocale("ja", "workspace");
    assert.equal(enWorkspace.notifications.empty, "No announcements yet.");
    assert.equal(jaWorkspace.notifications.empty, "お知らせはまだありません。");
    const enCommon = loadLocale("en", "common");
    const jaCommon = loadLocale("ja", "common");
    assert.equal(enCommon.errors.generic, "Something went wrong.");
    assert.equal(jaCommon.errors.generic, "問題が発生しました。");
  });

  it("keeps staff management strings in both locales", () => {
    const en = loadLocale("en", "staff");
    const ja = loadLocale("ja", "staff");
    assert.equal(en.management.title, "Staff management");
    assert.equal(ja.management.title, "スタッフ管理");
    assert.equal(en.create.submit, "Create account");
    assert.equal(ja.create.submit, "アカウントを作成");
    assert.notEqual(en.groupAccess.save, ja.groupAccess.save);
  });

  it("keeps kiosk live screen strings in both locales", () => {
    const en = loadLocale("en", "kiosk");
    const ja = loadLocale("ja", "kiosk");
    assert.equal(en.live.identify.title, "Check in");
    assert.equal(ja.live.identify.title, "チェックイン");
    assert.equal(en.settings.title, "Kiosk Settings");
    assert.equal(ja.settings.title, "キオスク設定");
  });

  it("keeps history screen strings in both locales", () => {
    const en = loadLocale("en", "history");
    const ja = loadLocale("ja", "history");
    assert.equal(en.views.activity, "Activity Log");
    assert.equal(ja.views.activity, "アクティビティログ");
    assert.equal(en.report.export.label, "Export");
    assert.equal(ja.report.export.label, "エクスポート");
  });

  it("keeps localized Group participant summaries available", () => {
    const en = loadLocale("en", "groups");
    const ja = loadLocale("ja", "groups");
    assert.equal(
      en.participants.summary,
      "{{total}} participant · {{members}} Members · {{groupOnly}} Group-only",
    );
    assert.equal(
      ja.participants.summary,
      "参加者 {{total}} 名 · メンバー {{members}} 名 · グループ限定 {{groupOnly}} 名",
    );
    assert.notEqual(en.participants.summary, ja.participants.summary);
    assert.equal(en.participants.count, "{{count}} participant");
    assert.equal(ja.participants.count, "参加者 {{count}} 名");
  });

  it("keeps account security strings in both locales", () => {
    const en = loadLocale("en", "account");
    const ja = loadLocale("ja", "account");
    assert.equal(en.sections.email.title, "Email");
    assert.equal(ja.sections.email.title, "メール");
    assert.equal(en.twoFactor.setup, "Set up two-factor authentication");
    assert.equal(ja.twoFactor.setup, "二段階認証を設定");
  });

  it("keeps billing subscription strings in both locales", () => {
    const en = loadLocale("en", "billing");
    const ja = loadLocale("ja", "billing");
    assert.equal(en.currentPlan.title, "Current plan");
    assert.equal(ja.currentPlan.title, "現在のプラン");
    assert.equal(en.interval.monthly, "Monthly");
    assert.equal(ja.interval.monthly, "月払い");
  });

  it("keeps header language menu accessibility strings in both locales", () => {
    const en = loadLocale("en", "common");
    const ja = loadLocale("ja", "common");
    assert.equal(en.languageMenu.aria, "Change language");
    assert.equal(ja.languageMenu.aria, "言語を変更");
  });
});
