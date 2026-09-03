import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DOCS_LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  docsPathFor,
  docsUi,
  resolveDocsLocale,
  resolveInitialDocsLocale,
  saveDocsLocalePreference,
} from "../static/locale.js";

test("resolveDocsLocale reads supported prefixes", () => {
  assert.equal(resolveDocsLocale("/en/"), "en");
  assert.equal(resolveDocsLocale("/ja/getting-started"), "ja");
  assert.equal(resolveDocsLocale("/getting-started"), null);
});

test("docsPathFor builds locale-prefixed routes", () => {
  assert.equal(docsPathFor("documentation", "en"), "/en/");
  assert.equal(docsPathFor("documentation", "ja"), "/ja/");
  assert.equal(docsPathFor("getting-started", "en"), "/en/getting-started");
  assert.equal(docsPathFor("faq", "ja"), "/ja/faq");
});

test("resolveInitialDocsLocale prefers path prefix", () => {
  assert.equal(resolveInitialDocsLocale("/ja/faq"), "ja");
});

test("docsUi returns localized chrome strings", () => {
  assert.equal(docsUi("en").searchPlaceholder, "Search CheckStation help...");
  assert.equal(docsUi("ja").searchPlaceholder, "CheckStation ヘルプを検索...");
  assert.equal(docsUi("xx").searchPlaceholder, docsUi("en").searchPlaceholder);
});

test("saveDocsLocalePreference stores supported locales only", () => {
  const storage = new Map();
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
  };
  try {
    saveDocsLocalePreference("ja");
    assert.equal(storage.get(DOCS_LOCALE_STORAGE_KEY), "ja");
    saveDocsLocalePreference("fr");
    assert.equal(storage.get(DOCS_LOCALE_STORAGE_KEY), "ja");
  } finally {
    globalThis.window = originalWindow;
  }
});

test("supported locales remain en and ja", () => {
  assert.deepEqual(SUPPORTED_LOCALES, ["en", "ja"]);
});
