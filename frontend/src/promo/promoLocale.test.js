import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_PROMO_LOCALE,
  PROMO_LOCALE_STORAGE_KEY,
  normalizePromoLocale,
  promoLogicalPath,
  promoPathFor,
  readPromoLocalePreference,
  resolvePromoLocaleFromPath,
  savePromoLocalePreference,
  shouldUsePromoImagePlaceholder,
  SUPPORTED_PROMO_LOCALES,
} from "./locale.js";
import { buildPublicFooterColumns } from "./footerColumns.js";
import { countPromoStrings, promoTranslate } from "./t.js";

describe("promo locale helpers", () => {
  it("exposes the promo storage key and supported locales", () => {
    assert.equal(PROMO_LOCALE_STORAGE_KEY, "checkstation.promo.locale");
    assert.deepEqual(SUPPORTED_PROMO_LOCALES, ["en", "ja"]);
    assert.equal(DEFAULT_PROMO_LOCALE, "en");
    assert.notEqual(PROMO_LOCALE_STORAGE_KEY, "checkstation.locale");
    assert.notEqual(PROMO_LOCALE_STORAGE_KEY, "checkstation.docs.locale");
    assert.notEqual(PROMO_LOCALE_STORAGE_KEY, "checkstation.status.locale");
  });

  it("normalizes locale tags", () => {
    assert.equal(normalizePromoLocale("en"), "en");
    assert.equal(normalizePromoLocale("ja-JP"), "ja");
    assert.equal(normalizePromoLocale("fr"), "en");
  });

  it("resolves and strips locale prefixes from paths", () => {
    assert.equal(resolvePromoLocaleFromPath("/ja/features"), "ja");
    assert.equal(resolvePromoLocaleFromPath("/en/"), "en");
    assert.equal(resolvePromoLocaleFromPath("/features"), null);
    assert.equal(promoLogicalPath("/ja/how-it-works"), "/how-it-works");
    assert.equal(promoLogicalPath("/en/"), "/");
  });

  it("builds locale-prefixed promo paths and preserves logical page on switch", () => {
    assert.equal(promoPathFor("/", "en"), "/en/");
    assert.equal(promoPathFor("/features", "ja"), "/ja/features");
    assert.equal(promoPathFor("/ja/pricing", "en"), "/en/pricing");
    assert.equal(promoPathFor("/en/contact", "ja"), "/ja/contact");
  });

  it("persists promo locale preference under the promo key only", () => {
    const storage = new Map();
    const mock = {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    };
    const previousWindow = globalThis.window;
    const previousLocalStorage = globalThis.localStorage;
    globalThis.window = { localStorage: mock };
    globalThis.localStorage = mock;
    try {
      storage.set("checkstation.locale", "en");
      storage.set("checkstation.docs.locale", "en");
      storage.set("checkstation.status.locale", "en");
      savePromoLocalePreference("ja");
      assert.equal(storage.get(PROMO_LOCALE_STORAGE_KEY), "ja");
      assert.equal(readPromoLocalePreference(), "ja");
      assert.equal(storage.get("checkstation.locale"), "en");
      assert.equal(storage.get("checkstation.docs.locale"), "en");
      assert.equal(storage.get("checkstation.status.locale"), "en");
    } finally {
      globalThis.window = previousWindow;
      globalThis.localStorage = previousLocalStorage;
    }
  });

  it("marks JA product shots without jaSrc as placeholders", () => {
    assert.equal(shouldUsePromoImagePlaceholder("ja", null), true);
    assert.equal(shouldUsePromoImagePlaceholder("ja", "/ja.webp"), false);
    assert.equal(shouldUsePromoImagePlaceholder("en", null), false);
  });
});

describe("promo translations", () => {
  it("returns localized hero and shell copy", () => {
    assert.match(promoTranslate("en", "home.heroTitle"), /effortless/i);
    assert.match(promoTranslate("ja", "home.heroTitle"), /出席/);
    assert.equal(promoTranslate("en", "shell.navFeatures"), "Features");
    assert.equal(promoTranslate("ja", "shell.navFeatures"), "機能");
    assert.equal(promoTranslate("ja", "pricing.monthly"), "月払い");
    assert.match(promoTranslate("ja", "contact.title"), /CheckStation/);
    assert.equal(promoTranslate("en", "home.heroFeatureWords")[0], "ATTENDANCE");
    assert.equal(promoTranslate("ja", "home.heroFeatureWords")[0], "ATTENDANCE");
  });

  it("counts a substantial promo string catalog", () => {
    assert.ok(countPromoStrings("en") > 300);
    assert.equal(countPromoStrings("en"), countPromoStrings("ja"));
  });
});

describe("buildPublicFooterColumns", () => {
  it("localizes labels and prefixes Docs/Status with promo locale", () => {
    const labels = {
      "footer.columns.website": "ウェブサイト",
      "footer.columns.docs": "ドキュメント",
      "footer.columns.usage": "利用",
      "footer.items.features": "機能",
      "footer.items.howItWorks": "使い方",
      "footer.items.pricing": "料金",
      "footer.items.login": "ログイン",
      "footer.items.staffLogin": "スタッフログイン",
      "footer.items.getStarted": "はじめる",
      "footer.items.documentation": "ドキュメント",
      "footer.items.gettingStarted": "はじめに",
      "footer.items.kioskSetup": "キオスク設定",
      "footer.items.groupsMembers": "グループとメンバー",
      "footer.items.billingPlans": "請求とプラン",
      "footer.items.faq": "FAQ",
      "footer.items.privacyPolicy": "プライバシーポリシー",
      "footer.items.termsOfUse": "利用規約",
      "footer.items.support": "サポート",
      "footer.items.contact": "お問い合わせ",
      "footer.items.status": "ステータス",
    };
    const t = (key) => labels[key] || key;
    const columns = buildPublicFooterColumns("ja", t);
    assert.equal(columns[0].title, "ウェブサイト");
    assert.equal(columns[0].items[0].to, "/ja/features");
    assert.equal(columns[0].items.find((item) => item.id === "login").to, "/login");
    assert.match(columns[1].items[0].href, /\/ja\/?$/);
    assert.match(columns[2].items.find((item) => item.id === "status").href, /\/ja\/$/);

    const enColumns = buildPublicFooterColumns("en", (key) => key);
    assert.match(enColumns[1].items[0].href, /\/en\/?$/);
  });
});
