import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTranslator, type AppLocale } from "@checkstation/i18n";

const groupDetailKeys = [
  "groups.overview",
  "groups.participantLabel",
  "groups.configuration",
  "groups.participation",
  "groups.actions",
  "groups.requireEmail",
  "groups.requirePin",
  "groups.requireClassPin",
  "groups.notifications",
  "groups.forwardEmails",
  "groups.forwardEmailsHint",
  "groups.forwardEmail",
  "groups.forwardEmailNumbered",
  "groups.addAnotherForwardEmail",
  "groups.saveChanges",
  "groups.savingChanges",
  "groups.dangerZone",
  "groups.archive",
  "groups.restore",
  "kiosk.checkIn",
  "kiosk.checkOut",
  "kiosk.breaks",
  "kiosk.maxBreaks",
  "kiosk.design",
] as const;

describe("Group Details translations", () => {
  for (const locale of ["en", "ja"] satisfies AppLocale[]) {
    it(`does not expose raw keys in ${locale}`, () => {
      const t = createTranslator(locale);
      for (const key of groupDetailKeys) assert.notEqual(t(key), key, key);
    });
  }
});
