import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { endpoints } from "@checkstation/api";
import {
  EMPTY_EMAIL_SENDER,
  applySavedSenderImport,
  buildGroupSenderSaveBody,
  buildSavedSenderCreateBody,
  isSavedSenderNameConflict,
  retainGroupDraftAfterTemplateDelete,
  savedSendersFromList,
  senderCredentialIsConfigured,
} from "@checkstation/domain";
import { savedSenderCardColumns, savedSenderCardWidth } from "./savedSenderLayout";

const source = readFileSync(new URL("../components/GroupEmailSender.tsx", import.meta.url), "utf8");

test("saved sender list loads from the existing API and empty state is shown", () => {
  assert.equal(endpoints.savedEmailSenders(), "/saved-email-senders/");
  assert.equal(endpoints.savedEmailSender(12), "/saved-email-senders/12/");
  assert.match(source, /endpoints\.savedEmailSenders\(\)/);
  assert.match(source, /savedSendersFromList/);
  assert.deepEqual(savedSendersFromList({ results: [] }), []);
  assert.match(source, /groups\.noSavedSenders/);
});

test("import Custom SMTP stays a draft and save includes saved_sender_id", () => {
  const imported = applySavedSenderImport({
    id: 12,
    name: "SELS Main Email",
    provider: "custom_smtp",
    smtp_host: "smtp.example.com",
    smtp_port: 587,
    smtp_security: "starttls",
    smtp_username: "user@example.com",
    from_email: "checkstation@sels.jp",
    from_name: "SELS",
    password_configured: true,
  });
  assert.equal(imported.form.provider, "custom_smtp");
  assert.equal(imported.form.smtp_password, "");
  assert.equal(senderCredentialIsConfigured({
    emailSender: EMPTY_EMAIL_SENDER,
    provider: imported.form.provider,
    importedSavedSenderId: imported.importedSavedSenderId,
    importedPasswordConfigured: imported.passwordConfigured,
  }), true);
  const body = buildGroupSenderSaveBody(imported.form, EMPTY_EMAIL_SENDER, imported.importedSavedSenderId);
  assert.equal(body.saved_sender_id, 12);
  assert.equal("smtp_password" in body, false);
  assert.match(source, /applySavedSenderImport/);
  assert.match(source, /buildGroupSenderSaveBody/);
  assert.equal(source.includes("api.put") && source.includes("importSavedSender"), true);
  const importFn = source.slice(source.indexOf("function importSavedSender"), source.indexOf("function senderBody"));
  assert.equal(importFn.includes("api.put"), false);
  assert.equal(importFn.includes("api.post"), false);
});

test("replacement password overrides the template credential and duplicate names require replace", () => {
  const imported = applySavedSenderImport({ id: 4, provider: "gmail", gmail_address: "office@gmail.com", from_email: "office@gmail.com", password_configured: true });
  const replaced = buildGroupSenderSaveBody({ ...imported.form, smtp_password: "new-secret", change_password: true }, EMPTY_EMAIL_SENDER, 4);
  assert.equal(replaced.saved_sender_id, undefined);
  assert.equal(replaced.smtp_password, "new-secret");
  const created = buildSavedSenderCreateBody({ name: "Office Gmail", senderForm: imported.form, importedSavedSenderId: 4 });
  assert.equal(created.provider, "gmail");
  assert.equal(created.saved_sender_id, 4);
  assert.equal(created.replace, false);
  assert.equal("forward_emails" in created, false);
  assert.equal(isSavedSenderNameConflict({ status: 409, data: { code: "saved_sender_name_exists" } }), true);
  const replacedTemplate = buildSavedSenderCreateBody({ name: "Office Gmail", senderForm: imported.form, importedSavedSenderId: 4, replace: true });
  assert.equal(replacedTemplate.replace, true);
  assert.match(source, /groups\.saveAsSavedSender/);
  assert.match(source, /groups\.replaceSavedSenderTitle/);
  assert.match(source, /submitSavedSender\(pendingReplace, true\)/);
});

test("delete confirmation does not alter the current Group sender", () => {
  const groupSender = { ...EMPTY_EMAIL_SENDER, status: "ready" as const, from_email: "kept@example.com" };
  const form = applySavedSenderImport({ id: 8, provider: "yahoo", yahoo_email: "office@yahoo.com", from_email: "office@yahoo.com", password_configured: true }).form;
  const retained = retainGroupDraftAfterTemplateDelete({ sender: groupSender, form });
  assert.equal(retained.sender.status, "ready");
  assert.equal(retained.sender.from_email, "kept@example.com");
  assert.equal(form.provider, "yahoo");
  assert.match(source, /groups\.deleteSavedSenderTitle/);
  assert.match(source, /endpoints\.savedEmailSender/);
  const deleteFn = source.slice(source.indexOf("async function confirmDeleteSavedSender"), source.indexOf("const providerLabel"));
  assert.equal(deleteFn.includes("setSender"), false);
  assert.equal(deleteFn.includes("setForm"), false);
  assert.equal(deleteFn.includes("api.put"), false);
  assert.match(deleteFn, /retainGroupDraftAfterTemplateDelete/);
});

test("provider switching without Save does not mutate backend state", () => {
  const changeProvider = source.slice(source.indexOf("function changeProvider"), source.indexOf("function selectProvider"));
  assert.equal(changeProvider.includes("api."), false);
  assert.match(changeProvider, /providerDrafts\.current\[provider\] \?\? blankSenderForm\(provider\)/);
  assert.match(source, /providerDrafts\.current\[form\.provider\] = \{ \.\.\.form \}/);
});

test("phone stays stacked and tablet uses two saved-sender columns", () => {
  assert.equal(savedSenderCardColumns(false), 1);
  assert.equal(savedSenderCardWidth(false), "100%");
  assert.equal(savedSenderCardColumns(true), 2);
  assert.equal(savedSenderCardWidth(true), "48%");
  assert.match(source, /savedSenderCardColumns\(tablet\)/);
  assert.match(source, /minHeight: touch\.min/);
  assert.match(source, /tablet \? styles\.two : styles\.stack/);
});
