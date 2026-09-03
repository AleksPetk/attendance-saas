import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "../api.js";
import {
  ConfirmDialog,
  ErrorBanner,
  Field,
  LoadingState,
  PageHeader,
  PasswordInput,
  StatusBadge,
} from "../components.jsx";
import { formatGroupId } from "../groupForm.js";
import {
  setWorkspaceLeaveChecker,
  skipNextWorkspaceLeaveCheck,
} from "./builder/workspaceLeaveGuard.js";
import {
  buildKioskSettingsSavePayload,
  EMPTY_KIOSK_SETTINGS_FORM,
  isKioskSettingsDirty,
  kioskSettingsFormFromApi,
} from "./kioskSettingsForm.js";
import KioskConfirmationSettings from "./KioskConfirmationSettings.jsx";
import KioskAttendanceResetSettings from "./KioskAttendanceResetSettings.jsx";
import "./kioskSettings.css";

export default function KioskSettingsScreen({ session, groupId, onNavigate }) {
  const { t } = useTranslation("kiosk");
  const { t: tCommon } = useTranslation("common");
  const [group, setGroup] = useState(null);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(EMPTY_KIOSK_SETTINGS_FORM);
  const [savedForm, setSavedForm] = useState(EMPTY_KIOSK_SETTINGS_FORM);
  const [changingExitCode, setChangingExitCode] = useState(false);
  const [savedChangingExitCode, setSavedChangingExitCode] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const skipLeaveConfirmRef = useRef(false);

  const exitCodeConfigured = Boolean(settings?.exit_code_configured);

  const dirty = useMemo(
    () =>
      isKioskSettingsDirty(form, savedForm, {
        changingExitCode,
        savedChangingExitCode,
        exitCodeConfigured,
      }),
    [changingExitCode, exitCodeConfigured, form, savedChangingExitCode, savedForm],
  );

  const load = useCallback(async () => {
    setError("");
    setSuccessMessage("");
    try {
      const [groupResult, settingsResult] = await Promise.all([
        api.getGroup(session, groupId),
        api.getGroupKioskSettings(session, groupId),
      ]);
      if (groupResult.data.status === "archived") {
        skipNextWorkspaceLeaveCheck();
        onNavigate({ name: "groups", status: "archived", replace: true });
        return;
      }
      setGroup(groupResult.data);
      setSettings(settingsResult.data);
      const next = kioskSettingsFormFromApi(settingsResult.data);
      if (groupResult.data.group_type === "structured") {
        next.mode = "card";
      }
      const nextChangingExitCode = !settingsResult.data.exit_code_configured;
      setForm(next);
      setSavedForm(next);
      setChangingExitCode(nextChangingExitCode);
      setSavedChangingExitCode(nextChangingExitCode);
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }, [groupId, onNavigate, session]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return undefined;
    function onBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    setWorkspaceLeaveChecker(() => {
      if (skipLeaveConfirmRef.current) return true;
      if (!dirty) return true;
      return window.confirm(t("settings.leaveConfirm"));
    });
    return () => setWorkspaceLeaveChecker(null);
  }, [dirty]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = window.setTimeout(() => setSuccessMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (!leaveDialogOpen) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        handleStay();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveDialogOpen]);

  const groupEmailOn = Boolean(settings?.group_require_email);
  const groupPinOn = Boolean(settings?.group_require_pin);
  const isStructured = group?.group_type === "structured";
  const pinForcedCode = form.mode === "card" && form.use_pin;

  function patchForm(updates) {
    setForm((current) => {
      const next = { ...current, ...updates };
      if (next.mode === "card" && next.use_pin) {
        next.card_show_participant_code = true;
      }
      return next;
    });
  }

  function navigateToGroupDetail() {
    skipLeaveConfirmRef.current = true;
    skipNextWorkspaceLeaveCheck();
    onNavigate({ name: "group-detail", groupId });
  }

  function handleStay() {
    setLeaveDialogOpen(false);
  }

  function handleLeaveWithoutSaving() {
    setLeaveDialogOpen(false);
    navigateToGroupDetail();
  }

  function handleBack() {
    if (!dirty) {
      navigateToGroupDetail();
      return;
    }
    setLeaveDialogOpen(true);
  }

  async function confirmResetNow() {
    setResetting(true);
    setError("");
    try {
      const result = await api.resetKioskAttendanceNow(session, groupId);
      setSettings((current) => ({
        ...current,
        manual_reset_at: result.data.manual_reset_at,
      }));
      setSuccessMessage(result.data.message || t("settings.attendanceResetSuccess"));
      setResetDialogOpen(false);
    } catch (resetError) {
      setError(errorMessage(resetError));
      setResetDialogOpen(false);
    } finally {
      setResetting(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    setSuccessMessage("");
    const payload = buildKioskSettingsSavePayload(form, {
      changingExitCode,
      exitCodeConfigured,
    });
    try {
      const result = await api.updateGroupKioskSettings(session, groupId, payload);
      setSettings(result.data);
      const nextChangingExitCode = !result.data.exit_code_configured;
      const next = {
        ...form,
        exit_code: "",
        exit_code_confirm: "",
      };
      setForm(next);
      setSavedForm(next);
      setChangingExitCode(nextChangingExitCode);
      setSavedChangingExitCode(nextChangingExitCode);
      setSuccessMessage(t("settings.saved"));
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (!group || !settings) {
    return (
      <div className="page">
        <ErrorBanner message={error} />
        <LoadingState label={t("settings.loading")} />
      </div>
    );
  }

  const readiness = settings.readiness;

  return (
    <div className="page kiosk-settings-page">
      <PageHeader
        title={t("settings.title")}
        meta={
          <>
            <span className="entity-kicker">{formatGroupId(group.id)}</span>
            <StatusBadge status={readiness?.ready ? "active" : "setup_incomplete"} />
          </>
        }
        description={
          <>
            <strong>{group.name}</strong> — {t("settings.description")}
          </>
        }
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={handleBack}>
              {tCommon("back")}
            </button>
            <button
              type="submit"
              form="kiosk-settings-form"
              className="btn-primary"
              disabled={!dirty || saving}
              aria-disabled={!dirty || saving}
            >
              {saving ? t("settings.saving") : t("settings.save")}
            </button>
          </>
        }
      />

      {readiness && !readiness.ready && (readiness.issues || []).length > 0 ? (
        <div className="kiosk-settings-status-banner" role="status">
          <strong>{t("settings.needsSetup")}</strong>
          <ul className="kiosk-settings-issues compact">
            {readiness.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : readiness?.ready ? (
        <div className="kiosk-settings-status-banner kiosk-settings-status-banner-ready" role="status">
          {t("settings.readyBanner")}
        </div>
      ) : null}

      {successMessage ? (
        <div className="alert alert-success kiosk-settings-save-notice" role="status">
          {successMessage}
        </div>
      ) : null}

      <ErrorBanner message={error} />

      <form
        id="kiosk-settings-form"
        className="kiosk-settings-layout"
        onSubmit={save}
      >
        <div className="kiosk-settings-top-row" data-tutorial-target="kiosk-settings-overview">
          <section
            className="kiosk-settings-card card-surface"
            aria-labelledby="ks-type-title"
            data-tutorial-target="kiosk-settings-type"
          >
            <div className="kiosk-settings-card-head">
              <h3 id="ks-type-title">{t("settings.type.title")}</h3>
              <p className="hint">
                {isStructured
                  ? t("settings.type.structuredHint")
                  : t("settings.type.standardHint")}
              </p>
            </div>
            {isStructured ? (
              <div className="kiosk-structured-flow-note">
                <strong>{t("settings.type.flowTitle")}</strong>
                <p className="hint">{t("settings.type.flowSteps")}</p>
                <p className="hint">{t("settings.type.classPinsNote")}</p>
              </div>
            ) : (
              <div className="kiosk-type-picker" role="radiogroup" aria-label={t("settings.type.ariaLabel")}>
                {[
                  { id: "card", label: t("settings.type.card"), hint: t("settings.type.cardHint") },
                  { id: "input", label: t("settings.type.input"), hint: t("settings.type.inputHint") },
                ].map((option) => (
                  <label
                    key={option.id}
                    className={`kiosk-type-option ${form.mode === option.id ? "active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="kiosk-type"
                      value={option.id}
                      checked={form.mode === option.id}
                      onChange={() => patchForm({ mode: option.id })}
                    />
                    <span className="kiosk-type-label">{option.label}</span>
                    <span className="hint">{option.hint}</span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section
            className="kiosk-settings-card card-surface"
            aria-labelledby="ks-exit-title"
            data-tutorial-target="kiosk-settings-exit"
          >
            <div className="kiosk-settings-card-head">
              <h3 id="ks-exit-title">{t("settings.exit.title")}</h3>
              <p className="hint">{t("settings.exit.hint")}</p>
            </div>
            <div className="kiosk-settings-exit-body">
              {settings.exit_code_configured && !changingExitCode ? (
                <div className="kiosk-exit-configured-panel">
                  <p className="kiosk-exit-status kiosk-exit-status-ok">
                    <span aria-hidden="true">✓</span> {t("settings.exit.configured")}
                  </p>
                  <button
                    type="button"
                    className="btn-secondary btn-sm kiosk-exit-change-btn"
                    onClick={() => setChangingExitCode(true)}
                  >
                    {t("settings.exit.change")}
                  </button>
                </div>
              ) : (
                <>
                  {!settings.exit_code_configured ? (
                    <p className="kiosk-exit-status kiosk-exit-status-required">{t("settings.exit.required")}</p>
                  ) : null}
                  <Field label={t("settings.exit.codeLabel")}>
                    <PasswordInput
                      value={form.exit_code}
                      onChange={(event) => patchForm({ exit_code: event.target.value })}
                      autoComplete="off"
                      name="kiosk-exit-code-new"
                    />
                  </Field>
                  <Field label={t("settings.exit.confirmLabel")}>
                    <PasswordInput
                      value={form.exit_code_confirm}
                      onChange={(event) => patchForm({ exit_code_confirm: event.target.value })}
                      autoComplete="off"
                      name="kiosk-exit-code-confirm"
                    />
                  </Field>
                  <p className="hint kiosk-settings-helper">
                    {t("settings.exit.helper")}
                  </p>
                  {settings.exit_code_configured ? (
                    <button
                      type="button"
                      className="btn-secondary btn-sm kiosk-exit-change-btn"
                      onClick={() => {
                        setChangingExitCode(savedChangingExitCode);
                        patchForm({ exit_code: "", exit_code_confirm: "" });
                      }}
                    >
                      {t("settings.exit.cancelChange")}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </div>

        <section
          className="kiosk-settings-card card-surface kiosk-settings-card-wide"
          aria-labelledby="ks-identification-title"
          data-tutorial-target="kiosk-settings-identification"
        >
          <div className="kiosk-settings-card-head">
            <h3 id="ks-identification-title">{t("settings.identification.title")}</h3>
            <p className="hint">{t("settings.identification.hint")}</p>
          </div>

          {form.mode === "card" || isStructured ? (
            <div className="kiosk-settings-ident-body">
              <div
                className="kiosk-settings-subsection"
                data-tutorial-target="kiosk-settings-identification-fields"
              >
                <h4>{t("settings.identification.cardContent")}</h4>
                <div className="kiosk-settings-option-stack">
                  <label className="ks-option-row">
                    <input
                      type="checkbox"
                      checked={form.card_show_name}
                      onChange={(event) => patchForm({ card_show_name: event.target.checked })}
                    />
                    <span>{t("fields.name")}</span>
                  </label>
                  <label className={`ks-option-row ${pinForcedCode ? "locked" : ""}`}>
                    <input
                      type="checkbox"
                      checked={form.card_show_participant_code}
                      disabled={pinForcedCode}
                      onChange={(event) =>
                        patchForm({ card_show_participant_code: event.target.checked })
                      }
                    />
                    <span>
                      {isStructured ? t("fields.classParticipantCode") : t("fields.groupParticipantCode")}
                      {pinForcedCode ? (
                        <span className="ks-option-meta">{t("settings.identification.pinRequiredMeta")}</span>
                      ) : null}
                    </span>
                  </label>
                  <label className={`ks-option-row ${!groupEmailOn ? "disabled-option" : ""}`}>
                    <input
                      type="checkbox"
                      checked={groupEmailOn ? form.card_show_email : false}
                      disabled={!groupEmailOn}
                      onChange={(event) =>
                        patchForm({ card_show_email: event.target.checked })
                      }
                    />
                    <span>
                      {t("fields.email")}
                      {!groupEmailOn ? (
                        <span className="ks-option-meta">
                          {t("settings.identification.emailDisabledMeta")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </div>
              </div>

              <div
                className="kiosk-settings-subsection"
                data-tutorial-target="kiosk-settings-verification"
              >
                <h4>{t("settings.identification.verification")}</h4>
                <div className="kiosk-settings-option-stack">
                  <label className={`ks-option-row ${!groupPinOn ? "disabled-option" : ""}`}>
                    <input
                      type="checkbox"
                      checked={groupPinOn ? form.use_pin : false}
                      disabled={!groupPinOn}
                      onChange={(event) => patchForm({ use_pin: event.target.checked })}
                    />
                    <span>
                      {t("settings.identification.requirePin")}
                      {!groupPinOn ? (
                        <span className="ks-option-meta">
                          {t("settings.identification.pinDisabledMeta")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="kiosk-settings-ident-body"
              data-tutorial-target="kiosk-settings-identification-fields"
            >
              <div className="kiosk-settings-subsection">
                <h4>{t("settings.identification.fieldCount")}</h4>
                <div className="kiosk-segment-picker" role="radiogroup" aria-label={t("settings.identification.fieldCountAria")}>
                  {[1, 2].map((count) => (
                    <label
                      key={count}
                      className={`kiosk-segment-option ${form.input_field_count === count ? "active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="input-field-count"
                        checked={form.input_field_count === count}
                        onChange={() => patchForm({ input_field_count: count })}
                      />
                      {t("settings.identification.fieldCountLabel", { count })}
                    </label>
                  ))}
                </div>
              </div>

              <div
                className="kiosk-settings-subsection"
                data-tutorial-target="kiosk-settings-verification"
              >
                <h4>{t("settings.identification.fieldConfig")}</h4>
                <div className="kiosk-field-config">
                  <div className="kiosk-field-config-row locked">
                    <div className="kiosk-field-config-label">{t("settings.identification.field1")}</div>
                    <div className="kiosk-field-config-value">
                      <strong>{t("fields.groupParticipantCode")}</strong>
                      <span className="kiosk-field-config-badge">{tCommon("required")}</span>
                    </div>
                  </div>

                  {form.input_field_count === 1 ? (
                    <p className="hint kiosk-settings-helper">
                      {t("settings.identification.oneFieldHint")}
                    </p>
                  ) : (
                    <div className="kiosk-field-config-row">
                      <div className="kiosk-field-config-label">{t("settings.identification.field2")}</div>
                      <div className="kiosk-field-config-value">
                        <select
                          className="kiosk-field-select"
                          value={form.input_second_field}
                          onChange={(event) => patchForm({ input_second_field: event.target.value })}
                          aria-label={t("settings.identification.field2Aria")}
                        >
                          <option value="name">{t("fields.name")}</option>
                          <option value="email" disabled={!groupEmailOn}>
                            {t("fields.email")}{groupEmailOn ? "" : t("settings.identification.emailOptionSuffix")}
                          </option>
                          <option value="pin" disabled={!groupPinOn}>
                            {t("fields.pin")}{groupPinOn ? "" : t("settings.identification.pinOptionSuffix")}
                          </option>
                        </select>
                        {!groupEmailOn ? (
                          <span className="ks-option-meta">
                            {t("settings.identification.emailDisabledMeta")}
                          </span>
                        ) : null}
                        {!groupPinOn ? (
                          <span className="ks-option-meta">
                            {t("settings.identification.pinDisabledMeta")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <section
          className="kiosk-settings-card card-surface kiosk-settings-card-wide"
          aria-labelledby="ks-attendance-reset-title"
          data-tutorial-target="kiosk-settings-reset"
        >
          <div className="kiosk-settings-card-head">
            <h3 id="ks-attendance-reset-title">{t("settings.attendanceReset.title")}</h3>
            <p className="hint">{t("settings.attendanceReset.hint")}</p>
          </div>
          <KioskAttendanceResetSettings
            form={form}
            onPatch={patchForm}
            onResetNow={() => setResetDialogOpen(true)}
            resetting={resetting}
          />
        </section>

        <section
          className="kiosk-settings-card card-surface kiosk-settings-card-wide"
          aria-labelledby="ks-confirmation-title"
          data-tutorial-target="kiosk-settings-confirmation"
        >
          <div className="kiosk-settings-card-head">
            <h3 id="ks-confirmation-title">{t("settings.confirmationScreen.title")}</h3>
            <p className="hint">{t("settings.confirmationScreen.hint")}</p>
          </div>
          <KioskConfirmationSettings
            form={form}
            groupActions={settings.group_actions || {}}
            defaults={settings.confirmation_defaults || {}}
            onPatch={patchForm}
          />
        </section>
      </form>

      {resetDialogOpen ? (
        <ConfirmDialog
          title={t("settings.resetDialog.title")}
          body={t("settings.resetDialog.body")}
          cancelLabel={tCommon("cancel")}
          confirmLabel={t("settings.resetDialog.confirm")}
          danger
          onCancel={() => setResetDialogOpen(false)}
          onConfirm={confirmResetNow}
        />
      ) : null}

      {leaveDialogOpen ? (
        <ConfirmDialog
          title={t("settings.leaveDialogTitle")}
          body={t("settings.leaveConfirm")}
          cancelLabel={t("settings.leaveStay")}
          confirmLabel={t("settings.leaveWithoutSaving")}
          danger
          onCancel={handleStay}
          onConfirm={handleLeaveWithoutSaving}
        />
      ) : null}
    </div>
  );
}
