import { useCallback, useState } from "react";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Alert as NativeAlert, ScrollView, StyleSheet, Text, View } from "react-native";
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
  const router = useRouter();
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
        if (!Object.values(fields).some(Boolean)) setError(caught.message);
      } else setError(t("common.error"));
    } finally { setSaving(false); }
  }

  async function resetNow() {
    NativeAlert.alert(
      t("kiosk.resetNow") || "Reset now",
      t("kiosk.resetNowConfirm") || "Start a fresh attendance cycle now?",
      [
        { text: t("common.cancel") || "Cancel", style: "cancel" },
        { text: t("kiosk.resetNow") || "Reset", onPress: async () => {
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
            <SectionCard title={t("kiosk.identification") || "Identification"}>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>{t("kiosk.mode") || "Mode"}</Text>
                <View style={styles.segRow}>
                  <Text style={[styles.seg, mode === "card" && styles.segActive]} onPress={() => setMode("card")}>Card</Text>
                  <Text style={[styles.seg, mode === "input" && styles.segActive]} onPress={() => setMode("input")}>Input</Text>
                </View>
              </View>
              {mode === "card" ? (
                <>
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>{t("kiosk.showName") || "Show name"}</Text>
                    <Text style={styles.toggleValue} onPress={() => setCardShowName(!cardShowName)}>{cardShowName ? "ON" : "OFF"}</Text>
                  </View>
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>{t("kiosk.showCode") || "Show code"}</Text>
                    <Text style={styles.toggleValue} onPress={() => setCardShowCode(!cardShowCode)}>{cardShowCode ? "ON" : "OFF"}</Text>
                  </View>
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>{t("kiosk.showEmail") || "Show email"}</Text>
                    <Text style={styles.toggleValue} onPress={() => setCardShowEmail(!cardShowEmail)}>{cardShowEmail ? "ON" : "OFF"}</Text>
                  </View>
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>{t("kiosk.usePin") || "Require PIN after selection"}</Text>
                    <Text style={styles.toggleValue} onPress={() => setUsePin(!usePin)}>{usePin ? "ON" : "OFF"}</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>{t("kiosk.fields") || "Fields"}</Text>
                    <View style={styles.segRow}>
                      <Text style={[styles.seg, inputFieldCount === 1 && styles.segActive]} onPress={() => { setInputFieldCount(1); setInputSecondField(""); }}>1</Text>
                      <Text style={[styles.seg, inputFieldCount === 2 && styles.segActive]} onPress={() => setInputFieldCount(2)}>2</Text>
                    </View>
                  </View>
                  {inputFieldCount === 2 ? (
                    <View style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>{t("kiosk.secondField") || "Second field"}</Text>
                      <View style={styles.segRow}>
                        <Text style={[styles.seg, inputSecondField === "name" && styles.segActive]} onPress={() => setInputSecondField("name")}>Name</Text>
                        <Text style={[styles.seg, inputSecondField === "email" && styles.segActive]} onPress={() => setInputSecondField("email")}>Email</Text>
                        <Text style={[styles.seg, inputSecondField === "pin" && styles.segActive]} onPress={() => setInputSecondField("pin")}>PIN</Text>
                      </View>
                    </View>
                  ) : null}
                </>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t("kiosk.exitCode") || "Exit code"}</Text>
                <StatusPill label={settings.exit_code_configured ? (t("kiosk.configured") || "Configured") : (t("kiosk.notConfigured") || "Not set")} tone={settings.exit_code_configured ? "green" : "neutral"} />
              </View>
              <Field
                autoCapitalize="none"
                label={t("kiosk.newExitCode") || "New exit code"}
                value={exitCode}
                onChangeText={setExitCode}
                secureTextEntry
                placeholder={t("kiosk.exitCodePlaceholder") || "4-10 characters"}
              />
              <Field
                autoCapitalize="none"
                error={fieldErrors.exit_code_confirm}
                label={t("kiosk.confirmExitCode") || "Confirm exit code"}
                value={exitCodeConfirm}
                onChangeText={setExitCodeConfirm}
                secureTextEntry
              />
            </SectionCard>

            <SectionCard title={t("kiosk.confirmation") || "Confirmation"}>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>{t("kiosk.template") || "Template"}</Text>
                <View style={styles.segRow}>
                  <Text style={[styles.seg, confirmationTemplate === "clean" && styles.segActive]} onPress={() => setConfirmationTemplate("clean")}>Clean</Text>
                  <Text style={[styles.seg, confirmationTemplate === "bold" && styles.segActive]} onPress={() => setConfirmationTemplate("bold")}>Bold</Text>
                  <Text style={[styles.seg, confirmationTemplate === "minimal" && styles.segActive]} onPress={() => setConfirmationTemplate("minimal")}>Minimal</Text>
                </View>
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>{t("kiosk.returnDelay") || "Return delay"}</Text>
                <View style={styles.segRow}>
                  <Text style={[styles.seg, confirmationReturnSeconds === 1 && styles.segActive]} onPress={() => setConfirmationReturnSeconds(1)}>1s</Text>
                  <Text style={[styles.seg, confirmationReturnSeconds === 3 && styles.segActive]} onPress={() => setConfirmationReturnSeconds(3)}>3s</Text>
                  <Text style={[styles.seg, confirmationReturnSeconds === 5 && styles.segActive]} onPress={() => setConfirmationReturnSeconds(5)}>5s</Text>
                </View>
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>{t("kiosk.sound") || "Sound"}</Text>
                <Text style={styles.toggleValue} onPress={() => setConfirmationSound(!confirmationSound)}>{confirmationSound ? "ON" : "OFF"}</Text>
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>{t("kiosk.vibration") || "Vibration"}</Text>
                <Text style={styles.toggleValue} onPress={() => setConfirmationVibration(!confirmationVibration)}>{confirmationVibration ? "ON" : "OFF"}</Text>
              </View>
            </SectionCard>

            <SectionCard title={t("kiosk.attendanceReset") || "Attendance reset"}>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>{t("kiosk.resetMode") || "Mode"}</Text>
                <View style={styles.segRow}>
                  <Text style={[styles.seg, resetMode === "daily" && styles.segActive]} onPress={() => setResetMode("daily")}>{t("kiosk.daily") || "Daily"}</Text>
                  <Text style={[styles.seg, resetMode === "rolling" && styles.segActive]} onPress={() => setResetMode("rolling")}>{t("kiosk.rolling") || "Rolling"}</Text>
                </View>
              </View>
              {resetMode === "daily" ? (
                <Field label={t("kiosk.resetTime") || "Reset time"} value={resetDailyTime} onChangeText={setResetDailyTime} placeholder="HH:MM" />
              ) : (
                <>
                  <Field keyboardType="number-pad" label={t("kiosk.rollingHours") || "Hours"} value={String(resetRollingHours)} onChangeText={(v) => setResetRollingHours(Number(v) || 0)} />
                  <Field keyboardType="number-pad" label={t("kiosk.rollingMinutes") || "Minutes"} value={String(resetRollingMinutes)} onChangeText={(v) => setResetRollingMinutes(Number(v) || 0)} />
                </>
              )}
              <Text style={styles.currentReset}>{t("kiosk.currentReset") || "Current"}: {reset}</Text>
              <Button label={t("kiosk.resetNow") || "Reset now"} variant="secondary" onPress={() => void resetNow()} />
            </SectionCard>

            <Button label={saving ? (t("groups.saving") || "Saving...") : (t("groups.save") || "Save")} loading={saving} disabled={saving} onPress={() => void save()} />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  toggleLabel: { ...type.body, color: colors.text, flex: 1 },
  toggleValue: { ...type.bodyStrong, color: colors.blue },
  segRow: { flexDirection: "row", gap: 4 },
  seg: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, ...type.captionStrong, color: colors.textMuted, backgroundColor: colors.surfaceSubtle, overflow: "hidden" },
  segActive: { color: colors.blue, backgroundColor: colors.blueSoft },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  infoLabel: { ...type.body, color: colors.text },
  currentReset: { ...type.caption, color: colors.textMuted, marginTop: space.sm },
});
