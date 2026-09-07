import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTranslator, type AppLocale } from "@checkstation/i18n";

const kioskSettingsKeys = [
  "kiosk.showName",
  "kiosk.showCode",
  "kiosk.showEmail",
  "kiosk.usePin",
  "kiosk.newExitCode",
  "kiosk.exitCodePlaceholder",
  "kiosk.confirmExitCode",
  "kiosk.resetMode",
  "kiosk.daily",
  "kiosk.rolling",
  "kiosk.resetTime",
  "kiosk.currentReset",
  "kiosk.resetNow",
  "kiosk.saveSettings",
  "kiosk.savingSettings",
  "kiosk.template.clean",
  "kiosk.template.business",
  "kiosk.template.friendly",
  "kiosk.template.kids",
  "kiosk.template.fitness",
  "kiosk.template.event",
  "kiosk.template.celebration",
  "kiosk.template.minimal",
] as const;

describe("Kiosk Settings translations", () => {
  for (const locale of ["en", "ja"] satisfies AppLocale[]) {
    it(`does not expose raw keys in ${locale}`, () => {
      const t = createTranslator(locale);
      for (const key of kioskSettingsKeys) assert.notEqual(t(key), key, key);
    });
  }
});
