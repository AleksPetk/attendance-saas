import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTranslator,
  localeNativeLabel,
  LOCALE_NATIVE_LABELS,
  resolveLocale,
  SUPPORTED_LOCALES,
} from "./index.js";

describe("i18n", () => {
  it("resolves ja locale", () => {
    assert.equal(resolveLocale("ja-JP"), "ja");
    assert.equal(resolveLocale("en"), "en");
  });

  it("translates keys", () => {
    const t = createTranslator("ja");
    assert.equal(t("nav.home"), "ホーム");
    assert.equal(createTranslator("en")("nav.home"), "Home");
  });

  it("exposes supported locales with native endonym labels", () => {
    assert.deepEqual(SUPPORTED_LOCALES, ["en", "ja"]);
    assert.equal(LOCALE_NATIVE_LABELS.en, "English");
    assert.equal(LOCALE_NATIVE_LABELS.ja, "日本語");
    for (const locale of SUPPORTED_LOCALES) {
      assert.equal(localeNativeLabel(locale), LOCALE_NATIVE_LABELS[locale]);
    }
  });
});
