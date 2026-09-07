import { useCallback, useState } from "react";
import { Redirect, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Alert as NativeAlert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { canManageGroupConfiguration } from "@checkstation/domain";
import { Alert, Button, Field, LoadingState, Screen } from "../../../../src/components/ui";
import { PageHeader, SectionCard, StatusPill } from "../../../../src/components/mobile";
import { useApp } from "../../../../src/lib/AppProvider";
import { colors, space, type } from "../../../../src/theme/tokens";

type KioskSettingsData = {
  group_name?: string;
  mode: string;
  card_show_name: boolean;
  card_show_participant_code: boolean;
  card_show_email: boolean;
  use_pin: boolean;
  input_field_count: number;
  input_second_field: string;
  exit_code_configured: boolean;
  confirmation_template: string;
  confirmation_check_in_message: string;
  confirmation_check_out_message: string;
  confirmation_break_start_message: string;
  confirmation_break_end_message: string;
  confirmation_return_seconds: number;
  confirmation_sound_enabled: boolean;
  confirmation_vibration_enabled: boolean;
  attendance_reset_mode: string;
  attendance_reset_daily_time: string;
  attendance_reset_rolling_hours: number;
  attendance_reset_rolling_minutes: number;
  readiness?: { ready?: boolean; setup_complete?: boolean; issues?: string[] };
  group_require_email?: boolean;
  group_require_pin?: boolean;
  group_actions?: { check_in_enabled: boolean; check_out_enabled: boolean; breaks_enabled: boolean };
  updated_at?: string;
};

export default function KioskSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, authState, t } = useApp();
  const [settings, setSettings] = useState<KioskSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [mode, setMode] = useState("card");
  const [usePin, setUsePin] = useState(false);
  const [exitCode, setExitCode] = useState("");
  const [exitCodeConfirm, setExitCodeConfirm] = useState("");
  const [inputFieldCount, setInputFieldCount] = useState(1);
  const [inputSecondField, setInputSecondField] = useState("");
  const [cardShowName, setCardShowName] = useState(true);
  const [cardShowCode, setCardShowCode] = useState(true);
  const [cardShowEmail, setCardShowEmail] = useState(false);
  const [confirmationTemplate, setConfirmationTemplate] = useState("clean");
  const [confirmationReturnSeconds, setConfirmationReturnSeconds] = useState(3);
  const [confirmationSound, setConfirmationSound] = useState(true);
  const [confirmationVibration, setConfirmationVibration] = useState(false);
  const [resetMode, setResetMode] = useState("daily");
  const [resetDailyTime, setResetDailyTime] = useState("00:00");
  const [resetRollingHours, setResetRollingHours] = useState(8);
  const [resetRollingMinutes, setResetRollingMinutes] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await api.get<KioskSettingsData>(endpoints.kioskSettings(id));
      setSettings(data);
      setMode(data.mode || "card");
      setUsePin(data.use_pin || false);
      setInputFieldCount(data.input_field_count || 1);
      setInputSecondField(data.input_second_field || "");
      setCardShowName(data.card_show_name ?? true);
      setCardShowCode(data.card_show_participant_code ?? true);
      setCardShowEmail(data.card_show_email ?? false);
      setConfirmationTemplate(data.confirmation_template || "clean");
      setConfirmationReturnSeconds(data.confirmation_return_seconds || 3);
      setConfirmationSound(data.confirmation_sound_enabled ?? true);
      setConfirmationVibration(data.confirmation_vibration_enabled ?? false);
      setResetMode(data.attendance_reset_mode || "daily");
      setResetDailyTime(data.attendance_reset_daily_time || "00:00");
      setResetRollingHours(data.attendance_reset_rolling_hours || 8);
      setResetRollingMinutes(data.attendance_reset_rolling_minutes || 0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally { setLoading(false); }
  }, [api, id, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!canManageGroupConfiguration(authState.session)) return <Redirect href="/(app)/(tabs)/groups" />;
  if (loading) return <Screen><LoadingState label={t("kiosk.settingsLoading")} /></Screen>;

  async function save() {
    setSaving(true); setError(""); setFieldErrors({});
    try {
      const payload: Record<string, unknown> = {
        mode,
        use_pin: usePin,
        input_field_count: inputFieldCount,
        input_second_field: inputSecondField,
        card_show_name: cardShowName,
        card_show_participant_code: cardShowCode,
        card_show_email: cardShowEmail,
        confirmation_template: confirmationTemplate,
        confirmation_return_seconds: confirmationReturnSeconds,
        confirmation_sound_enabled: confirmationSound,
        confirmation_vibration_enabled: confirmationVibration,
        attendance_reset_mode: resetMode,
        attendance_reset_daily_time: resetDailyTime,
        attendance_reset_rolling_hours: resetRollingHours,
        attendance_reset_rolling_minutes: resetRollingMinutes,
      };
      if (exitCode.trim()) {
        payload.exit_code = exitCode.trim();
        payload.exit_code_confirm = exitCodeConfirm.trim();
      }
      await api.patch(endpoints.kioskSettings(id), payload);
      NativeAlert.alert(t("common.saved") || "Saved", t("kiosk.settingsSaved") || "Kiosk settings updated.");
      setExitCode("");
      setExitCodeConfirm("");
      void load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = fieldErrorsFromBody(caught.data);
        setFieldErrors(fields);
        if (fields.non_field_errors) setError(fields.non_field_errors);
        else if (!Object.values(fields).some(Boolean)) setError(caught.message);
      } else setError(t("common.error"));
    } finally { setSaving(false); }
  }

  async function resetNow() {
    NativeAlert.alert(
      t("kiosk.resetNow") || "Reset now",
      t("kiosk.resetNowConfirm") || "Start a fresh attendance cycle now?",
      [
        { text: t("common.cancel") || "Cancel", style: "cancel" },
        { text: t("kiosk.resetNow") || "Reset", style: "destructive", onPress: async () => {
          try {
            await api.post(`${endpoints.kioskSettings(id)}reset-now/`, {});
            NativeAlert.alert(t("common.done") || "Done", t("kiosk.resetNowDone") || "Attendance cycle reset.");
            void load();
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : t("common.error"));
          }
        }},
      ],
    );
  }

  const reset = resetMode === "rolling"
    ? t("kiosk.rollingReset", { hours: resetRollingHours, minutes: resetRollingMinutes })
    : t("kiosk.dailyReset", { time: resetDailyTime || "—" });

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader title={t("kiosk.settings")} description={settings?.group_name} />
        <Alert message={error} />

        {settings ? (
          <>
            <SectionCard title={t("kiosk.kioskType")} description={t("kiosk.modeHint")}>
              <OptionPicker
                label={t("kiosk.mode")}
                onChange={setMode}
                options={[{ value: "card", label: t("kiosk.cardMode") }, { value: "input", label: t("kiosk.inputMode") }]}
                value={mode}
              />
            </SectionCard>

            <SectionCard title={t("kiosk.identification")} description={t("kiosk.identificationHint")}>
              {mode === "card" ? (
                <View style={styles.settingsList}>
                  <SettingSwitch label={t("kiosk.showName")} value={cardShowName} onValueChange={setCardShowName} />
                  <SettingSwitch label={t("kiosk.showCode")} value={cardShowCode} onValueChange={setCardShowCode} />
                  <SettingSwitch label={t("kiosk.showEmail")} value={cardShowEmail} onValueChange={setCardShowEmail} />
                  <SettingSwitch label={t("kiosk.usePin")} value={usePin} onValueChange={setUsePin} />
                </View>
              ) : (
                <View style={styles.settingStack}>
                  <OptionPicker
                    label={t("kiosk.fields")}
                    onChange={(value) => { const count = Number(value); setInputFieldCount(count); if (count === 1) setInputSecondField(""); }}
                    options={[{ value: "1", label: "1" }, { value: "2", label: "2" }]}
                    value={String(inputFieldCount)}
                  />
                  {inputFieldCount === 2 ? (
                    <OptionPicker
                      label={t("kiosk.secondField")}
                      onChange={setInputSecondField}
                      options={[{ value: "name", label: t("members.name") }, { value: "email", label: t("auth.email") }, { value: "pin", label: t("kiosk.pin") }]}
                      value={inputSecondField}
                    />
                  ) : null}
                </View>
              )}
            </SectionCard>

            <SectionCard title={t("kiosk.exitCode")} description={t("kiosk.exitCodeHint")}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t("kiosk.exitCodeStatus")}</Text>
                <StatusPill label={settings.exit_code_configured ? t("kiosk.configured") : t("kiosk.notConfigured")} tone={settings.exit_code_configured ? "green" : "warning"} />
              </View>
              <View style={styles.exitFields}>
                <Field
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={fieldErrors.exit_code}
                  hint={settings.exit_code_configured ? t("kiosk.newExitCodeConfiguredHint") : t("kiosk.newExitCodeHint")}
                  label={t("kiosk.newExitCode")}
                  onChangeText={setExitCode}
                  placeholder={t("kiosk.exitCodePlaceholder")}
                  secureTextEntry
                  value={exitCode}
                />
                <Field
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={fieldErrors.exit_code_confirm}
                  label={t("kiosk.confirmExitCode")}
                  onChangeText={setExitCodeConfirm}
                  placeholder={t("kiosk.confirmExitCodePlaceholder")}
                  secureTextEntry
                  value={exitCodeConfirm}
                />
              </View>
            </SectionCard>

            <SectionCard title={t("kiosk.confirmation")} description={t("kiosk.confirmationHint")}>
              <View style={styles.settingStack}>
                <OptionPicker
                  label={t("kiosk.template")}
                  onChange={setConfirmationTemplate}
                  options={[
                    "clean", "business", "friendly", "kids", "fitness", "event", "celebration", "minimal",
                  ].map((value) => ({ value, label: t(`kiosk.template.${value}`) }))}
                  value={confirmationTemplate}
                  wrap
                />
                <OptionPicker
                  label={t("kiosk.returnDelay")}
                  onChange={(value) => setConfirmationReturnSeconds(Number(value))}
                  options={[1, 3, 5].map((seconds) => ({ value: String(seconds), label: t("kiosk.seconds", { count: seconds }) }))}
                  value={String(confirmationReturnSeconds)}
                />
                <View style={styles.settingsListInset}>
                  <SettingSwitch label={t("kiosk.sound")} hint={t("kiosk.soundHint")} value={confirmationSound} onValueChange={setConfirmationSound} />
                  <SettingSwitch label={t("kiosk.vibration")} hint={t("kiosk.vibrationHint")} value={confirmationVibration} onValueChange={setConfirmationVibration} />
                </View>
              </View>
            </SectionCard>

            <SectionCard title={t("kiosk.attendanceReset")} description={t("kiosk.attendanceResetHint")}>
              <View style={styles.settingStack}>
                <OptionPicker
                  label={t("kiosk.resetMode")}
                  onChange={setResetMode}
                  options={[{ value: "daily", label: t("kiosk.daily") }, { value: "rolling", label: t("kiosk.rolling") }]}
                  value={resetMode}
                />
                <Text style={styles.modeExplanation}>{resetMode === "daily" ? t("kiosk.dailyHint") : t("kiosk.rollingHint")}</Text>
              {resetMode === "daily" ? (
                  <Field error={fieldErrors.attendance_reset_daily_time} label={t("kiosk.resetTime")} value={resetDailyTime} onChangeText={setResetDailyTime} placeholder="HH:MM" />
              ) : (
                  <View style={styles.durationRow}>
                    <Field containerStyle={styles.durationField} error={fieldErrors.attendance_reset_rolling_hours} keyboardType="number-pad" label={t("kiosk.rollingHours")} value={String(resetRollingHours)} onChangeText={(v) => setResetRollingHours(Number(v) || 0)} />
                    <Field containerStyle={styles.durationField} error={fieldErrors.attendance_reset_rolling_minutes} keyboardType="number-pad" label={t("kiosk.rollingMinutes")} value={String(resetRollingMinutes)} onChangeText={(v) => setResetRollingMinutes(Number(v) || 0)} />
                  </View>
              )}
                <View style={styles.currentResetCard}>
                  <Text style={styles.currentResetLabel}>{t("kiosk.currentReset")}</Text>
                  <Text style={styles.currentResetValue}>{reset}</Text>
                </View>
                <View style={styles.resetUtility}>
                  <View style={styles.resetUtilityCopy}>
                    <Text style={styles.settingLabel}>{t("kiosk.manualReset")}</Text>
                    <Text style={styles.settingHint}>{t("kiosk.manualResetHint")}</Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => void resetNow()} style={({ pressed }) => [styles.resetButton, pressed && styles.resetButtonPressed]}>
                    <Text style={styles.resetButtonText}>{t("kiosk.resetNow")}</Text>
                  </Pressable>
                </View>
              </View>
            </SectionCard>

            <Button label={saving ? t("kiosk.savingSettings") : t("kiosk.saveSettings")} loading={saving} disabled={saving} onPress={() => void save()} />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function SettingSwitch({ label, hint, value, onValueChange }: { label: string; hint?: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingCopy}>
        <Text style={styles.settingLabel}>{label}</Text>
        {hint ? <Text style={styles.settingHint}>{hint}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        ios_backgroundColor={colors.borderStrong}
        onValueChange={onValueChange}
        thumbColor={colors.surface}
        trackColor={{ false: colors.borderStrong, true: colors.blue }}
        value={value}
      />
    </View>
  );
}

