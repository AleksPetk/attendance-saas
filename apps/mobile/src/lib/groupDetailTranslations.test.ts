import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, test } from "node:test";
import { fileURLToPath } from "node:url";
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

const detailSource = readFileSync(
  fileURLToPath(new URL("../../app/(app)/group/[id].tsx", import.meta.url)),
  "utf8",
);

describe("Group Details translations", () => {
  for (const locale of ["en", "ja"] satisfies AppLocale[]) {
    it(`does not expose raw keys in ${locale}`, () => {
      const t = createTranslator(locale);
      for (const key of groupDetailKeys) assert.notEqual(t(key), key, key);
    });
  }
});

test("Group Detail active tab matches Desktop segmented CheckStation gradient", () => {
  assert.match(detailSource, /LinearGradient/);
  assert.match(detailSource, /colors=\{\[colors\.blue, colors\.cyan\]\}/);
  assert.match(detailSource, /end=\{\{\s*x:\s*1,\s*y:\s*1\s*\}\}/);
  assert.match(detailSource, /start=\{\{\s*x:\s*0,\s*y:\s*0\s*\}\}/);
  assert.match(detailSource, /detailTabTextActive:\s*\{\s*color:\s*colors\.surface\s*\}/);
  assert.match(detailSource, /shadowOpacity:\s*0\.18/);
  assert.doesNotMatch(detailSource, /detailTabActive:\s*\{\s*backgroundColor:\s*colors\.blue\s*\}/);
  assert.doesNotMatch(detailSource, /detailTabTextActive:\s*\{\s*color:\s*colors\.bluePressed/);
});
