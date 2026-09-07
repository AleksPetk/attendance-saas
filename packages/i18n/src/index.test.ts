import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTranslator, resolveLocale } from "./index.js";

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
});
