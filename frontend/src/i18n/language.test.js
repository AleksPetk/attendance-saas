import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  browserLocale,
  DEFAULT_LOCALE,
  localeHtmlLang,
  normalizeLocale,
  SUPPORTED_LOCALES,
} from "./language.js";
import {
  hasExplicitSavedLocale,
  readSavedLocale,
  resolveInitialLocale,
  saveLocalePreference,
} from "./storage.js";

describe("normalizeLocale", () => {
  it("accepts canonical locales", () => {
    assert.equal(normalizeLocale("en"), "en");
    assert.equal(normalizeLocale("ja"), "ja");
  });

  it("normalizes regional variants", () => {
    assert.equal(normalizeLocale("en-US"), "en");
    assert.equal(normalizeLocale("en-GB"), "en");
    assert.equal(normalizeLocale("ja-JP"), "ja");
  });

  it("falls back unsupported locales to English", () => {
    assert.equal(normalizeLocale("fr"), "en");
    assert.equal(normalizeLocale("de-DE"), "en");
    assert.equal(normalizeLocale(""), DEFAULT_LOCALE);
  });
});

describe("locale resolution storage", () => {
  const storage = new Map();

  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  function installMockStorage() {
    storage.clear();
    globalThis.localStorage = {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
    };
    globalThis.window = { localStorage: globalThis.localStorage };
  }

  function restoreStorage() {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }

  it("restores explicit saved locale before browser fallback", () => {
    installMockStorage();
    try {
      saveLocalePreference("ja", { explicit: true });
      assert.equal(resolveInitialLocale(), "ja");
      assert.equal(hasExplicitSavedLocale(), true);
      assert.equal(readSavedLocale(), "ja");
    } finally {
      restoreStorage();
    }
  });
});

describe("html lang helper", () => {
  it("maps app locales to html lang values", () => {
    assert.equal(localeHtmlLang("en"), "en");
    assert.equal(localeHtmlLang("ja"), "ja");
  });
});

describe("supported locales", () => {
  it("includes English and Japanese only", () => {
    assert.deepEqual(SUPPORTED_LOCALES, ["en", "ja"]);
  });

  it("browserLocale falls back to English without navigator", () => {
    const originalNavigator = globalThis.navigator;
    delete globalThis.navigator;
    try {
      assert.equal(browserLocale(), DEFAULT_LOCALE);
    } finally {
      globalThis.navigator = originalNavigator;
    }
  });
});
