import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EMPTY_EMAIL_SENDER, SAVED_SENDERS_PICKER, applySavedSenderImport, buildGroupSenderSaveBody, buildSavedSenderCreateBody, isSavedSenderNameConflict, retainGroupDraftAfterTemplateDelete, savedSendersFromList, senderCredentialIsConfigured } from "./groupEmailSender";

const page = readFileSync(new URL("../pages/GroupDetailPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function sourceOf(name: string) {
  const start = page.indexOf(`function ${name}`);
  assert.notEqual(start, -1, name);
  const next = page.indexOf("\n  function ", start + 1);
  const asyncNext = page.indexOf("\n  async function ", start + 1);
  const end = [next, asyncNext].filter((index) => index > start).sort((left, right) => left - right)[0] ?? page.length;
  return page.slice(start, end);
}

const customTemplate = {
  id: 8,
  name: "SELS Main Email",
  provider: "custom_smtp" as const,
  smtp_host: "smtp.sels.jp",
  smtp_port: 465,
  smtp_security: "ssl",
  smtp_username: "checkstation@sels.jp",
  gmail_address: "",
  microsoft_email: "",
  yahoo_email: "",
  from_email: "checkstation@sels.jp",
  from_name: "SELS",
  password_configured: true,
};

test("saved sender list loads from the existing API and empty state is shown", () => {
  assert.equal(SAVED_SENDERS_PICKER, "saved_senders");
  assert.match(page, /endpoints\.savedEmailSenders\(\)/);
  assert.match(page, /savedSendersFromList\(payload\)/);
  assert.match(page, /groups\.savedSendersOption/);
  assert.match(page, /groups\.noSavedSenders/);
  assert.deepEqual(savedSendersFromList({ results: [customTemplate] }).map((item) => item.name), ["SELS Main Email"]);
  assert.deepEqual(savedSendersFromList({ results: [] }), []);
  assert.deepEqual(savedSendersFromList(null), []);
});

test("import Custom SMTP stays a draft, switches provider, and hides the password", () => {
  const imported = applySavedSenderImport(customTemplate);
  assert.equal(imported.form.provider, "custom_smtp");
  assert.equal(imported.form.smtp_host, "smtp.sels.jp");
  assert.equal(imported.form.smtp_username, "checkstation@sels.jp");
  assert.equal(imported.form.from_email, "checkstation@sels.jp");
  assert.equal(imported.form.from_name, "SELS");
  assert.equal(imported.form.smtp_password, "");
  assert.equal(imported.passwordConfigured, true);
  assert.equal(senderCredentialIsConfigured({
    emailSender: EMPTY_EMAIL_SENDER,
    provider: imported.form.provider,
    importedSavedSenderId: imported.importedSavedSenderId,
    importedPasswordConfigured: imported.passwordConfigured,
  }), true);
  const importer = sourceOf("importSavedSender");
  assert.match(importer, /applySavedSenderImport/);
  assert.match(importer, /setSenderPanel\("form"\)/);
  assert.doesNotMatch(importer, /api\.(put|post|patch|delete)/);
  assert.match(page, /groups\.passwordConfigured/);
  assert.match(page, /credentialConfigured/);
});

test("save includes saved_sender_id until a replacement password is typed", () => {
  const imported = applySavedSenderImport(customTemplate);
  const body = buildGroupSenderSaveBody(imported.form, EMPTY_EMAIL_SENDER, imported.importedSavedSenderId);
  assert.equal(body.saved_sender_id, 8);
  assert.equal(body.smtp_password, undefined);
  const replaced = buildGroupSenderSaveBody({ ...imported.form, smtp_password: "new-secret", change_password: true }, EMPTY_EMAIL_SENDER, 8);
  assert.equal(replaced.saved_sender_id, undefined);
  assert.equal(replaced.smtp_password, "new-secret");
  assert.match(page, /buildGroupSenderSaveBody\(senderForm, sender, importedSavedSenderId\)/);
  assert.match(sourceOf("saveSender"), /api\.put/);
  assert.match(sourceOf("beginPasswordChange"), /setImportedSavedSenderId\(null\)/);
});

test("save as saved sender posts sender fields only and duplicate names require replace", () => {
  const imported = applySavedSenderImport(customTemplate);
  const created = buildSavedSenderCreateBody({ name: "SELS Main Email", senderForm: imported.form, sourceGroupId: 4, emailSender: EMPTY_EMAIL_SENDER });
  assert.equal(created.name, "SELS Main Email");
  assert.equal(created.provider, "custom_smtp");
  assert.equal(created.replace, false);
  assert.equal("forward_emails" in created, false);
  assert.equal("pin" in created, false);
  assert.equal("notifications" in created, false);
  const replacement = buildSavedSenderCreateBody({ name: "SELS Main Email", senderForm: imported.form, replace: true });
  assert.equal(replacement.replace, true);
  assert.equal(isSavedSenderNameConflict({ status: 409, data: { code: "saved_sender_name_exists" } }), true);
  const submit = sourceOf("submitSavedSender");
  assert.match(submit, /buildSavedSenderCreateBody/);
  assert.match(submit, /endpoints\.savedEmailSenders\(\)/);
  assert.match(submit, /isSavedSenderNameConflict/);
  assert.match(submit, /replace/);
  assert.match(page, /submitSavedSender\(pendingReplace, true\)/);
  assert.match(page, /groups\.replaceSavedSenderTitle/);
  assert.match(page, /groups\.saveAsSavedSender/);
  assert.doesNotMatch(submit, /forward_emails|testEmail|notifications|kiosk/);
});

test("delete confirmation does not alter the current Group sender", () => {
  const current = { sender: { provider: "custom_smtp", smtp_host: "kept.example" }, senderForm: { smtp_host: "draft.example" } };
  assert.equal(retainGroupDraftAfterTemplateDelete(current), current);
  const remove = sourceOf("confirmDeleteSavedSender");
  assert.match(remove, /endpoints\.savedEmailSender/);
  assert.match(remove, /api\.delete/);
  assert.match(remove, /retainGroupDraftAfterTemplateDelete/);
  assert.match(remove, /loadSavedSenders\(\)/);
  assert.doesNotMatch(remove, /setSender\(|setSenderForm\(|api\.put/);
  assert.match(page, /groups\.deleteSavedSenderTitle/);
  assert.match(page, /groups\.deleteSavedSenderBody/);
});

test("Gmail, Microsoft, and Yahoo imports map to their providers", () => {
  assert.equal(applySavedSenderImport({ ...customTemplate, provider: "gmail", from_email: "office@gmail.com", gmail_address: "office@gmail.com" }).form.provider, "gmail");
  assert.equal(applySavedSenderImport({ ...customTemplate, provider: "microsoft", from_email: "office@outlook.com", microsoft_email: "office@outlook.com" }).form.provider, "microsoft");
  assert.equal(applySavedSenderImport({ ...customTemplate, provider: "yahoo", from_email: "office@yahoo.com", yahoo_email: "office@yahoo.com" }).form.provider, "yahoo");
});

test("provider switching without Save does not mutate backend state", () => {
  const select = sourceOf("onProviderSelect");
  const change = sourceOf("changeProvider");
  assert.match(select, /SAVED_SENDERS_PICKER/);
  assert.match(select, /loadSavedSenders\(\)/);
  assert.doesNotMatch(select, /api\./);
  assert.match(change, /blankSenderForm\(provider\)/);
  assert.doesNotMatch(change, /api\./);
  assert.match(page, /setImportedSavedSenderId\(null\)/);
  assert.match(page, /senderFormFromApi\(next\)/);
});

test("saved sender rows stay compact and wrap without overflow", () => {
  assert.match(styles, /\.saved-sender-row\{[^}]*flex-wrap:wrap/);
  assert.match(styles, /\.saved-sender-copy\{[^}]*min-width:0/);
  assert.match(styles, /\.saved-sender-actions\{[^}]*flex-wrap:wrap/);
  assert.match(styles, /\.email-sender-save\{[^}]*flex-wrap:wrap/);
});
