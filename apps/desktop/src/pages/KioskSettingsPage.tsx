import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { canManageGroupConfiguration } from "@checkstation/domain";
import { Alert, Badge, Button, Card, Field, Input, Loading, Page, PageHeader, Segmented, Select, Switch, TextArea, formatError } from "../components/ui";
import { useApp } from "../lib/AppProvider";
import { buildKioskSettingsSavePayload, CONFIRMATION_RETURN_OPTIONS, isKioskSettingsDirty, kioskSettingsFormFromApi, visibleConfirmationMessageFields, type KioskSettingsApi, type KioskSettingsForm } from "../lib/kioskSettingsForm";

type GroupSummary = { group_type?: string };

export function KioskSettingsPage() {
  const { id = "" } = useParams(); const { api, authState, t } = useApp(); const navigate = useNavigate();
  const [settings, setSettings] = useState<KioskSettingsApi | null>(null); const [form, setForm] = useState<KioskSettingsForm | null>(null); const [savedForm, setSavedForm] = useState<KioskSettingsForm | null>(null); const [isStructured, setIsStructured] = useState(false);
  const [changingExitCode, setChangingExitCode] = useState(false); const [savedChangingExitCode, setSavedChangingExitCode] = useState(false); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [resetting, setResetting] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [fields, setFields] = useState<Record<string, string>>({});

  const load = useCallback(async () => { setLoading(true); setError(""); try { const [nextSettings, group] = await Promise.all([api.get<KioskSettingsApi>(endpoints.kioskSettings(id)), api.get<GroupSummary>(endpoints.group(id))]); const nextForm = kioskSettingsFormFromApi(nextSettings); const structured = group.group_type === "structured"; if (structured) nextForm.mode = "card"; setSettings(nextSettings); setForm(nextForm); setSavedForm(nextForm); setIsStructured(structured); const editingExit = !nextSettings.exit_code_configured; setChangingExitCode(editingExit); setSavedChangingExitCode(editingExit); } catch (caught) { setError(formatError(caught, t("common.error"))); } finally { setLoading(false); } }, [api, id, t]);
  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => !form || !savedForm || !settings ? false : isKioskSettingsDirty(form, savedForm, { changingExitCode, savedChangingExitCode, exitCodeConfigured: Boolean(settings.exit_code_configured) }), [changingExitCode, form, savedChangingExitCode, savedForm, settings]);
  if (!canManageGroupConfiguration(authState.session)) return <Page><Alert tone="warning">{t("more.staffRoleDescription")}</Alert></Page>;
  if (loading) return <Page><Loading label={t("kiosk.settingsLoading")} /></Page>;
  if (!form || !savedForm || !settings) return <Page><Alert>{error || t("common.error")}</Alert></Page>;

  const groupEmailOn = Boolean(settings.group_require_email); const groupPinOn = Boolean(settings.group_require_pin); const pinForcesCode = form.mode === "card" && form.use_pin; const messageFields = visibleConfirmationMessageFields(settings.group_actions);
  function patch(next: Partial<KioskSettingsForm>) { setForm((current) => { if (!current) return current; const updated = { ...current, ...next }; if (updated.mode === "card" && updated.use_pin) updated.card_show_participant_code = true; return updated; }); setMessage(""); }
  async function save(event?: FormEvent) { event?.preventDefault(); if (!dirty || !form || !settings) return; setBusy(true); setError(""); setMessage(""); setFields({}); try { const updated = await api.patch<KioskSettingsApi>(endpoints.kioskSettings(id), buildKioskSettingsSavePayload(form, { changingExitCode, exitCodeConfigured: Boolean(settings.exit_code_configured) })); const nextForm = kioskSettingsFormFromApi(updated); if (isStructured) nextForm.mode = "card"; setSettings(updated); setForm(nextForm); setSavedForm(nextForm); const editingExit = !updated.exit_code_configured; setChangingExitCode(editingExit); setSavedChangingExitCode(editingExit); setMessage(t("kiosk.settingsSaved")); } catch (caught) { if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data)); setError(formatError(caught, t("common.error"))); } finally { setBusy(false); } }
  async function resetNow() { if (!confirm(t("kiosk.resetNowConfirm"))) return; setResetting(true); setError(""); setMessage(""); try { await api.post(`${endpoints.kioskSettings(id)}reset-now/`, {}); setMessage(t("kiosk.resetNowDone")); } catch (caught) { setError(formatError(caught, t("common.error"))); } finally { setResetting(false); } }

  return <Page>
    <PageHeader title={t("kiosk.settings")} description={settings.group_name} actions={<><Button className="kiosk-settings-save" loading={busy} disabled={!dirty} onClick={() => void save()}>{t("kiosk.saveSettings")}</Button><Button variant="secondary" onClick={() => navigate(`/groups/${id}`)}>{t("common.back")}</Button></>} />
    <div className="kiosk-settings-feedback"><Alert>{error}</Alert><Alert tone="success">{message}</Alert></div>
    <form className="desktop-kiosk-settings" onSubmit={(event) => void save(event)}>
      <div className="desktop-kiosk-settings-grid">
        <Card title={t("kiosk.kioskType")} description={isStructured ? t("kiosk.structuredModeHint") : t("kiosk.modeHint")}><Segmented value={form.mode} onChange={(mode) => patch({ mode })} options={isStructured ? [{ value: "card", label: t("kiosk.cardMode") }] : [{ value: "card", label: t("kiosk.cardMode") }, { value: "input", label: t("kiosk.inputMode") }]} /></Card>
        <Card title={t("kiosk.exitCode")} description={t("kiosk.exitCodeHint")}>
          {settings.exit_code_configured && !changingExitCode ? <div className="kiosk-exit-configured"><Badge tone="green">✓ {t("kiosk.exitCodeConfigured")}</Badge><Button type="button" variant="secondary" onClick={() => setChangingExitCode(true)}>{t("kiosk.changeExitCode")}</Button></div> : <div className="kiosk-exit-editor"><div className="form-grid"><Field label={t("kiosk.newExitCode")} hint={t("kiosk.newExitCodeHint")} error={fields.exit_code}><Input type="password" autoComplete="off" value={form.exit_code} onChange={(event) => patch({ exit_code: event.target.value })} placeholder={t("kiosk.exitCodePlaceholder")} /></Field><Field label={t("kiosk.confirmExitCode")} error={fields.exit_code_confirm}><Input type="password" autoComplete="off" value={form.exit_code_confirm} onChange={(event) => patch({ exit_code_confirm: event.target.value })} placeholder={t("kiosk.confirmExitCodePlaceholder")} /></Field></div>{settings.exit_code_configured ? <Button type="button" variant="ghost" onClick={() => { patch({ exit_code: "", exit_code_confirm: "" }); setChangingExitCode(false); }}>{t("kiosk.cancelExitCodeChange")}</Button> : null}</div>}
        </Card>
      </div>
      <Card title={t("kiosk.identification")} description={t("kiosk.identificationHint")}>
        {form.mode === "card" || isStructured ? <div className="kiosk-identification-columns"><section><h3>{t("kiosk.cardContent")}</h3><Toggle label={t("kiosk.showName")} value={form.card_show_name} onChange={(value) => patch({ card_show_name: value })} /><Toggle label={t("kiosk.showCode")} hint={pinForcesCode ? t("kiosk.pinRequiresCode") : undefined} value={form.card_show_participant_code} disabled={pinForcesCode} onChange={(value) => patch({ card_show_participant_code: value })} /><Toggle label={t("kiosk.showEmail")} hint={!groupEmailOn ? t("kiosk.emailDisabledHint") : undefined} value={groupEmailOn && form.card_show_email} disabled={!groupEmailOn} onChange={(value) => patch({ card_show_email: value })} /></section><section><h3>{t("kiosk.participantVerification")}</h3><Toggle label={t("kiosk.usePin")} hint={!groupPinOn ? t("kiosk.pinDisabledHint") : undefined} value={groupPinOn && form.use_pin} disabled={!groupPinOn} onChange={(value) => patch({ use_pin: value })} /></section></div> : <div className="kiosk-input-settings"><div className="field"><span className="field-label">{t("kiosk.fields")}</span><Segmented value={String(form.input_field_count)} onChange={(count) => patch({ input_field_count: Number(count) })} options={[{ value: "1", label: t("kiosk.oneField") }, { value: "2", label: t("kiosk.twoFields") }]} /></div>{form.input_field_count === 2 ? <Field label={t("kiosk.secondField")}><Select value={form.input_second_field} onChange={(event) => patch({ input_second_field: event.target.value })}><option value="name">{t("members.name")}</option><option value="email" disabled={!groupEmailOn}>{t("auth.email")}{groupEmailOn ? "" : t("kiosk.enableInGroupSuffix")}</option><option value="pin" disabled={!groupPinOn}>{t("kiosk.pin")}{groupPinOn ? "" : t("kiosk.enableInGroupSuffix")}</option></Select></Field> : <p className="configuration-hint">{t("kiosk.oneFieldHint")}</p>}</div>}
      </Card>
      <div className="desktop-kiosk-settings-grid desktop-kiosk-settings-lower">
        <Card title={t("kiosk.confirmation")} description={t("kiosk.confirmationHint")}>
          <div className="kiosk-confirmation-settings">
            <section className="kiosk-message-section">
              <h3>{t("kiosk.confirmationMessages")}</h3>
              <p className="kiosk-message-guide">{t("kiosk.confirmationVariables")}</p>
              {messageFields.length ? <div className="kiosk-message-fields">{messageFields.map((item) => {
                const defaultMessage = settings.confirmation_defaults?.[item.action] || "";
                return <label className={`field kiosk-message-field${fields[item.field] ? " field-error" : ""}`} key={item.field}><span className="field-label">{t(item.labelKey)}</span><TextArea rows={3} value={form[item.field]} onChange={(event) => patch({ [item.field]: event.target.value } as Partial<KioskSettingsForm>)} placeholder={defaultMessage} />{defaultMessage ? <span className="kiosk-message-default">{t("kiosk.defaultMessageHint", { message: defaultMessage })}</span> : null}{fields[item.field] ? <span className="field-error-text">{fields[item.field]}</span> : null}</label>;
              })}</div> : <p className="configuration-hint">{t("kiosk.noConfirmationActions")}</p>}
            </section>
            <section className="kiosk-confirmation-compact">
              <div className="kiosk-return-setting"><span className="field-label">{t("kiosk.returnDelay")}</span><Segmented value={String(form.confirmation_return_seconds)} onChange={(seconds) => patch({ confirmation_return_seconds: Number(seconds) })} options={CONFIRMATION_RETURN_OPTIONS.map((seconds) => ({ value: String(seconds), label: t(seconds === 1 ? "kiosk.oneSecond" : "kiosk.seconds", { count: seconds }) }))} /></div>
              <div className="kiosk-effect-settings"><Toggle label={t("kiosk.sound")} hint={t("kiosk.soundHint")} value={form.confirmation_sound_enabled} onChange={(value) => patch({ confirmation_sound_enabled: value })} /><Toggle label={t("kiosk.vibration")} hint={t("kiosk.vibrationHint")} value={form.confirmation_vibration_enabled} onChange={(value) => patch({ confirmation_vibration_enabled: value })} /></div>
            </section>
          </div>
        </Card>
        <Card title={t("kiosk.attendanceReset")} description={t("kiosk.attendanceResetHint")}>
          <div className="kiosk-reset-settings">
            <section className="kiosk-reset-schedule"><Segmented value={form.attendance_reset_mode} onChange={(mode) => patch({ attendance_reset_mode: mode })} options={[{ value: "daily", label: t("kiosk.daily") }, { value: "rolling", label: t("kiosk.rolling") }]} /><p className="muted-copy">{t(form.attendance_reset_mode === "daily" ? "kiosk.dailyHint" : "kiosk.rollingHint")}</p>{form.attendance_reset_mode === "daily" ? <Field label={t("kiosk.resetTime")} error={fields.attendance_reset_daily_time}><Input type="time" value={form.attendance_reset_daily_time} onChange={(event) => patch({ attendance_reset_daily_time: event.target.value })} /></Field> : <div className="form-grid"><Field label={t("kiosk.rollingHours")} error={fields.attendance_reset_rolling_hours}><Input type="number" min={0} max={168} value={form.attendance_reset_rolling_hours} onChange={(event) => patch({ attendance_reset_rolling_hours: Number(event.target.value) || 0 })} /></Field><Field label={t("kiosk.rollingMinutes")} error={fields.attendance_reset_rolling_minutes}><Input type="number" min={0} max={59} value={form.attendance_reset_rolling_minutes} onChange={(event) => patch({ attendance_reset_rolling_minutes: Number(event.target.value) || 0 })} /></Field></div>}</section>
            <div className="kiosk-reset-manual"><div><strong>{t("kiosk.manualReset")}</strong><p className="configuration-hint">{t("kiosk.manualResetHint")}</p></div><Button type="button" variant="danger" loading={resetting} onClick={() => void resetNow()}>{t("kiosk.resetNow")}</Button></div>
          </div>
        </Card>
      </div>
    </form>
  </Page>;
}

function Toggle({ label, hint, value, onChange, disabled = false }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) { return <div className={`setting-row${disabled ? " is-disabled" : ""}`}><div className="setting-copy"><strong>{label}</strong>{hint ? <span>{hint}</span> : null}</div><Switch label={label} checked={value} disabled={disabled} onChange={onChange} /></div>; }
