import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError, endpoints } from "@checkstation/api";
import {
  EMAIL_SENDER_PROVIDERS,
  EMPTY_EMAIL_SENDER,
  SAVED_SENDERS_PICKER,
  applySavedSenderImport,
  blankSenderForm,
  buildGroupSenderSaveBody,
  buildSavedSenderCreateBody,
  isSavedSenderNameConflict,
  retainGroupDraftAfterTemplateDelete,
  savedSenderDisplayAddress,
  savedSendersFromList,
  senderCredentialIsConfigured,
  senderDraftRequiresTest,
  senderFormFromApi,
  senderFromNameOnlyChange,
  type EmailSenderProvider,
  type GroupEmailSender as GroupEmailSenderData,
  type GroupEmailSenderForm,
  type SavedEmailSender,
  type SmtpSecurity,
} from "@checkstation/domain";
import { useApp } from "../lib/AppProvider";
import { useFormFactor } from "../lib/formFactor";
import { savedSenderCardColumns, savedSenderCardWidth } from "../lib/savedSenderLayout";
import { colors, space, touch, type } from "../theme/tokens";
import { Alert, Button, Field, LoadingState } from "./ui";
import { SectionCard, StatusPill } from "./mobile";

type ImportedCredential = { id: number | null; configured: boolean };

