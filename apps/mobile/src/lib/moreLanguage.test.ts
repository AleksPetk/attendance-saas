import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LOCALE_NATIVE_LABELS, SUPPORTED_LOCALES, localeNativeLabel } from "@checkstation/i18n";

const moreSource = readFileSync(
  fileURLToPath(new URL("../../app/(app)/(tabs)/more.tsx", import.meta.url)),
  "utf8",
);

test("More language uses one scalable SelectField over SUPPORTED_LOCALES", () => {
  assert.match(moreSource, /SUPPORTED_LOCALES/);
  assert.match(moreSource, /localeNativeLabel/);
  assert.match(moreSource, /SelectField/);
  assert.match(moreSource, /setLocale\(next as AppLocale\)/);
  assert.doesNotMatch(moreSource, /LanguageButton/);
  assert.doesNotMatch(moreSource, /label="English"/);
  assert.doesNotMatch(moreSource, /label="日本語"/);
});

test("language options come from Workspace supported locales with native names", () => {
  assert.deepEqual([...SUPPORTED_LOCALES], ["en", "ja"]);
  assert.equal(localeNativeLabel("en"), "English");
  assert.equal(localeNativeLabel("ja"), "日本語");
  assert.equal(LOCALE_NATIVE_LABELS.en, "English");
  assert.equal(LOCALE_NATIVE_LABELS.ja, "日本語");
});

test("SelectField sheet already checkmarks the selected option and closes on change", () => {
  const picker = readFileSync(
    fileURLToPath(new URL("../features/history/HistoryPicker.tsx", import.meta.url)),
    "utf8",
  );
  assert.match(picker, /checkmark-circle/);
  assert.match(picker, /onChange\(next\);\s*setOpen\(false\)/);
  assert.match(picker, /ScrollView/);
});
