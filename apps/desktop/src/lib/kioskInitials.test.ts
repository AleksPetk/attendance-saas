import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator } from "@checkstation/i18n";
import { initials, kioskParticipantDisplayName } from "./kioskInitials";

test("initials never throws on null/undefined/empty names", () => {
  assert.equal(initials(null), "?");
  assert.equal(initials(undefined), "?");
  assert.equal(initials(""), "?");
  assert.equal(initials("   "), "?");
});

test("initials matches browser-style one and two letter cases", () => {
  assert.equal(initials("Nami"), "N");
  assert.equal(initials("Alex Chen"), "AC");
  assert.equal(initials("Margaret Hamilton"), "MH");
});

test("participant display name matches browser participantFallback EN/JA", () => {
  const en = createTranslator("en")("kiosk.participantFallback");
  const ja = createTranslator("ja")("kiosk.participantFallback");
  assert.equal(en, "Participant");
  assert.equal(ja, "参加者");
  assert.equal(kioskParticipantDisplayName(null, en), "Participant");
  assert.equal(kioskParticipantDisplayName("", en), "Participant");
  assert.equal(kioskParticipantDisplayName(undefined, ja), "参加者");
  assert.equal(kioskParticipantDisplayName("Aleks", en), "Aleks");
  assert.equal(kioskParticipantDisplayName("山田 太郎", ja), "山田 太郎");
});
