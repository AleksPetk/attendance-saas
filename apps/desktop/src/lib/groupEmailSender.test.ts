import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_EMAIL_SENDER, blankSenderForm, buildEmailSenderBody, normalizeForwardEmailSlots, savedForwardEmails, senderDraftRequiresTest, senderFormFromApi } from "./groupEmailSender";

test("sender public payload creates a blank-password form", () => {
  const form = senderFormFromApi({ ...EMPTY_EMAIL_SENDER, provider: "gmail", from_email: "owner@gmail.com", password_configured: true });
  assert.equal(form.gmail_address, "owner@gmail.com");
  assert.equal(form.smtp_password, "");
  assert.equal(form.change_password, false);
});

test("guided providers use their canonical API fields while Custom SMTP preserves its transport fields", () => {
  const gmail = blankSenderForm("gmail");
  gmail.gmail_address = "owner@gmail.com";
  gmail.smtp_password = "app-password";
  assert.deepEqual(buildEmailSenderBody(gmail, EMPTY_EMAIL_SENDER), { provider: "gmail", gmail_address: "owner@gmail.com", from_name: "", change_password: true, smtp_password: "app-password" });
  const custom = blankSenderForm("custom_smtp");
  custom.smtp_host = "smtp.example.com";
  custom.smtp_username = "owner";
  custom.from_email = "owner@example.com";
  assert.equal(buildEmailSenderBody(custom, EMPTY_EMAIL_SENDER).smtp_security, "ssl");
  assert.equal(senderDraftRequiresTest(custom, EMPTY_EMAIL_SENDER), true);
});

test("forward email slots preserve editing state and save at most three non-empty addresses", () => {
  assert.deepEqual(normalizeForwardEmailSlots([]), [""]);
  assert.deepEqual(savedForwardEmails([" one@example.com ", "", "two@example.com", "ignored@example.com"]), ["one@example.com", "two@example.com"]);
});
