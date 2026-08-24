/**
 * Run: node --test src/groupKioskStartPeople.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  initialKioskStepFromStartPayload,
  peopleFromKioskStartPayload,
} from "./groupKioskStartPeople.js";

test("Standard Card start keeps people from payload", () => {
  const people = peopleFromKioskStartPayload({
    kiosk: { structured: false, kiosk_mode: "card" },
    people: [
      { membership_id: 1, name: "Mama" },
      { membership_id: 2, name: "Shaylin" },
    ],
  });
  assert.equal(people.length, 2);
  assert.equal(initialKioskStepFromStartPayload({ kiosk: { structured: false } }), "start");
});

test("Structured start does not dump Class people on start", () => {
  const people = peopleFromKioskStartPayload({
    kiosk: { structured: true, kiosk_mode: "card" },
    people: [{ membership_id: 9, name: "Should not appear" }],
    classes: [{ id: 1, name: "A" }],
  });
  assert.deepEqual(people, []);
  assert.equal(initialKioskStepFromStartPayload({ kiosk: { structured: true } }), "classes");
});

test("missing people defaults to empty array", () => {
  assert.deepEqual(peopleFromKioskStartPayload({ kiosk: { structured: false } }), []);
});
