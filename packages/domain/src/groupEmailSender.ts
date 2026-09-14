export const EMAIL_SENDER_PROVIDERS = ["custom_smtp", "gmail", "microsoft", "yahoo"] as const;
export type EmailSenderProvider = typeof EMAIL_SENDER_PROVIDERS[number];
export type SmtpSecurity = "ssl" | "starttls" | "none";

export type GroupEmailSender = {
  configured: boolean;
  provider: EmailSenderProvider;
  status: "not_configured" | "needs_verification" | "ready" | "error";
  status_label?: string;
  password_configured: boolean;
  smtp_host: string;
  smtp_port: number | null;
  smtp_security: SmtpSecurity | "";
  smtp_username: string;
  gmail_address: string;
  microsoft_email: string;
  yahoo_email: string;
  from_email: string;
  from_name: string;
  last_tested_at?: string | null;
  last_test_error?: string;
};

export type GroupEmailSenderForm = {
  provider: EmailSenderProvider;
  smtp_host: string;
  smtp_port: number | string;
  smtp_security: SmtpSecurity | "";
  smtp_username: string;
  gmail_address: string;
  microsoft_email: string;
  yahoo_email: string;
  from_email: string;
  from_name: string;
  smtp_password: string;
  change_password: boolean;
};

export const EMPTY_EMAIL_SENDER: GroupEmailSender = {
  configured: false,
  provider: "custom_smtp",
  status: "not_configured",
  password_configured: false,
  smtp_host: "",
  smtp_port: null,
  smtp_security: "",
  smtp_username: "",
  gmail_address: "",
  microsoft_email: "",
  yahoo_email: "",
  from_email: "",
  from_name: "",
};

export function senderFormFromApi(value?: Partial<GroupEmailSender> | null): GroupEmailSenderForm {
  const sender = { ...EMPTY_EMAIL_SENDER, ...(value || {}) };
  return {
    provider: sender.provider,
    smtp_host: sender.smtp_host || "",
    smtp_port: sender.smtp_port ?? (sender.provider === "custom_smtp" ? 465 : ""),
    smtp_security: sender.smtp_security || (sender.provider === "custom_smtp" ? "ssl" : ""),
    smtp_username: sender.smtp_username || "",
    gmail_address: sender.gmail_address || (sender.provider === "gmail" ? sender.from_email : "") || "",
    microsoft_email: sender.microsoft_email || (sender.provider === "microsoft" ? sender.from_email : "") || "",
    yahoo_email: sender.yahoo_email || (sender.provider === "yahoo" ? sender.from_email : "") || "",
    from_email: sender.from_email || "",
    from_name: sender.from_name || "",
    smtp_password: "",
    change_password: false,
  };
}

export function blankSenderForm(provider: EmailSenderProvider): GroupEmailSenderForm {
  return {
    ...senderFormFromApi(),
    provider,
    smtp_port: provider === "custom_smtp" ? 465 : "",
    smtp_security: provider === "custom_smtp" ? "ssl" : "",
  };
}

export function senderDraftRequiresTest(form: GroupEmailSenderForm, sender: GroupEmailSender): boolean {
  if (form.provider !== sender.provider || form.change_password || Boolean(form.smtp_password)) return true;
  if (form.provider === "gmail") return form.gmail_address !== (sender.gmail_address || sender.from_email || "");
  if (form.provider === "microsoft") return form.microsoft_email !== (sender.microsoft_email || sender.from_email || "");
  if (form.provider === "yahoo") return form.yahoo_email !== (sender.yahoo_email || sender.from_email || "");
  return form.smtp_host !== (sender.smtp_host || "")
    || Number(form.smtp_port) !== Number(sender.smtp_port || 0)
    || form.smtp_security !== (sender.smtp_security || "")
    || form.smtp_username !== (sender.smtp_username || "")
    || form.from_email !== (sender.from_email || "");
}

export function senderFromNameOnlyChange(form: GroupEmailSenderForm, sender: GroupEmailSender): boolean {
  return !senderDraftRequiresTest(form, sender) && form.from_name !== (sender.from_name || "");
}

export function buildEmailSenderBody(form: GroupEmailSenderForm, sender: GroupEmailSender) {
  const body: Record<string, string | number | boolean | null> = form.provider === "gmail"
    ? { provider: "gmail", gmail_address: form.gmail_address, from_name: form.from_name }
    : form.provider === "microsoft"
      ? { provider: "microsoft", microsoft_email: form.microsoft_email, from_name: form.from_name }
      : form.provider === "yahoo"
        ? { provider: "yahoo", yahoo_email: form.yahoo_email, from_name: form.from_name }
        : { provider: "custom_smtp", smtp_host: form.smtp_host, smtp_port: Number(form.smtp_port) || null, smtp_security: form.smtp_security, smtp_username: form.smtp_username, from_email: form.from_email, from_name: form.from_name };
  const providerChanged = form.provider !== sender.provider;
  if (providerChanged || form.change_password || form.smtp_password || !sender.password_configured) {
    body.change_password = true;
    body.smtp_password = form.smtp_password;
  }
  return body;
}

export function normalizeForwardEmailSlots(values?: string[] | null): string[] {
  const slots = (values || []).slice(0, 3).map((value) => String(value || ""));
  return slots.length ? slots : [""];
}

export function savedForwardEmails(values: string[]): string[] {
  return values.slice(0, 3).map((value) => value.trim()).filter(Boolean);
}
