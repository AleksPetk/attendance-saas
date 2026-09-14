/**
 * Workspace Saved Sender templates.
 *
 * Import copies public fields into a Group sender draft. The Group is unchanged
 * until Save sender. Credentials stay on the server; the client never receives them.
 */
import type { EmailSenderProvider, GroupEmailSender, GroupEmailSenderForm } from "./groupEmailSender.js";
import { buildEmailSenderBody } from "./groupEmailSender.js";

export const SAVED_SENDERS_PICKER = "saved_senders";
export const SAVED_SENDER_NAME_EXISTS = "saved_sender_name_exists";

export type SavedEmailSender = {
  id: number;
  name: string;
  provider: EmailSenderProvider;
  smtp_host: string;
  smtp_port: number | null;
  smtp_security: string;
  smtp_username: string;
  gmail_address: string;
  microsoft_email: string;
  yahoo_email: string;
  from_email: string;
  from_name: string;
  password_configured: boolean;
};

export type SavedSenderImport = {
  importedSavedSenderId: number | null;
  passwordConfigured: boolean;
  form: GroupEmailSenderForm;
};

export function savedSendersFromList(payload?: { results?: SavedEmailSender[] | null } | null): SavedEmailSender[] {
  return Array.isArray(payload?.results) ? payload.results : [];
}

export function savedSenderDisplayAddress(sender?: Partial<SavedEmailSender> | null): string {
  return String(sender?.from_email || sender?.smtp_username || "").trim();
}

export function senderCredentialIsConfigured({
  emailSender,
  provider,
  changePassword = false,
  importedSavedSenderId = null,
  importedPasswordConfigured = false,
}: {
  emailSender?: Pick<GroupEmailSender, "password_configured" | "provider"> | null;
  provider: EmailSenderProvider;
  changePassword?: boolean;
  importedSavedSenderId?: number | null;
  importedPasswordConfigured?: boolean;
}): boolean {
  if (changePassword) return false;
  if (importedSavedSenderId && importedPasswordConfigured) return true;
  return Boolean(emailSender?.password_configured && emailSender.provider === provider);
}

export function applySavedSenderImport(sender?: Partial<SavedEmailSender> | null): SavedSenderImport {
  const provider = (sender?.provider || "custom_smtp") as EmailSenderProvider;
  return {
    importedSavedSenderId: sender?.id ?? null,
    passwordConfigured: Boolean(sender?.password_configured),
    form: {
      provider,
      smtp_host: sender?.smtp_host || "",
      smtp_port: sender?.smtp_port ?? (provider === "custom_smtp" ? 465 : ""),
      smtp_security: (sender?.smtp_security || (provider === "custom_smtp" ? "ssl" : "")) as GroupEmailSenderForm["smtp_security"],
      smtp_username: sender?.smtp_username || "",
      gmail_address: sender?.gmail_address || (provider === "gmail" ? sender?.from_email : "") || "",
      microsoft_email: sender?.microsoft_email || (provider === "microsoft" ? sender?.from_email : "") || "",
      yahoo_email: sender?.yahoo_email || (provider === "yahoo" ? sender?.from_email : "") || "",
      from_email: sender?.from_email || "",
      from_name: sender?.from_name || "",
      smtp_password: "",
      change_password: false,
    },
  };
}

export function attachImportedCredential(
  body: Record<string, string | number | boolean | null>,
  { importedSavedSenderId, smtpPassword, changePassword }: {
    importedSavedSenderId?: number | null;
    smtpPassword?: string;
    changePassword?: boolean;
  },
): Record<string, string | number | boolean | null> {
  if (!importedSavedSenderId || smtpPassword || changePassword) return body;
  const next: Record<string, string | number | boolean | null> = { ...body, saved_sender_id: importedSavedSenderId };
  delete next.smtp_password;
  delete next.change_password;
  return next;
}

export function buildGroupSenderSaveBody(
  form: GroupEmailSenderForm,
  sender: GroupEmailSender,
  importedSavedSenderId?: number | null,
) {
  return attachImportedCredential(buildEmailSenderBody(form, sender), {
    importedSavedSenderId,
    smtpPassword: form.smtp_password,
    changePassword: form.change_password,
  });
}

export function buildSavedSenderCreateBody({
  name,
  senderForm,
  importedSavedSenderId = null,
  sourceGroupId = null,
  emailSender = null,
  replace = false,
}: {
  name: string;
  senderForm: GroupEmailSenderForm;
  importedSavedSenderId?: number | null;
  sourceGroupId?: number | string | null;
  emailSender?: Pick<GroupEmailSender, "password_configured" | "provider"> | null;
  replace?: boolean;
}) {
  const provider = senderForm.provider;
  const body: Record<string, string | number | boolean | null> = provider === "gmail"
    ? { name, replace, provider, gmail_address: senderForm.gmail_address, from_name: senderForm.from_name }
    : provider === "microsoft"
      ? { name, replace, provider, microsoft_email: senderForm.microsoft_email, from_name: senderForm.from_name }
      : provider === "yahoo"
        ? { name, replace, provider, yahoo_email: senderForm.yahoo_email, from_name: senderForm.from_name }
        : {
            name,
            replace,
            provider: "custom_smtp",
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
  if (sourceGroupId && !senderForm.change_password && emailSender?.password_configured && emailSender.provider === provider) {
    body.source_group_id = Number(sourceGroupId);
  }
  return body;
}

export function isSavedSenderNameConflict(error?: { status?: number; data?: { code?: string } } | null): boolean {
  return error?.status === 409 && error?.data?.code === SAVED_SENDER_NAME_EXISTS;
}

/** Deleting a template must leave the current Group sender and draft untouched. */
export function retainGroupDraftAfterTemplateDelete<T>(draft: T): T {
  return draft;
}
