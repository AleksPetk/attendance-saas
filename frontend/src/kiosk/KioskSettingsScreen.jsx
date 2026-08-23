import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "../api.js";
import {
  ConfirmDialog,
  ErrorBanner,
  Field,
  LoadingState,
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

const LEAVE_CONFIRM_MESSAGE =
  "You have changes that haven't been saved. Leave without saving?";

export default function KioskSettingsScreen({ session, groupId, onNavigate }) {
  const [group, setGroup] = useState(null);
  const [settings, setSettings] = useState(null);
  const [kioskDesignConfig, setKioskDesignConfig] = useState(null);
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
      const [groupResult, settingsResult, designResult] = await Promise.all([
        api.getGroup(session, groupId),
        api.getGroupKioskSettings(session, groupId),
        api.getGroupKioskDesign(session, groupId).catch(() => ({ data: null })),
      ]);
      if (groupResult.data.status === "archived") {
        skipNextWorkspaceLeaveCheck();
        onNavigate({ name: "groups", status: "archived", replace: true });
        return;
      }
      setGroup(groupResult.data);
      setSettings(settingsResult.data);
      setKioskDesignConfig(designResult.data?.config || null);
      const next = kioskSettingsFormFromApi(settingsResult.data);
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
      return window.confirm(LEAVE_CONFIRM_MESSAGE);
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
      setSuccessMessage(result.data.message || "Attendance cycle reset for this Group.");
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
      setSuccessMessage("Kiosk settings saved.");
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
        <LoadingState label="Loading kiosk settings…" />
      </div>
    );
  }

  const readiness = settings.readiness;

  return (
    <div className="page page-detail kiosk-settings-page">
      <header className="page-header page-header-stable">
        <div className="page-header-copy">
          <div className="editor-title-row">
            <h2>Kiosk Settings</h2>
            <span className="entity-kicker">{formatGroupId(group.id)}</span>
            <StatusBadge status={readiness?.ready ? "active" : "setup_incomplete"} />
            <span className="kiosk-settings-readiness-label">
              {readiness?.ready ? "Ready" : "Needs setup"}
            </span>
          </div>
          <p className="kiosk-settings-context">
            <strong>{group.name}</strong> — identification, confirmation, and exit security.
          </p>
        </div>
        <div className="header-actions header-actions-stable">
          <button type="button" className="btn-secondary" onClick={handleBack}>
            Back
          </button>
          <button
            type="submit"
            form="kiosk-settings-form"
            className="btn-primary"
            disabled={!dirty || saving}
            aria-disabled={!dirty || saving}
          >
            {saving ? "Saving…" : "Save Kiosk Settings"}
          </button>
        </div>
      </header>

      {readiness && !readiness.ready && (readiness.issues || []).length > 0 ? (
        <div className="kiosk-settings-status-banner" role="status">
          <strong>Needs setup</strong>
          <ul className="kiosk-settings-issues compact">
            {readiness.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : readiness?.ready ? (
        <div className="kiosk-settings-status-banner kiosk-settings-status-banner-ready" role="status">
          Ready to launch once Group setup is complete.
        </div>
      ) : null}

      {successMessage ? (
        <div className="alert alert-success kiosk-settings-save-notice" role="status">
          {successMessage}
        </div>
      ) : null}

      <ErrorBanner message={error} />

      <form id="kiosk-settings-form" className="kiosk-settings-layout" onSubmit={save}>
        <div className="kiosk-settings-top-row">
          <section className="kiosk-settings-card card-surface" aria-labelledby="ks-type-title">
            <div className="kiosk-settings-card-head">
              <h3 id="ks-type-title">Kiosk Type</h3>
              <p className="hint">Choose how participants identify themselves.</p>
            </div>
            <div className="kiosk-type-picker" role="radiogroup" aria-label="Kiosk type">
              {[
                { id: "card", label: "Card", hint: "Participants tap their card." },
                { id: "input", label: "Input", hint: "Participants enter their code." },
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
          </section>

          <section className="kiosk-settings-card card-surface" aria-labelledby="ks-exit-title">
            <div className="kiosk-settings-card-head">
              <h3 id="ks-exit-title">Exit Kiosk</h3>
              <p className="hint">Set the code used to leave live kiosk mode.</p>
            </div>
            <div className="kiosk-settings-exit-body">
              {settings.exit_code_configured && !changingExitCode ? (
                <div className="kiosk-exit-configured-panel">
                  <p className="kiosk-exit-status kiosk-exit-status-ok">
                    <span aria-hidden="true">✓</span> Exit code configured
                  </p>
                  <button
                    type="button"
                    className="btn-secondary btn-sm kiosk-exit-change-btn"
                    onClick={() => setChangingExitCode(true)}
                  >
                    Change exit code
                  </button>
                </div>
              ) : (
                <>
                  {!settings.exit_code_configured ? (
                    <p className="kiosk-exit-status kiosk-exit-status-required">Exit code required</p>
                  ) : null}
                  <Field label="Kiosk Exit Code">
                    <PasswordInput
                      value={form.exit_code}
                      onChange={(event) => patchForm({ exit_code: event.target.value })}
                      autoComplete="off"
                      name="kiosk-exit-code-new"
                    />
                  </Field>
                  <Field label="Confirm exit code">
                    <PasswordInput
                      value={form.exit_code_confirm}
                      onChange={(event) => patchForm({ exit_code_confirm: event.target.value })}
                      autoComplete="off"
                      name="kiosk-exit-code-confirm"
                    />
                  </Field>
                  <p className="hint kiosk-settings-helper">
                    4–10 letters or numbers. Used only to exit kiosk mode.
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
                      Cancel change
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
        >
          <div className="kiosk-settings-card-head">
            <h3 id="ks-identification-title">Identification</h3>
            <p className="hint">Configure how participants are shown or identified.</p>
          </div>

          {form.mode === "card" ? (
            <div className="kiosk-settings-ident-body">
              <div className="kiosk-settings-subsection">
                <h4>Card content</h4>
                <div className="kiosk-settings-option-stack">
                  <label className="ks-option-row">
                    <input
                      type="checkbox"
                      checked={form.card_show_name}
                      onChange={(event) => patchForm({ card_show_name: event.target.checked })}
                    />
                    <span>Name</span>
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
                      Group Participant Code
                      {pinForcedCode ? (
                        <span className="ks-option-meta">Required when PIN verification is enabled.</span>
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
                      Email
                      {!groupEmailOn ? (
                        <span className="ks-option-meta">
                          Enable Email in Group configuration to use it here.
                        </span>
                      ) : null}
                    </span>
                  </label>
                </div>
              </div>

              <div className="kiosk-settings-subsection">
                <h4>Participant verification</h4>
                <div className="kiosk-settings-option-stack">
                  <label className={`ks-option-row ${!groupPinOn ? "disabled-option" : ""}`}>
                    <input
                      type="checkbox"
                      checked={groupPinOn ? form.use_pin : false}
                      disabled={!groupPinOn}
                      onChange={(event) => patchForm({ use_pin: event.target.checked })}
                    />
                    <span>
                      Require PIN after card selection
                      {!groupPinOn ? (
                        <span className="ks-option-meta">
                          Enable PIN in Group configuration to use it here.
                        </span>
                      ) : null}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="kiosk-settings-ident-body">
              <div className="kiosk-settings-subsection">
                <h4>Number of input fields</h4>
                <div className="kiosk-segment-picker" role="radiogroup" aria-label="Input field count">
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
                      {count} field{count > 1 ? "s" : ""}
                    </label>
                  ))}
                </div>
              </div>

              <div className="kiosk-settings-subsection">
                <h4>Field configuration</h4>
                <div className="kiosk-field-config">
                  <div className="kiosk-field-config-row locked">
                    <div className="kiosk-field-config-label">Field 1</div>
                    <div className="kiosk-field-config-value">
                      <strong>Group Participant Code</strong>
                      <span className="kiosk-field-config-badge">Required</span>
                    </div>
                  </div>

                  {form.input_field_count === 1 ? (
                    <p className="hint kiosk-settings-helper">
                      One-field mode uses Group Participant Code.
                    </p>
                  ) : (
                    <div className="kiosk-field-config-row">
                      <div className="kiosk-field-config-label">Field 2</div>
                      <div className="kiosk-field-config-value">
                        <select
                          className="kiosk-field-select"
                          value={form.input_second_field}
                          onChange={(event) => patchForm({ input_second_field: event.target.value })}
                          aria-label="Field 2 identification option"
                        >
                          <option value="name">Name</option>
                          <option value="email" disabled={!groupEmailOn}>
                            Email{groupEmailOn ? "" : " (enable in Group config)"}
                          </option>
                          <option value="pin" disabled={!groupPinOn}>
                            PIN{groupPinOn ? "" : " (enable in Group config)"}
                          </option>
                        </select>
                        {!groupEmailOn ? (
                          <span className="ks-option-meta">
                            Enable Email in Group configuration to use it here.
                          </span>
                        ) : null}
                        {!groupPinOn ? (
                          <span className="ks-option-meta">
                            Enable PIN in Group configuration to use it here.
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
        >
          <div className="kiosk-settings-card-head">
            <h3 id="ks-attendance-reset-title">Attendance Reset</h3>
            <p className="hint">Choose when participants can start a new attendance cycle.</p>
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
        >
          <div className="kiosk-settings-card-head">
            <h3 id="ks-confirmation-title">Confirmation Screen</h3>
            <p className="hint">What participants see after a successful action.</p>
          </div>
          <KioskConfirmationSettings
            form={form}
            groupActions={settings.group_actions || {}}
            defaults={settings.confirmation_defaults || {}}
            groupName={group.name}
            kioskDesignConfig={kioskDesignConfig}
            onPatch={patchForm}
          />
        </section>
      </form>

      {resetDialogOpen ? (
        <ConfirmDialog
          title="Reset attendance cycle?"
          body="All participants in this Group will be able to start a new attendance cycle immediately. Existing attendance history will not be deleted."
          cancelLabel="Cancel"
          confirmLabel="Reset all participants"
          danger
          onCancel={() => setResetDialogOpen(false)}
          onConfirm={confirmResetNow}
        />
      ) : null}

      {leaveDialogOpen ? (
        <ConfirmDialog
          title="Unsaved kiosk settings"
          body={LEAVE_CONFIRM_MESSAGE}
          cancelLabel="Stay"
          confirmLabel="Leave without saving"
          danger
          onCancel={handleStay}
          onConfirm={handleLeaveWithoutSaving}
        />
      ) : null}
    </div>
  );
}
