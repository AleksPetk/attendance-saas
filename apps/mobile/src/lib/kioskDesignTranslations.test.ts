import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTranslator, type AppLocale } from "@checkstation/i18n";

const kioskDesignKeys = [
  "kiosk.design",
  "kiosk.designLoading",
  "kiosk.saveDesign",
  "kiosk.header",
  "kiosk.main",
  "kiosk.footer",
  "kiosk.cards",
  "kiosk.enabled",
  "kiosk.background",
  "kiosk.background.solid",
  "kiosk.background.gradient",
  "kiosk.background.image",
  "kiosk.backgroundColor",
  "kiosk.primaryColor",
  "kiosk.secondaryColor",
  "kiosk.customColor",
  "kiosk.textColor",
  "kiosk.alignment",
  "kiosk.left",
  "kiosk.center",
  "kiosk.right",
  "kiosk.layout",
  "kiosk.cardTemplate",
  "kiosk.inputTemplate",
  "kiosk.buttonStyle",
  "kiosk.cardStyle",
  "kiosk.inputStyle",
  "kiosk.footerText",
  "kiosk.livePreview",
  "kiosk.unsavedDesignTitle",
  "kiosk.discardChanges",
] as const;

describe("Kiosk Design translations", () => {
  for (const locale of ["en", "ja"] satisfies AppLocale[]) {
    it(`does not expose raw keys in ${locale}`, () => {
      const t = createTranslator(locale);
      for (const key of kioskDesignKeys) assert.notEqual(t(key), key, key);
    });
  }
});
