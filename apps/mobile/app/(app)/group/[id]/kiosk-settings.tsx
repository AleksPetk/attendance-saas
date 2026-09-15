import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Alert as NativeAlert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import {
  CONFIRMATION_RETURN_OPTIONS,
  buildKioskSettingsSavePayload,
  canManageGroupConfiguration,
  isKioskSettingsDirty,
  kioskSettingsFormFromApi,
  visibleConfirmationMessageFields,
  type KioskSettingsApi,
  type KioskSettingsForm,
} from "@checkstation/domain";
import { Alert, Button, Field, LoadingState, Screen } from "../../../../src/components/ui";
import { PageHeader, SectionCard, StatusPill } from "../../../../src/components/mobile";
import { useApp } from "../../../../src/lib/AppProvider";
import { useConfigurationAutosave } from "../../../../src/lib/useConfigurationAutosave";
import { colors, space, type } from "../../../../src/theme/tokens";

type GroupSummary = { group_type?: string };

/** Autosave never includes exit-code drafts (exitCodeConfigured forced true). */
function isAutosaveDirty(form: KioskSettingsForm, saved: KioskSettingsForm) {
  return isKioskSettingsDirty(form, saved, {
    changingExitCode: false,
    savedChangingExitCode: false,
    exitCodeConfigured: true,
  });
}

