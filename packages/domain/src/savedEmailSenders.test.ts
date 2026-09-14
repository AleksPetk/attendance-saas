import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_EMAIL_SENDER, senderFormFromApi } from "./groupEmailSender.js";
import {
  applySavedSenderImport,
  buildGroupSenderSaveBody,
  buildSavedSenderCreateBody,
  isSavedSenderNameConflict,
  retainGroupDraftAfterTemplateDelete,
  savedSendersFromList,
  senderCredentialIsConfigured,
} from "./savedEmailSenders.js";

const smtpTemplate = {
  id: 12,
  name: "SELS Main Email",
  provider: "custom_smtp" as const,
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_security: "starttls",
  smtp_username: "user@example.com",
  gmail_address: "",
  microsoft_email: "",
  yahoo_email: "",
  from_email: "checkstation@sels.jp",
  from_name: "SELS",
  password_configured: true,
};

test("saved sender list uses the API results and shows an empty state payload", () => {
  assert.deepEqual(savedSendersFromList({ results: [smtpTemplate] }).map((item) => item.name), ["SELS Main Email"]);
  assert.deepEqual(savedSendersFromList({ results: [] }), []);
  assert.deepEqual(savedSendersFromList(null), []);
});

test("import Custom SMTP switches provider and prefills non-secret fields only", () => {
  const imported = applySavedSenderImport(smtpTemplate);
  assert.equal(imported.form.provider, "custom_smtp");
  assert.equal(imported.form.smtp_host, "smtp.example.com");
  assert.equal(imported.form.smtp_port, 587);
  assert.equal(imported.form.smtp_security, "starttls");
  assert.equal(imported.form.smtp_username, "user@example.com");
  assert.equal(imported.form.from_email, "checkstation@sels.jp");
  assert.equal(imported.form.from_name, "SELS");
  assert.equal(imported.form.smtp_password, "");
  assert.equal(imported.importedSavedSenderId, 12);
});

test("configured credential is shown without a password", () => {
  assert.equal(senderCredentialIsConfigured({
    emailSender: { provider: "gmail", password_configured: false },
    provider: "custom_smtp",
    importedSavedSenderId: 12,
    importedPasswordConfigured: true,
  }), true);
  const imported = applySavedSenderImport(smtpTemplate);
  assert.equal(imported.form.smtp_password, "");
  assert.equal(imported.passwordConfigured, true);
});

test("save includes saved_sender_id until a replacement password is typed", () => {
  const imported = applySavedSenderImport(smtpTemplate);
  const reused = buildGroupSenderSaveBody(imported.form, EMPTY_EMAIL_SENDER, 12);
  assert.equal(reused.saved_sender_id, 12);
  assert.equal("smtp_password" in reused, false);
  assert.equal(reused.provider, "custom_smtp");

  const replaced = buildGroupSenderSaveBody(
    { ...imported.form, smtp_password: "typed-secret", change_password: true },
    EMPTY_EMAIL_SENDER,
    12,
  );
  assert.equal(replaced.saved_sender_id, undefined);
  assert.equal(replaced.smtp_password, "typed-secret");
  assert.equal(replaced.change_password, true);
});

test("import stays a draft and deleting the template does not change the Group sender", () => {
  const groupSender = { ...EMPTY_EMAIL_SENDER, status: "ready" as const, from_email: "kept@example.com", password_configured: true };
  const imported = applySavedSenderImport(smtpTemplate);
  const retained = retainGroupDraftAfterTemplateDelete({ sender: groupSender, form: imported.form });
  assert.equal(retained.sender, groupSender);
  assert.equal(retained.sender.from_email, "kept@example.com");
  assert.equal(retained.sender.status, "ready");
  assert.notEqual(imported.form.from_email, groupSender.from_email);
});

test("Gmail, Microsoft, and Yahoo templates keep their providers", () => {
  assert.equal(applySavedSenderImport({ id: 3, provider: "gmail", from_email: "office@gmail.com", gmail_address: "office@gmail.com", password_configured: true }).form.provider, "gmail");
  assert.equal(applySavedSenderImport({ id: 4, provider: "microsoft", from_email: "office@contoso.com", microsoft_email: "office@contoso.com", password_configured: true }).form.microsoft_email, "office@contoso.com");
  assert.equal(applySavedSenderImport({ id: 5, provider: "yahoo", from_email: "office@yahoo.com", yahoo_email: "office@yahoo.com", password_configured: true }).form.yahoo_email, "office@yahoo.com");
});

test("save as saved sender stores sender fields only and replace is explicit", () => {
  const form = senderFormFromApi({
    ...EMPTY_EMAIL_SENDER,
    provider: "custom_smtp",
    smtp_host: "smtp.example.com",
    smtp_port: 587,
    smtp_security: "starttls",
    smtp_username: "user@example.com",
    from_email: "checkstation@sels.jp",
    from_name: "SELS",
    password_configured: true,
  });
  const created = buildSavedSenderCreateBody({
    name: "SELS Main Email",
    senderForm: { ...form, smtp_password: "typed-secret" },
    sourceGroupId: 9,
  });
  assert.equal(created.smtp_password, "typed-secret");
  assert.equal(created.source_group_id, undefined);
  assert.equal(created.replace, false);
  assert.equal("pin" in created, false);
  assert.equal("forward_emails" in created, false);

  const replaced = buildSavedSenderCreateBody({ name: "SELS Main Email", senderForm: form, replace: true, sourceGroupId: 9, emailSender: { provider: "custom_smtp", password_configured: true } });
  assert.equal(replaced.replace, true);
  assert.equal(replaced.source_group_id, 9);
  assert.equal(isSavedSenderNameConflict({ status: 409, data: { code: "saved_sender_name_exists" } }), true);
  assert.equal(isSavedSenderNameConflict({ status: 400, data: { code: "other" } }), false);
});
