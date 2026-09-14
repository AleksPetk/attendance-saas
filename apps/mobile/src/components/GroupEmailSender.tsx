import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { endpoints } from "@checkstation/api";
import {
  EMAIL_SENDER_PROVIDERS,
  EMPTY_EMAIL_SENDER,
  blankSenderForm,
  buildEmailSenderBody,
  senderDraftRequiresTest,
  senderFormFromApi,
  senderFromNameOnlyChange,
  type EmailSenderProvider,
  type GroupEmailSender as GroupEmailSenderData,
  type GroupEmailSenderForm,
  type SmtpSecurity,
} from "@checkstation/domain";
import { useApp } from "../lib/AppProvider";
import { colors, space, type } from "../theme/tokens";
import { Alert, Button, Field, LoadingState } from "./ui";
import { SectionCard, StatusPill } from "./mobile";

export function GroupEmailSender({ groupId, onReadyChange, onDirtyChange }: { groupId: string; onReadyChange?: (ready: boolean) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const { api, t } = useApp();
  const [sender, setSender] = useState<GroupEmailSenderData>(EMPTY_EMAIL_SENDER);
  const [form, setForm] = useState<GroupEmailSenderForm>(() => blankSenderForm("custom_smtp"));
  const [testEmail, setTestEmail] = useState("");
  const [draftVerified, setDraftVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const value = { ...EMPTY_EMAIL_SENDER, ...await api.get<GroupEmailSenderData>(endpoints.groupEmailSender(groupId)) };
      setSender(value); setForm(senderFormFromApi(value)); onReadyChange?.(value.status === "ready");
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { setLoading(false); }
  }, [api, groupId, onReadyChange, t]);
  useEffect(() => { void load(); }, [load]);

  const needsTest = senderDraftRequiresTest(form, sender);
  const nameOnly = senderFromNameOnlyChange(form, sender);
  const dirty = needsTest || nameOnly;
  const canSave = dirty && (draftVerified || (nameOnly && sender.status === "ready"));
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);

  function patch<K extends keyof GroupEmailSenderForm>(key: K, value: GroupEmailSenderForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key !== "from_name") setDraftVerified(false);
    setMessage("");
  }
  function changeProvider(provider: EmailSenderProvider) {
    setForm(blankSenderForm(provider)); setDraftVerified(false); setMessage(""); setError("");
  }
  async function testSender() {
    if (!testEmail.trim()) return;
    setTesting(true); setError(""); setMessage("");
    try {
      const result = await api.post<{ detail?: string; draft_verified?: boolean; email_sender?: GroupEmailSenderData }>(
        endpoints.groupEmailSenderTest(groupId),
        { to_email: testEmail.trim(), ...buildEmailSenderBody(form, sender) },
      );
      if (result.email_sender) setSender((current) => ({ ...current, ...result.email_sender }));
      setDraftVerified(Boolean(result.draft_verified));
      setMessage(result.detail || t("groups.senderTestSent"));
    } catch (caught) { setDraftVerified(false); setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { setTesting(false); }
  }
  async function save() {
    if (!canSave) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const value = { ...EMPTY_EMAIL_SENDER, ...await api.put<GroupEmailSenderData>(endpoints.groupEmailSender(groupId), buildEmailSenderBody(form, sender)) };
      setSender(value); setForm(senderFormFromApi(value)); setDraftVerified(false); setMessage(t("groups.senderSaved"));
      onReadyChange?.(value.status === "ready");
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { setSaving(false); }
  }

  const providerLabel = (provider: EmailSenderProvider) => t(
    provider === "custom_smtp" ? "groups.providerCustomSmtp" : provider === "gmail" ? "groups.providerGmail" : provider === "microsoft" ? "groups.providerMicrosoft" : "groups.providerYahoo",
  );
  const statusKey = draftVerified ? "groups.senderVerified" : needsTest ? "groups.senderDraft" : sender.status === "ready" ? "groups.senderReady" : sender.status === "error" ? "groups.senderError" : "groups.senderNotConfigured";

  return <SectionCard title={t("groups.emailSender")} description={t("groups.advancedEmailHint")}>
    {loading ? <LoadingState label={t("groups.senderLoading")} /> : <View style={styles.stack}>
      <View style={styles.statusRow}><Text style={styles.label}>{t("groups.senderStatus")}</Text><StatusPill label={t(statusKey)} tone={draftVerified || sender.status === "ready" ? "green" : "warning"} /></View>
      <View style={styles.optionRow}>{EMAIL_SENDER_PROVIDERS.map((provider) => <Pressable key={provider} onPress={() => changeProvider(provider)} style={[styles.option, form.provider === provider && styles.optionActive]}><Text style={[styles.optionText, form.provider === provider && styles.optionTextActive]}>{providerLabel(provider)}</Text></Pressable>)}</View>
      <Text style={styles.hint}>{t(form.provider === "gmail" ? "groups.gmailHint" : form.provider === "microsoft" ? "groups.microsoftHint" : form.provider === "yahoo" ? "groups.yahooHint" : "groups.customSmtpHint")}</Text>
      {form.provider === "custom_smtp" ? <>
        <Field label={t("groups.smtpHost")} value={form.smtp_host} onChangeText={(value) => patch("smtp_host", value)} />
        <View style={styles.two}><Field containerStyle={styles.flex} keyboardType="number-pad" label={t("groups.smtpPort")} value={String(form.smtp_port)} onChangeText={(value) => patch("smtp_port", value)} /><Choice value={form.smtp_security} options={["ssl", "starttls", "none"]} label={t("groups.smtpSecurity")} onChange={(value) => patch("smtp_security", value as SmtpSecurity)} t={t} /></View>
        <Field label={t("groups.smtpUsername")} value={form.smtp_username} onChangeText={(value) => patch("smtp_username", value)} />
        <Field label={t("groups.fromEmail")} keyboardType="email-address" autoCapitalize="none" value={form.from_email} onChangeText={(value) => patch("from_email", value)} />
      </> : <Field autoCapitalize="none" keyboardType="email-address" label={t(form.provider === "gmail" ? "groups.gmailAddress" : form.provider === "microsoft" ? "groups.microsoftEmail" : "groups.yahooEmail")} value={form.provider === "gmail" ? form.gmail_address : form.provider === "microsoft" ? form.microsoft_email : form.yahoo_email} onChangeText={(value) => patch(form.provider === "gmail" ? "gmail_address" : form.provider === "microsoft" ? "microsoft_email" : "yahoo_email", value)} />}
      {sender.password_configured && sender.provider === form.provider && !form.change_password ? <Button label={t("groups.changePassword")} variant="secondary" onPress={() => patch("change_password", true)} /> : <Field secureTextEntry label={t(form.provider === "microsoft" || form.provider === "custom_smtp" ? "groups.smtpPassword" : "groups.appPassword")} value={form.smtp_password} onChangeText={(value) => patch("smtp_password", value)} />}
      <Field label={t("groups.fromName")} value={form.from_name} onChangeText={(value) => patch("from_name", value)} />
      <Field autoCapitalize="none" keyboardType="email-address" label={t("groups.testRecipient")} value={testEmail} onChangeText={setTestEmail} />
      <Button label={t("groups.sendTest")} variant="secondary" disabled={!testEmail.trim()} loading={testing} onPress={() => void testSender()} />
      <Alert message={error} /><Alert message={message} variant="info" />
      <Button label={t("groups.saveSender")} disabled={!canSave} loading={saving} onPress={() => void save()} />
    </View>}
  </SectionCard>;
}

function Choice({ label, value, options, onChange, t }: { label: string; value: string; options: string[]; onChange: (value: string) => void; t: (key: string) => string }) {
  return <View style={styles.flex}><Text style={styles.label}>{label}</Text><View style={styles.optionRow}>{options.map((option) => <Pressable key={option} onPress={() => onChange(option)} style={[styles.option, value === option && styles.optionActive]}><Text style={[styles.optionText, value === option && styles.optionTextActive]}>{t(option === "ssl" ? "groups.smtpSecuritySsl" : option === "starttls" ? "groups.smtpSecurityStarttls" : "groups.smtpSecurityNone")}</Text></Pressable>)}</View></View>;
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  label: { ...type.label, color: colors.textSecondary },
  hint: { ...type.caption, color: colors.textMuted },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  option: { minHeight: 38, justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: space.sm },
  optionActive: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  optionText: { ...type.captionStrong, color: colors.textMuted },
  optionTextActive: { color: colors.bluePressed },
  two: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  flex: { flex: 1 },
});
