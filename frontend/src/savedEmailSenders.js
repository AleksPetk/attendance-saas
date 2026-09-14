/**
 * Saved Sender templates are copied into the current Group sender form.
 * They are never linked to the Group.
 */

export const SAVED_SENDERS_PICKER = "saved_senders";
export const SAVED_SENDER_NAME_EXISTS = "saved_sender_name_exists";

const PROVIDER_CUSTOM_SMTP = "custom_smtp";
const PROVIDER_GMAIL = "gmail";
const PROVIDER_MICROSOFT = "microsoft";
const PROVIDER_YAHOO = "yahoo";

export function savedSenderDisplayAddress(sender) {
  return String(sender?.from_email || sender?.smtp_username || "").trim();
}

export function senderCredentialIsConfigured({
  emailSender,
  provider,
  changePassword = false,
  importedSavedSenderId = null,
  importedPasswordConfigured = false,
}) {
  if (changePassword) return false;
  if (importedSavedSenderId && importedPasswordConfigured) return true;
  return Boolean(
    emailSender?.password_configured && emailSender.provider === provider,
  );
}

export function applySavedSenderImport(sender) {
  const provider = sender?.provider || PROVIDER_CUSTOM_SMTP;
  return {
    importedSavedSenderId: sender?.id ?? null,
    passwordConfigured: Boolean(sender?.password_configured),
    form: {
      provider,
      smtp_host: sender?.smtp_host || "",
      smtp_port:
        sender?.smtp_port ?? (provider === PROVIDER_CUSTOM_SMTP ? 465 : ""),
      smtp_security:
        sender?.smtp_security || (provider === PROVIDER_CUSTOM_SMTP ? "ssl" : ""),
      smtp_username: sender?.smtp_username || "",
      gmail_address:
        sender?.gmail_address ||
        (provider === PROVIDER_GMAIL ? sender?.from_email : "") ||
        "",
      microsoft_email:
        sender?.microsoft_email ||
        (provider === PROVIDER_MICROSOFT ? sender?.from_email : "") ||
        "",
      yahoo_email:
        sender?.yahoo_email ||
        (provider === PROVIDER_YAHOO ? sender?.from_email : "") ||
        "",
      from_email: sender?.from_email || "",
      from_name: sender?.from_name || "",
      smtp_password: "",
      change_password: false,
    },
  };
}

export function attachImportedCredential(body, { importedSavedSenderId, smtpPassword, changePassword }) {
  if (!importedSavedSenderId || smtpPassword || changePassword) {
    return body;
  }
  const next = { ...body, saved_sender_id: importedSavedSenderId };
  delete next.smtp_password;
  delete next.change_password;
  return next;
}

export function buildSavedSenderCreateBody({
  name,
  senderForm,
  importedSavedSenderId = null,
  sourceGroupId = null,
  emailSender = null,
  replace = false,
}) {
  const provider = senderForm.provider;
  const body =
    provider === PROVIDER_GMAIL
      ? {
          name,
          replace,
          provider,
          gmail_address: senderForm.gmail_address,
          from_name: senderForm.from_name,
        }
      : provider === PROVIDER_MICROSOFT
        ? {
            name,
            replace,
            provider,
            microsoft_email: senderForm.microsoft_email,
            from_name: senderForm.from_name,
          }
        : provider === PROVIDER_YAHOO
          ? {
              name,
              replace,
              provider,
              yahoo_email: senderForm.yahoo_email,
              from_name: senderForm.from_name,
            }
          : {
              name,
              replace,
              provider: PROVIDER_CUSTOM_SMTP,
              smtp_host: senderForm.smtp_host,
              smtp_port: Number(senderForm.smtp_port) || null,
              smtp_security: senderForm.smtp_security,
              smtp_username: senderForm.smtp_username,
              from_email: senderForm.from_email,
              from_name: senderForm.from_name,
            };

  if (senderForm.smtp_password) {
    body.smtp_password = senderForm.smtp_password;
    return body;
  }
  if (importedSavedSenderId && !senderForm.change_password) {
    body.saved_sender_id = importedSavedSenderId;
    return body;
  }
  if (
    sourceGroupId &&
    !senderForm.change_password &&
    emailSender?.password_configured &&
    emailSender.provider === provider
  ) {
    body.source_group_id = sourceGroupId;
  }
  return body;
}

export function isSavedSenderNameConflict(error) {
  return error?.status === 409 && error?.data?.code === SAVED_SENDER_NAME_EXISTS;
}
