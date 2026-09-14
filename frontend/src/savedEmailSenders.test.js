import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  SAVED_SENDERS_PICKER,
  applySavedSenderImport,
  attachImportedCredential,
  buildSavedSenderCreateBody,
  isSavedSenderNameConflict,
  savedSenderDisplayAddress,
  senderCredentialIsConfigured,
} from "./savedEmailSenders.js";

describe("saved email sender templates", () => {
  it("imports Custom SMTP as a draft with non-secret fields only", () => {
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

    assert.equal(imported.importedSavedSenderId, 12);
    assert.equal(imported.passwordConfigured, true);
    assert.equal(imported.form.provider, "custom_smtp");
    assert.equal(imported.form.smtp_host, "smtp.example.com");
    assert.equal(imported.form.smtp_port, 587);
    assert.equal(imported.form.smtp_security, "starttls");
    assert.equal(imported.form.smtp_username, "user@example.com");
    assert.equal(imported.form.from_email, "checkstation@sels.jp");
    assert.equal(imported.form.from_name, "SELS");
    assert.equal(imported.form.smtp_password, "");
    assert.equal(imported.form.change_password, false);
    assert.equal(imported.form.group_name, undefined);
    assert.equal(imported.form.pin, undefined);
    assert.equal("smtp_password" in imported.form, true);
    assert.equal(imported.form.smtp_password, "");
  });

  it("keeps Gmail, Microsoft, and Yahoo providers when importing", () => {
    const gmail = applySavedSenderImport({
      id: 3,
      provider: "gmail",
      from_email: "office@gmail.com",
      gmail_address: "office@gmail.com",
      password_configured: true,
    });
    const microsoft = applySavedSenderImport({
      id: 4,
      provider: "microsoft",
      from_email: "office@contoso.com",
      microsoft_email: "office@contoso.com",
      password_configured: true,
    });
    const yahoo = applySavedSenderImport({
      id: 5,
      provider: "yahoo",
      from_email: "office@yahoo.com",
      yahoo_email: "office@yahoo.com",
      password_configured: true,
    });

    assert.equal(gmail.form.provider, "gmail");
    assert.equal(gmail.form.gmail_address, "office@gmail.com");
    assert.equal(microsoft.form.provider, "microsoft");
    assert.equal(microsoft.form.microsoft_email, "office@contoso.com");
    assert.equal(yahoo.form.provider, "yahoo");
    assert.equal(yahoo.form.yahoo_email, "office@yahoo.com");
  });

  it("shows configured only from the imported credential until a password is replaced", () => {
    assert.equal(
      senderCredentialIsConfigured({
        emailSender: { provider: "gmail", password_configured: false },
        provider: "custom_smtp",
        importedSavedSenderId: 12,
        importedPasswordConfigured: true,
      }),
      true,
    );
    assert.equal(
      senderCredentialIsConfigured({
        emailSender: { provider: "gmail", password_configured: false },
        provider: "custom_smtp",
        importedSavedSenderId: 12,
        importedPasswordConfigured: true,
        changePassword: true,
      }),
      false,
    );
  });

  it("asks the backend to copy the template credential unless a password was typed", () => {
    const reused = attachImportedCredential(
      { provider: "custom_smtp", smtp_host: "smtp.example.com" },
      { importedSavedSenderId: 12, smtpPassword: "", changePassword: false },
    );
    assert.equal(reused.saved_sender_id, 12);
    assert.equal("smtp_password" in reused, false);

    const replaced = attachImportedCredential(
      { provider: "custom_smtp", smtp_password: "new-secret", change_password: true },
      { importedSavedSenderId: 12, smtpPassword: "new-secret", changePassword: true },
    );
    assert.equal(replaced.saved_sender_id, undefined);
    assert.equal(replaced.smtp_password, "new-secret");
  });

  it("creates a sender-only template and requires replace for a duplicate name", () => {
    const body = buildSavedSenderCreateBody({
      name: "SELS Main Email",
      senderForm: {
        provider: "custom_smtp",
        smtp_host: "smtp.example.com",
        smtp_port: 587,
        smtp_security: "starttls",
        smtp_username: "user@example.com",
        from_email: "checkstation@sels.jp",
        from_name: "SELS",
        smtp_password: "typed-secret",
      },
      sourceGroupId: 99,
    });
    assert.equal(body.smtp_password, "typed-secret");
    assert.equal(body.source_group_id, undefined);
    assert.equal(body.saved_sender_id, undefined);
    assert.equal(body.forward_emails, undefined);
    assert.equal(body.pin, undefined);

    const fromTemplate = buildSavedSenderCreateBody({
      name: "Office Gmail",
      senderForm: {
        provider: "gmail",
        gmail_address: "office@gmail.com",
        from_name: "Office",
        smtp_password: "",
        change_password: false,
      },
      importedSavedSenderId: 4,
    });
    assert.equal(fromTemplate.provider, "gmail");
    assert.equal(fromTemplate.saved_sender_id, 4);
    assert.equal(fromTemplate.smtp_password, undefined);

    assert.equal(
      isSavedSenderNameConflict({
        status: 409,
        data: { code: "saved_sender_name_exists", name: "SELS Main Email" },
      }),
      true,
    );
    assert.equal(isSavedSenderNameConflict({ status: 400, data: { code: "other" } }), false);
  });

  it("uses the workspace display address and picker value", () => {
    assert.equal(
      savedSenderDisplayAddress({
        from_email: "checkstation@sels.jp",
        smtp_username: "user@example.com",
      }),
      "checkstation@sels.jp",
    );
    assert.equal(SAVED_SENDERS_PICKER, "saved_senders");
  });

  it("keeps Saved senders inside the existing Email Sender card with confirmations", () => {
    const source = readFileSync(new URL("./GroupEditorScreen.jsx", import.meta.url), "utf8");
    assert.match(source, /SAVED_SENDERS_PICKER/);
    assert.match(source, /editor\.savedSendersOption/);
    assert.match(source, /editor\.saveAsSavedSender/);
    assert.match(source, /editor\.noSavedSenders/);
    assert.match(source, /editor\.deleteSavedSenderTitle/);
    assert.match(source, /editor\.replaceSavedSenderTitle/);
    assert.match(source, /applySavedSenderImport/);
    assert.doesNotMatch(source, /navigate\(\{ name: "saved-senders"/);
  });
});
