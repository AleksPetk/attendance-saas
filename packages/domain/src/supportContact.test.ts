import assert from "node:assert/strict";
import test from "node:test";
import {
  MESSAGE_MAX,
  MESSAGE_MIN,
  SUBJECT_MAX,
  suggestedSubject,
} from "./supportContact.js";

test("suggestedSubject mirrors browser Workspace Contact mapping", () => {
  assert.equal(suggestedSubject("Kiosk", "Cannot launch kiosk"), "Kiosk: Cannot launch kiosk");
  assert.equal(suggestedSubject("", "x"), "");
  assert.equal(suggestedSubject("A", ""), "");
  assert.equal(suggestedSubject("x".repeat(200), "y").length, SUBJECT_MAX);
  assert.equal(MESSAGE_MIN, 20);
  assert.equal(MESSAGE_MAX, 4000);
});