export default function KioskSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { api, authState, t } = useApp();
  const [settings, setSettings] = useState<KioskSettingsApi | null>(null);
  const [form, setForm] = useState<KioskSettingsForm | null>(null);
  const [savedForm, setSavedForm] = useState<KioskSettingsForm | null>(null);
  const [structured, setStructured] = useState(false);
  const [changingExitCode, setChangingExitCode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingExit, setSavingExit] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showSaved, setShowSaved] = useState(false);
  const leavingRef = useRef(false);
  const formRef = useRef(form);
  const settingsRef = useRef(settings);
  const structuredRef = useRef(structured);
  formRef.current = form;
  settingsRef.current = settings;
  structuredRef.current = structured;

  const load = useCallback(async () => {
    setLoading(true); setError(""); setShowSaved(false);
    try {
      const [data, group] = await Promise.all([
        api.get<KioskSettingsApi>(endpoints.kioskSettings(id)),
        api.get<GroupSummary>(endpoints.group(id)),
      ]);
      const isStructured = group.group_type === "structured";
      const next = kioskSettingsFormFromApi(data);
      if (isStructured) next.mode = "card";
      const editingExit = !data.exit_code_configured;
      setSettings(data); setForm(next); setSavedForm(next); setStructured(isStructured);
      setChangingExitCode(editingExit);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { setLoading(false); }
  }, [api, id, t]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const autosaveDirty = useMemo(
    () => Boolean(form && savedForm && isAutosaveDirty(form, savedForm)),
    [form, savedForm],
  );
  const snapshot = useMemo(() => {
    if (!form) return "";
    return JSON.stringify(buildKioskSettingsSavePayload(form, { changingExitCode: false, exitCodeConfigured: true }));
  }, [form]);
  const immediateKey = useMemo(() => {
    if (!form) return "";
    return JSON.stringify({
      mode: form.mode,
      card_show_name: form.card_show_name,
      card_show_participant_code: form.card_show_participant_code,
      card_show_email: form.card_show_email,
      use_pin: form.use_pin,
      input_field_count: form.input_field_count,
      input_second_field: form.input_second_field,
      confirmation_return_seconds: form.confirmation_return_seconds,
      confirmation_sound_enabled: form.confirmation_sound_enabled,
      confirmation_vibration_enabled: form.confirmation_vibration_enabled,
      attendance_reset_mode: form.attendance_reset_mode,
    });
  }, [form]);

  const saveAutosave = useCallback(async () => {
    const currentForm = formRef.current;
    const currentSettings = settingsRef.current;
    if (!currentForm || !currentSettings) return false;
    try {
      const updated = await api.patch<KioskSettingsApi>(
        endpoints.kioskSettings(id),
        buildKioskSettingsSavePayload(currentForm, { changingExitCode: false, exitCodeConfigured: true }),
      );
      const next = kioskSettingsFormFromApi(updated);
      if (structuredRef.current) next.mode = "card";
      setSettings(updated);
      setForm((prev) => (prev ? { ...next, exit_code: prev.exit_code, exit_code_confirm: prev.exit_code_confirm } : next));
      setSavedForm(next);
      setError("");
      setFieldErrors((prev) => {
        const cleared = { ...prev };
        for (const key of Object.keys(cleared)) {
          if (key === "exit_code" || key === "exit_code_confirm") continue;
          delete cleared[key];
        }
        return cleared;
      });
      return true;
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(fieldErrorsFromBody(caught.data));
      setError(caught instanceof Error ? caught.message : t("common.error"));
      return false;
    }
  }, [api, id, t]);

  const autosave = useConfigurationAutosave({
    snapshot,
    dirty: autosaveDirty,
    immediateKey,
    save: saveAutosave,
    eligible: Boolean(form && savedForm && settings && !loading),
  });

  const previousStatus = useRef(autosave.status);
  useEffect(() => {
    const previous = previousStatus.current;
    previousStatus.current = autosave.status;
    if (autosave.status === "saving" || autosave.status === "pending") {
      setShowSaved(false);
      return;
    }
    if (autosave.status === "saved" && (previous === "saving" || previous === "pending")) setShowSaved(true);
    if (autosave.status === "error") setShowSaved(false);
  }, [autosave.status]);

  const needsFlush = autosaveDirty || autosave.status === "pending" || autosave.status === "saving";
  usePreventRemove(needsFlush, ({ data }) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    void autosave.flush().then((saved) => {
      if (saved) navigation.dispatch(data.action);
      leavingRef.current = false;
    });
  });

  if (!canManageGroupConfiguration(authState.session)) return <Redirect href="/(app)/(tabs)/groups" />;
  if (loading) return <Screen><LoadingState label={t("kiosk.settingsLoading")} /></Screen>;
  if (!form || !settings || !savedForm) return <Screen><Alert message={error || t("common.error")} /></Screen>;

  const groupEmailOn = Boolean(settings.group_require_email);
  const groupPinOn = Boolean(settings.group_require_pin);
  const pinForcesCode = form.mode === "card" && form.use_pin;
  const messageFields = visibleConfirmationMessageFields(settings.group_actions);
  const statusLabel = autosave.status === "saving" || autosave.status === "pending"
    ? t("kiosk.savingSettings")
    : showSaved
      ? t("common.saved")
      : "";

  function patch(next: Partial<KioskSettingsForm>) {
    setForm((current) => {
      if (!current) return current;
      const updated = { ...current, ...next };
      if (updated.mode === "card" && updated.use_pin) updated.card_show_participant_code = true;
      return updated;
    });
    setMessage("");
    setShowSaved(false);
  }
  function flushText() {
    void autosave.flush();
  }
  function cancelExitChange() {
    patch({ exit_code: "", exit_code_confirm: "" });
    setChangingExitCode(false);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.exit_code;
      delete next.exit_code_confirm;
      return next;
    });
  }
  async function saveExitCode() {
    const currentSettings = settings;
    if (!currentSettings) return;
    setSavingExit(true); setError(""); setMessage(""); setFieldErrors({});
    try {
      if (!(await autosave.flush())) return;
      const currentForm = formRef.current;
      if (!currentForm) return;
      const updated = await api.patch<KioskSettingsApi>(endpoints.kioskSettings(id), buildKioskSettingsSavePayload(currentForm, {
        changingExitCode: true,
        exitCodeConfigured: Boolean(currentSettings.exit_code_configured),
      }));
      const next = kioskSettingsFormFromApi(updated);
      if (structured) next.mode = "card";
      const stillEditing = !updated.exit_code_configured;
      setSettings(updated); setForm(next); setSavedForm(next);
      setChangingExitCode(stillEditing);
      setMessage(t("kiosk.settingsSaved"));
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(fieldErrorsFromBody(caught.data));
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally { setSavingExit(false); }
  }
  function resetNow() {
    NativeAlert.alert(t("kiosk.resetNow"), t("kiosk.resetNowConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("kiosk.resetNow"), style: "destructive", onPress: async () => {
        setResetting(true); setError("");
        try { await api.post(`${endpoints.kioskSettings(id)}reset-now/`, {}); setMessage(t("kiosk.resetNowDone")); }
        catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); }
        finally { setResetting(false); }
      }},
    ]);
  }

  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <PageHeader title={t("kiosk.settings")} description={settings.group_name} />
    {statusLabel ? <Text accessibilityLiveRegion="polite" style={styles.statusFeedback}>{statusLabel}</Text> : null}
    <Alert message={error} /><Alert message={message} variant="success" />

    <SectionCard title={t("kiosk.kioskType")} description={structured ? t("kiosk.structuredModeHint") : t("kiosk.modeHint")}>
      <OptionPicker label={t("kiosk.mode")} value={form.mode} options={structured ? [{ value: "card", label: t("kiosk.cardMode") }] : [{ value: "card", label: t("kiosk.cardMode") }, { value: "input", label: t("kiosk.inputMode") }]} onChange={(mode) => patch({ mode: mode as "card" | "input" })} />
    </SectionCard>

    <SectionCard title={t("kiosk.exitCode")} description={t("kiosk.exitCodeHint")}>
      {settings.exit_code_configured && !changingExitCode ? <View style={styles.statusRow}><StatusPill label={t("kiosk.exitCodeConfigured")} tone="green" /><Button label={t("kiosk.changeExitCode")} variant="secondary" onPress={() => setChangingExitCode(true)} /></View> : <View style={styles.stack}>
        <Field secureTextEntry autoCapitalize="none" error={fieldErrors.exit_code} label={t("kiosk.newExitCode")} value={form.exit_code} onChangeText={(exit_code) => patch({ exit_code })} />
        <Field secureTextEntry autoCapitalize="none" error={fieldErrors.exit_code_confirm} label={t("kiosk.confirmExitCode")} value={form.exit_code_confirm} onChangeText={(exit_code_confirm) => patch({ exit_code_confirm })} />
        <Button label={t("kiosk.saveExitCode")} loading={savingExit} onPress={() => void saveExitCode()} />
        {settings.exit_code_configured ? <Button label={t("kiosk.cancelExitCodeChange")} variant="secondary" onPress={cancelExitChange} /> : null}
      </View>}
    </SectionCard>

    <SectionCard title={t("kiosk.identification")} description={t("kiosk.identificationHint")}>
      {form.mode === "card" || structured ? <View style={styles.settingsList}>
        <SettingSwitch label={t("kiosk.showName")} value={form.card_show_name} onValueChange={(card_show_name) => patch({ card_show_name })} />
        <SettingSwitch label={t("kiosk.showCode")} hint={pinForcesCode ? t("kiosk.pinRequiresCode") : undefined} disabled={pinForcesCode} value={form.card_show_participant_code} onValueChange={(card_show_participant_code) => patch({ card_show_participant_code })} />
        <SettingSwitch label={t("kiosk.showEmail")} hint={!groupEmailOn ? t("kiosk.emailDisabledHint") : undefined} disabled={!groupEmailOn} value={groupEmailOn && form.card_show_email} onValueChange={(card_show_email) => patch({ card_show_email })} />
        <SettingSwitch label={t("kiosk.usePin")} hint={!groupPinOn ? t("kiosk.pinDisabledHint") : undefined} disabled={!groupPinOn} value={groupPinOn && form.use_pin} onValueChange={(use_pin) => patch({ use_pin })} />
      </View> : <View style={styles.stack}>
        <OptionPicker label={t("kiosk.fields")} value={String(form.input_field_count)} options={[{ value: "1", label: t("kiosk.oneField") }, { value: "2", label: t("kiosk.twoFields") }]} onChange={(value) => patch({ input_field_count: Number(value), input_second_field: Number(value) === 1 ? "" : form.input_second_field || "name" })} />
        {form.input_field_count === 2 ? <OptionPicker label={t("kiosk.secondField")} value={form.input_second_field} options={[{ value: "name", label: t("members.name") }, ...(groupEmailOn ? [{ value: "email", label: t("auth.email") }] : []), ...(groupPinOn ? [{ value: "pin", label: t("kiosk.pin") }] : [])]} onChange={(input_second_field) => patch({ input_second_field })} /> : null}
      </View>}
    </SectionCard>

    <SectionCard title={t("kiosk.confirmation")} description={t("kiosk.confirmationHint")}><View style={styles.stack}>
      <Text style={styles.hint}>{t("kiosk.confirmationVariables")}</Text>
      {messageFields.map((item) => <Field key={item.field} multiline error={fieldErrors[item.field]} label={t(item.labelKey)} value={form[item.field]} placeholder={settings.confirmation_defaults?.[item.action] || ""} onChangeText={(value) => patch({ [item.field]: value } as Partial<KioskSettingsForm>)} onBlur={flushText} />)}
      <OptionPicker label={t("kiosk.returnDelay")} value={String(form.confirmation_return_seconds)} options={CONFIRMATION_RETURN_OPTIONS.map((seconds) => ({ value: String(seconds), label: t(seconds === 1 ? "kiosk.oneSecond" : "kiosk.seconds", { count: seconds }) }))} onChange={(value) => patch({ confirmation_return_seconds: Number(value) })} />
      <View style={styles.settingsListInset}><SettingSwitch label={t("kiosk.sound")} hint={t("kiosk.soundHint")} value={form.confirmation_sound_enabled} onValueChange={(confirmation_sound_enabled) => patch({ confirmation_sound_enabled })} /><SettingSwitch label={t("kiosk.vibration")} hint={t("kiosk.vibrationHint")} value={form.confirmation_vibration_enabled} onValueChange={(confirmation_vibration_enabled) => patch({ confirmation_vibration_enabled })} /></View>
    </View></SectionCard>

    <SectionCard title={t("kiosk.attendanceReset")} description={t("kiosk.attendanceResetHint")}><View style={styles.stack}>
      <OptionPicker label={t("kiosk.resetMode")} value={form.attendance_reset_mode} options={[{ value: "daily", label: t("kiosk.daily") }, { value: "rolling", label: t("kiosk.rolling") }]} onChange={(attendance_reset_mode) => patch({ attendance_reset_mode: attendance_reset_mode as "daily" | "rolling" })} />
      <Text style={styles.hint}>{t(form.attendance_reset_mode === "daily" ? "kiosk.dailyHint" : "kiosk.rollingHint")}</Text>
      {form.attendance_reset_mode === "daily" ? <Field error={fieldErrors.attendance_reset_daily_time} label={t("kiosk.resetTime")} placeholder="HH:MM" value={form.attendance_reset_daily_time} onChangeText={(attendance_reset_daily_time) => patch({ attendance_reset_daily_time })} onBlur={flushText} /> : <View style={styles.durationRow}><Field containerStyle={styles.flex} keyboardType="number-pad" error={fieldErrors.attendance_reset_rolling_hours} label={t("kiosk.rollingHours")} value={String(form.attendance_reset_rolling_hours)} onChangeText={(value) => patch({ attendance_reset_rolling_hours: Number(value) || 0 })} onBlur={flushText} /><Field containerStyle={styles.flex} keyboardType="number-pad" error={fieldErrors.attendance_reset_rolling_minutes} label={t("kiosk.rollingMinutes")} value={String(form.attendance_reset_rolling_minutes)} onChangeText={(value) => patch({ attendance_reset_rolling_minutes: Number(value) || 0 })} onBlur={flushText} /></View>}
      <Button label={t("kiosk.resetNow")} variant="danger" loading={resetting} onPress={resetNow} />
    </View></SectionCard>
  </ScrollView></Screen>;
}