function OptionPicker({ label, value, options, onChange, wrap = false }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; wrap?: boolean }) {
  return (
    <View style={styles.optionSetting}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View accessibilityRole="radiogroup" style={[styles.optionRow, wrap && styles.optionRowWrap]}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [styles.option, wrap && styles.optionWrap, selected && styles.optionActive, pressed && styles.optionPressed]}
            >
              <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1} style={[styles.optionText, selected && styles.optionTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  settingStack: { gap: space.lg },
  settingsList: { marginHorizontal: -space.lg, marginVertical: -space.sm },
  settingsListInset: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  settingRow: { minHeight: 58, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  settingCopy: { flex: 1, gap: 2 },
  settingLabel: { ...type.body, color: colors.text },
  settingHint: { ...type.caption, color: colors.textMuted },
  optionSetting: { gap: space.sm },
  optionRow: { flexDirection: "row", padding: 3, borderRadius: 10, backgroundColor: colors.surfaceSubtle },
  optionRowWrap: { flexWrap: "wrap", gap: 3 },
  option: { flex: 1, minHeight: 40, minWidth: 52, alignItems: "center", justifyContent: "center", borderRadius: 8, paddingHorizontal: space.sm },
  optionWrap: { flexBasis: "22%", flexGrow: 1 },
  optionActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  optionPressed: { opacity: 0.7 },
  optionText: { ...type.captionStrong, color: colors.textMuted, textAlign: "center" },
  optionTextActive: { color: colors.bluePressed },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44, marginBottom: space.md },
  infoLabel: { ...type.body, color: colors.text },
  exitFields: { gap: space.md },
  modeExplanation: { ...type.caption, color: colors.textMuted, marginTop: -space.sm },
  durationRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  durationField: { flex: 1 },
  currentResetCard: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 2 },
  currentResetLabel: { ...type.caption, color: colors.textMuted },
  currentResetValue: { ...type.bodyStrong, color: colors.text },
  resetUtility: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, paddingTop: space.xs },
  resetUtilityCopy: { flex: 1, gap: 2 },
  resetButton: { minHeight: 40, justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.dangerBorder, backgroundColor: colors.dangerSoft, paddingHorizontal: space.md },
  resetButtonPressed: { backgroundColor: colors.dangerBorder },
  resetButtonText: { ...type.captionStrong, color: colors.dangerText },
});
