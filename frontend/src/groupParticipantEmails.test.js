import assert from "node:assert/strict";
import test from "node:test";
import {
  participationEmailsForEdit,
  participationEmailsForNewMember,
  suggestedFirstParticipationEmail,
} from "./groupParticipantEmails.js";

test("A: Member with profile email prefills #1", () => {
  assert.deepEqual(
    participationEmailsForNewMember({
      email: "parent@example.com",
      suggested_participation_email: "parent@example.com",
    }),
    ["parent@example.com"],
  );
});

test("B: Member without profile email starts blank", () => {
  assert.deepEqual(
    participationEmailsForNewMember({
      email: "",
      suggested_participation_email: "",
    }),
    [""],
  );
});

test("C: only email #1 is prefilled", () => {
  const slots = participationEmailsForNewMember({
    email: "only@example.com",
  });
  assert.equal(slots.length, 1);
  assert.equal(slots[0], "only@example.com");
});

test("D: switch selected Member uses new profile email", () => {
  assert.equal(
    suggestedFirstParticipationEmail({ email: "first@example.com" }),
    "first@example.com",
  );
  assert.equal(
    suggestedFirstParticipationEmail({ email: "second@example.com" }),
    "second@example.com",
  );
});

test("E: editing uses saved participation emails, not Member profile", () => {
  assert.deepEqual(
    participationEmailsForEdit(
      ["mother@example.com", "father@example.com"],
      "parent-old@example.com",
    ),
    ["mother@example.com", "father@example.com"],
  );
});

test("suggested falls back to Member.email when suggestion empty", () => {
  assert.equal(
    suggestedFirstParticipationEmail({
      email: "profile@example.com",
      suggested_participation_email: "",
    }),
    "profile@example.com",
  );
});

test("H: visitors have no Member prefill helper input", () => {
  assert.deepEqual(participationEmailsForNewMember(null), [""]);
  assert.deepEqual(participationEmailsForNewMember(undefined), [""]);
});
