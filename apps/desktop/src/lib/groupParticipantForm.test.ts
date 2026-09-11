import assert from "node:assert/strict";
import test from "node:test";
import { addParticipationEmailSlot, compactParticipationEmails, MAX_PARTICIPATION_EMAILS, memberParticipationPayload, participationEmailsForNewMember, removeParticipationEmailSlot, visitorParticipationPayload } from "./groupParticipantForm";

test("new Group participation prefills from the API suggestion without changing the Member", () => {
  const member = { id: 7, name: "Ari", email: "profile@example.com", suggested_participation_email: "suggested@example.com" };
  const emails = participationEmailsForNewMember(member);
  emails[0] = "group-only@example.com";
  assert.equal(member.email, "profile@example.com");
  assert.deepEqual(memberParticipationPayload(member.id, emails, "1234"), {
    member_id: 7,
    participation_emails: ["group-only@example.com"],
    participation_pin: "1234",
  });
});

test("Group email controls preserve one slot and enforce the backend maximum of three", () => {
  let emails = [""];
  emails = addParticipationEmailSlot(emails);
  emails = addParticipationEmailSlot(emails);
  emails = addParticipationEmailSlot(emails);
  assert.equal(emails.length, MAX_PARTICIPATION_EMAILS);
  assert.deepEqual(removeParticipationEmailSlot(emails, 1), ["", ""]);
  assert.deepEqual(compactParticipationEmails([" one@example.com ", "", "two@example.com", "ignored@example.com"]), ["one@example.com", "two@example.com"]);
});

test("visitor payload stays Group-only and uses the canonical participation fields", () => {
  assert.deepEqual(visitorParticipationPayload(" Visitor ", [" visitor@example.com ", "family@example.com"], ""), {
    name: "Visitor",
    participation_emails: ["visitor@example.com", "family@example.com"],
  });
});