function SettingSwitch({ label, hint, value, onValueChange, disabled = false }: { label: string; hint?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean }) {
  return <View style={[styles.settingRow, disabled && styles.disabled]}><View style={styles.flex}><Text style={styles.settingLabel}>{label}</Text>{hint ? <Text style={styles.hint}>{hint}</Text> : null}</View><Switch disabled={disabled} accessibilityLabel={label} ios_backgroundColor={colors.borderStrong} onValueChange={onValueChange} thumbColor={colors.surface} trackColor={{ false: colors.borderStrong, true: colors.blue }} value={value} /></View>;
}
function OptionPicker({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <View style={styles.stackSmall}><Text style={styles.settingLabel}>{label}</Text><View style={styles.optionRow}>{options.map((option) => <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.option, value === option.value && styles.optionActive]}><Text style={[styles.optionText, value === option.value && styles.optionTextActive]}>{option.label}</Text></Pressable>)}</View></View>;
}

const styles = StyleSheet.create({
  screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  stack: { gap: space.lg }, stackSmall: { gap: space.sm }, flex: { flex: 1 },
  statusFeedback: { ...type.caption, color: colors.textMuted, marginTop: -space.sm },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  settingsList: { marginHorizontal: -space.lg, marginVertical: -space.sm },
  settingsListInset: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: "hidden" },
  settingRow: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  settingLabel: { ...type.body, color: colors.text }, hint: { ...type.caption, color: colors.textMuted }, disabled: { opacity: 0.55 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", padding: 3, borderRadius: 10, backgroundColor: colors.surfaceSubtle },
  option: { flex: 1, minWidth: 70, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 8, paddingHorizontal: space.sm },
  optionActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  optionText: { ...type.captionStrong, color: colors.textMuted, textAlign: "center" }, optionTextActive: { color: colors.bluePressed },
  durationRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
});