export function GroupEmailSender({ groupId, onReadyChange }: { groupId: string; onReadyChange?: (ready: boolean) => void }) {
  const { api, t } = useApp();
  const { tablet } = useFormFactor();
  const [sender, setSender] = useState<GroupEmailSenderData>(EMPTY_EMAIL_SENDER);
  const [form, setForm] = useState<GroupEmailSenderForm>(() => blankSenderForm("custom_smtp"));
  const [formBaseline, setFormBaseline] = useState(() => JSON.stringify(blankSenderForm("custom_smtp")));
  const [testEmail, setTestEmail] = useState("");
  const [draftVerified, setDraftVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [senderPanel, setSenderPanel] = useState<"form" | "saved">("form");
  const [savedSenders, setSavedSenders] = useState<SavedEmailSender[]>([]);
  const [savedSendersLoading, setSavedSendersLoading] = useState(false);
  const [importedSavedSenderId, setImportedSavedSenderId] = useState<number | null>(null);
  const [importedPasswordConfigured, setImportedPasswordConfigured] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [pendingReplace, setPendingReplace] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SavedEmailSender | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const formRef = useRef(form);
  formRef.current = form;
  const senderRef = useRef(sender);
  senderRef.current = sender;
  // Session-only drafts: provider changes never replace the persisted sender.
  const providerDrafts = useRef<Partial<Record<EmailSenderProvider, GroupEmailSenderForm>>>({});
  const importedDrafts = useRef<Partial<Record<EmailSenderProvider, ImportedCredential>>>({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const value = { ...EMPTY_EMAIL_SENDER, ...await api.get<GroupEmailSenderData>(endpoints.groupEmailSender(groupId)) };
      const loadedForm = senderFormFromApi(value);
      providerDrafts.current = { [loadedForm.provider]: loadedForm };
      importedDrafts.current = {};
      setImportedSavedSenderId(null);
      setImportedPasswordConfigured(false);
      setSenderPanel("form");
      setSender(value); setForm(loadedForm); setFormBaseline(JSON.stringify(loadedForm)); onReadyChange?.(value.status === "ready");
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { setLoading(false); }
  }, [api, groupId, onReadyChange, t]);
  useEffect(() => { void load(); }, [load]);

  const loadSavedSenders = useCallback(async () => {
    setSavedSendersLoading(true);
    try {
      const payload = await api.get<{ results?: SavedEmailSender[] }>(endpoints.savedEmailSenders());
      setSavedSenders(savedSendersFromList(payload));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally {
      setSavedSendersLoading(false);
    }
  }, [api, t]);

  const needsTest = senderDraftRequiresTest(form, sender) || importedSavedSenderId != null;
  const nameOnly = senderFromNameOnlyChange(form, sender);
  const dirty = JSON.stringify(form) !== formBaseline;
  const draftDirty = dirty || importedSavedSenderId != null;
  const canSave = draftDirty && (draftVerified || (nameOnly && sender.status === "ready")) && (draftVerified || importedSavedSenderId == null);
  const credentialConfigured = senderCredentialIsConfigured({
    emailSender: sender,
    provider: form.provider,
    changePassword: form.change_password,
    importedSavedSenderId,
    importedPasswordConfigured,
  });

  function rememberDraft(provider: EmailSenderProvider, nextForm: GroupEmailSenderForm, imported: ImportedCredential) {
    providerDrafts.current[provider] = nextForm;
    importedDrafts.current[provider] = imported;
  }

  function patch<K extends keyof GroupEmailSenderForm>(key: K, value: GroupEmailSenderForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key !== "from_name") setDraftVerified(false);
    setMessage("");
  }
  function beginPasswordChange() {
    setImportedSavedSenderId(null);
    setImportedPasswordConfigured(false);
    importedDrafts.current[form.provider] = { id: null, configured: false };
    patch("change_password", true);
  }
  function changeProvider(provider: EmailSenderProvider) {
    if (provider === form.provider || saving || testing) return;
    providerDrafts.current[form.provider] = { ...form };
    importedDrafts.current[form.provider] = { id: importedSavedSenderId, configured: importedPasswordConfigured };
    const restored = importedDrafts.current[provider] ?? { id: null, configured: false };
    setImportedSavedSenderId(restored.id);
    setImportedPasswordConfigured(restored.configured);
    setForm(providerDrafts.current[provider] ?? blankSenderForm(provider));
    setDraftVerified(false); setMessage(""); setError("");
  }
  function selectProvider(next: EmailSenderProvider | typeof SAVED_SENDERS_PICKER) {
    if (next === SAVED_SENDERS_PICKER) {
      setSenderPanel("saved");
      void loadSavedSenders();
      return;
    }
    setSenderPanel("form");
    changeProvider(next);
  }
  function importSavedSender(template: SavedEmailSender) {
    const imported = applySavedSenderImport(template);
    rememberDraft(imported.form.provider, imported.form, {
      id: imported.importedSavedSenderId,
      configured: imported.passwordConfigured,
    });
    setForm(imported.form);
    setImportedSavedSenderId(imported.importedSavedSenderId);
    setImportedPasswordConfigured(imported.passwordConfigured);
    setSenderPanel("form");
    setDraftVerified(false);
    setMessage("");
    setError("");
  }
  function senderBody() {
    return buildGroupSenderSaveBody(form, sender, importedSavedSenderId);
  }
  async function testSender() {
    if (!testEmail.trim() || testing || saving) return;
    const testedSnapshot = JSON.stringify(form);
    setTesting(true); setError(""); setMessage("");
    try {
      const result = await api.post<{ detail?: string; draft_verified?: boolean; email_sender?: GroupEmailSenderData }>(
        endpoints.groupEmailSenderTest(groupId),
        { to_email: testEmail.trim(), ...senderBody() },
      );
      if (result.email_sender) setSender((current) => ({ ...current, ...result.email_sender }));
      setDraftVerified(JSON.stringify(formRef.current) === testedSnapshot && Boolean(result.draft_verified));
      setMessage(result.detail || t("groups.senderTestSent"));
    } catch (caught) { setDraftVerified(false); setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { setTesting(false); }
  }
  async function save(): Promise<boolean> {
    if (saving) return false;
    if (!draftDirty) return true;
    if (!canSave || testing || loading) {
      setError(`${t("groups.senderDraft")}: ${t("groups.sendTest")}`);
      return false;
    }
    const savedSnapshot = JSON.stringify(form);
    setSaving(true); setError(""); setMessage("");
    try {
      const value = { ...EMPTY_EMAIL_SENDER, ...await api.put<GroupEmailSenderData>(endpoints.groupEmailSender(groupId), senderBody()) };
      const savedForm = senderFormFromApi(value);
      setSender(value);
      setFormBaseline(JSON.stringify(savedForm));
      setImportedSavedSenderId(null);
      setImportedPasswordConfigured(false);
      importedDrafts.current = { [savedForm.provider]: { id: null, configured: false } };
      providerDrafts.current = { [savedForm.provider]: savedForm };
      if (JSON.stringify(formRef.current) === savedSnapshot) { setForm(savedForm); setDraftVerified(false); }
      onReadyChange?.(value.status === "ready");
      setMessage(t("groups.senderSaved"));
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); return false; }
    finally { setSaving(false); }
  }

  async function submitSavedSender(name: string, replace = false) {
    setSavingTemplate(true);
    setError("");
    try {
      await api.post(endpoints.savedEmailSenders(), buildSavedSenderCreateBody({
        name,
        senderForm: form,
        importedSavedSenderId,
        sourceGroupId: groupId,
        emailSender: sender,
        replace,
      }));
      setSaveTemplateOpen(false);
      setPendingReplace("");
      setTemplateName("");
      setMessage(t("groups.savedSenderSaved"));
      if (senderPanel === "saved") await loadSavedSenders();
    } catch (caught) {
      if (!replace && isSavedSenderNameConflict(caught instanceof ApiError ? caught : null)) {
        setSaveTemplateOpen(false);
        setPendingReplace(name);
        return;
      }
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally {
      setSavingTemplate(false);
    }
  }

  async function confirmDeleteSavedSender() {
    if (!pendingDelete) return;
    setDeletingTemplate(true);
    setError("");
    try {
      await api.delete(endpoints.savedEmailSender(pendingDelete.id));
      retainGroupDraftAfterTemplateDelete({ sender: senderRef.current, form: formRef.current });
      setPendingDelete(null);
      await loadSavedSenders();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally {
      setDeletingTemplate(false);
    }
  }

  const providerLabel = (provider: EmailSenderProvider) => t(
    provider === "custom_smtp" ? "groups.providerCustomSmtp" : provider === "gmail" ? "groups.providerGmail" : provider === "microsoft" ? "groups.providerMicrosoft" : "groups.providerYahoo",
  );
  const statusKey = draftVerified ? "groups.senderVerified" : needsTest ? "groups.senderDraft" : sender.status === "ready" ? "groups.senderReady" : sender.status === "error" ? "groups.senderError" : "groups.senderNotConfigured";
  const savedPanel = senderPanel === "saved";
  const columns = savedSenderCardColumns(tablet);

  return <SectionCard title={t("groups.emailSender")} description={t("groups.advancedEmailHint")}>
    {loading ? <LoadingState label={t("groups.senderLoading")} /> : <View style={styles.stack}>
      <View style={styles.statusRow}><Text style={styles.label}>{t("groups.senderStatus")}</Text><StatusPill label={t(statusKey)} tone={draftVerified || (!needsTest && sender.status === "ready") ? "green" : "warning"} /></View>
      <View style={styles.optionRow}>
        {EMAIL_SENDER_PROVIDERS.map((provider) => <Pressable key={provider} onPress={() => selectProvider(provider)} style={[styles.option, !savedPanel && form.provider === provider && styles.optionActive]}><Text style={[styles.optionText, !savedPanel && form.provider === provider && styles.optionTextActive]}>{providerLabel(provider)}</Text></Pressable>)}
        <Pressable onPress={() => selectProvider(SAVED_SENDERS_PICKER)} style={[styles.option, savedPanel && styles.optionActive]}><Text style={[styles.optionText, savedPanel && styles.optionTextActive]}>{t("groups.savedSendersOption")}</Text></Pressable>
      </View>
      {savedPanel ? (
        <View style={[styles.savedList, columns === 2 && styles.savedListWide]}>
          {savedSendersLoading ? <Text style={styles.hint}>{t("groups.savedSendersLoading")}</Text> : savedSenders.length === 0 ? <Text style={styles.hint}>{t("groups.noSavedSenders")}</Text> : savedSenders.map((item) => {
            const address = savedSenderDisplayAddress(item);
            return <View key={item.id} style={[styles.savedCard, { width: savedSenderCardWidth(tablet) }]}>
              <Text style={styles.savedName}>{item.name}</Text>
              <Text style={styles.savedMeta}>{providerLabel(item.provider)}</Text>
              {address ? <Text style={styles.savedMeta}>{address}</Text> : null}
              <View style={styles.savedActions}>
                <View style={styles.flex}><Button label={t("groups.importSavedSender")} variant="secondary" onPress={() => importSavedSender(item)} /></View>
                <View style={styles.flex}><Button label={t("groups.deleteSavedSenderConfirm")} variant="danger" onPress={() => setPendingDelete(item)} /></View>
              </View>
            </View>;
          })}
        </View>
      ) : <>
        <Text style={styles.hint}>{t(form.provider === "gmail" ? "groups.gmailHint" : form.provider === "microsoft" ? "groups.microsoftHint" : form.provider === "yahoo" ? "groups.yahooHint" : "groups.customSmtpHint")}</Text>
        {form.provider === "custom_smtp" ? <>
          <Field label={t("groups.smtpHost")} value={form.smtp_host} onChangeText={(value) => patch("smtp_host", value)} />
          <View style={styles.two}><Field containerStyle={styles.flex} keyboardType="number-pad" label={t("groups.smtpPort")} value={String(form.smtp_port)} onChangeText={(value) => patch("smtp_port", value)} /><Choice value={form.smtp_security} options={["ssl", "starttls", "none"]} label={t("groups.smtpSecurity")} onChange={(value) => patch("smtp_security", value as SmtpSecurity)} t={t} /></View>
          <Field label={t("groups.smtpUsername")} value={form.smtp_username} onChangeText={(value) => patch("smtp_username", value)} />
          <Field label={t("groups.fromEmail")} keyboardType="email-address" autoCapitalize="none" value={form.from_email} onChangeText={(value) => patch("from_email", value)} />
        </> : <Field autoCapitalize="none" keyboardType="email-address" label={t(form.provider === "gmail" ? "groups.gmailAddress" : form.provider === "microsoft" ? "groups.microsoftEmail" : "groups.yahooEmail")} value={form.provider === "gmail" ? form.gmail_address : form.provider === "microsoft" ? form.microsoft_email : form.yahoo_email} onChangeText={(value) => patch(form.provider === "gmail" ? "gmail_address" : form.provider === "microsoft" ? "microsoft_email" : "yahoo_email", value)} />}
        {credentialConfigured ? <View style={styles.configuredRow}><Text style={styles.hint}>{t("groups.passwordConfigured")}</Text><Button label={t("groups.changePassword")} variant="secondary" onPress={beginPasswordChange} /></View> : <Field secureTextEntry label={t(form.provider === "microsoft" || form.provider === "custom_smtp" ? "groups.smtpPassword" : "groups.appPassword")} value={form.smtp_password} onChangeText={(value) => patch("smtp_password", value)} />}
        <Field label={t("groups.fromName")} value={form.from_name} onChangeText={(value) => patch("from_name", value)} />
        <Field autoCapitalize="none" keyboardType="email-address" label={t("groups.testRecipient")} value={testEmail} onChangeText={setTestEmail} />
        <Button label={t("groups.sendTest")} variant="secondary" disabled={!testEmail.trim() || saving} loading={testing} onPress={() => void testSender()} />
        <View style={tablet ? styles.two : styles.stack}>
          <View style={styles.flex}><Button label={t("groups.saveSender")} disabled={!canSave || testing || loading} loading={saving} onPress={() => void save()} /></View>
          <View style={styles.flex}><Button label={t("groups.saveAsSavedSender")} variant="secondary" disabled={savingTemplate} onPress={() => { setTemplateName(form.from_name || ""); setSaveTemplateOpen(true); }} /></View>
        </View>
      </>}
      <Alert message={error} /><Alert message={message} variant="info" />
    </View>}
    {saveTemplateOpen ? <Sheet title={t("groups.saveSavedSenderTitle")} body={t("groups.saveSavedSenderBody")} onClose={() => { if (!savingTemplate) setSaveTemplateOpen(false); }}>
      <Field label={t("groups.savedSenderName")} value={templateName} onChangeText={setTemplateName} maxLength={80} autoFocus />
      <View style={styles.sheetActions}>
        <View style={styles.flex}><Button label={t("common.cancel")} variant="secondary" disabled={savingTemplate} onPress={() => setSaveTemplateOpen(false)} /></View>
        <View style={styles.flex}><Button label={t("common.save")} disabled={!templateName.trim()} loading={savingTemplate} onPress={() => void submitSavedSender(templateName.trim(), false)} /></View>
      </View>
    </Sheet> : null}
    {pendingReplace ? <Sheet title={t("groups.replaceSavedSenderTitle")} body={t("groups.replaceSavedSenderBody", { name: pendingReplace })} onClose={() => { if (!savingTemplate) setPendingReplace(""); }}>
      <View style={styles.sheetActions}>
        <View style={styles.flex}><Button label={t("common.cancel")} variant="secondary" disabled={savingTemplate} onPress={() => setPendingReplace("")} /></View>
        <View style={styles.flex}><Button label={t("groups.replaceSavedSenderConfirm")} loading={savingTemplate} onPress={() => void submitSavedSender(pendingReplace, true)} /></View>
      </View>
    </Sheet> : null}
    {pendingDelete ? <Sheet title={t("groups.deleteSavedSenderTitle")} body={t("groups.deleteSavedSenderBody", { name: pendingDelete.name })} onClose={() => { if (!deletingTemplate) setPendingDelete(null); }}>
      <View style={styles.sheetActions}>
        <View style={styles.flex}><Button label={t("common.cancel")} variant="secondary" disabled={deletingTemplate} onPress={() => setPendingDelete(null)} /></View>
        <View style={styles.flex}><Button label={t("groups.deleteSavedSenderConfirm")} variant="danger" loading={deletingTemplate} onPress={() => void confirmDeleteSavedSender()} /></View>
      </View>
    </Sheet> : null}
  </SectionCard>;
}

function Choice({ label, value, options, onChange, t }: { label: string; value: string; options: string[]; onChange: (value: string) => void; t: (key: string) => string }) {
  return <View style={styles.flex}><Text style={styles.label}>{label}</Text><View style={styles.optionRow}>{options.map((option) => <Pressable key={option} onPress={() => onChange(option)} style={[styles.option, value === option && styles.optionActive]}><Text style={[styles.optionText, value === option && styles.optionTextActive]}>{t(option === "ssl" ? "groups.smtpSecuritySsl" : option === "starttls" ? "groups.smtpSecurityStarttls" : "groups.smtpSecurityNone")}</Text></Pressable>)}</View></View>;
}

function Sheet({ title, body, onClose, children }: { title: string; body: string; onClose: () => void; children: ReactNode }) {
  return <Modal animationType="slide" transparent visible onRequestClose={onClose}>
    <View style={styles.sheetHost}>
      <Pressable accessibilityRole="button" style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.hint}>{body}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  label: { ...type.label, color: colors.textSecondary },
  hint: { ...type.caption, color: colors.textMuted },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  option: { minHeight: touch.min, justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: space.sm },
  optionActive: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  optionText: { ...type.captionStrong, color: colors.textMuted },
  optionTextActive: { color: colors.bluePressed },
  two: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  flex: { flex: 1 },
  configuredRow: { gap: space.sm },
  savedList: { gap: space.sm },
  savedListWide: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  savedCard: { gap: space.xs, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, padding: space.md },
  savedName: { ...type.bodyStrong, color: colors.text },
  savedMeta: { ...type.caption, color: colors.textSecondary },
  savedActions: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
  sheetHost: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(7, 20, 38, 0.4)" },
  sheet: { gap: space.md, backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: space.lg, paddingBottom: space.xl },
  sheetTitle: { ...type.headline, color: colors.text },
  sheetActions: { flexDirection: "row", gap: space.sm },
});
