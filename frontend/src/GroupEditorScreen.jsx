import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { api } from "./api.js";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import i18n from "./i18n/index.js";
import { usePageTitle } from "./i18n/usePageTitle.js";
import {
  ConfirmDialog,
  ErrorBanner,
  Field,
  PageHeader,
  PasswordInput,
  SectionCard,
  StatusBadge,
  Toggle,
} from "./components.jsx";
import {
  groupConfigFromApi,
  isGroupConfigDirty,
  normalizeGroupConfig,
} from "./groupEditorForm.js";
import { formatGroupId, setupIncompleteSummary } from "./groupForm.js";
import {
  setWorkspaceLeaveChecker,
  skipNextWorkspaceLeaveCheck,
} from "./kiosk/builder/workspaceLeaveGuard.js";
import {
  canCreateStructuredGroups,
  canUseGroupForwardEmails,
} from "./workspaceEntitlements.js";
import { groupEmailTutorialPanels } from "./groupEmailTutorial.js";

const PROVIDER_CUSTOM_SMTP = "custom_smtp";
const PROVIDER_GMAIL = "gmail";
const PROVIDER_MICROSOFT = "microsoft";
const PROVIDER_YAHOO = "yahoo";

const EMPTY_GROUP = {
  name: "",
  group_type: "standard",
  require_class_pin: false,
  forward_emails: [],
  actions: {
    check_in_enabled: true,
    check_out_enabled: false,
    breaks_enabled: false,
    max_breaks: 1,
  },
  participation: {
    email_required: false,
    pin_required: false,
  },
  notifications: {
    check_in: { send_email: false, email_template: "{name} checked in at {time}." },
    check_out: { send_email: false, email_template: "{name} checked out at {time}." },
    break: { send_email: false, email_template: "{name} started a break at {time}." },
  },
};

const EMPTY_SENDER = {
  configured: false,
  provider: PROVIDER_CUSTOM_SMTP,
  status: "not_configured",
  status_label: "Not configured",
  password_configured: false,
  smtp_host: "",
  smtp_port: 465,
  smtp_security: "ssl",
  smtp_username: "",
  gmail_address: "",
  microsoft_email: "",
  yahoo_email: "",
  from_email: "",
  from_name: "",
  last_tested_at: null,
  last_test_error: "",
};

const EMPTY_SENDER_FORM = {
  provider: PROVIDER_CUSTOM_SMTP,
  smtp_host: "",
  smtp_port: 465,
  smtp_security: "ssl",
  smtp_username: "",
  gmail_address: "",
  microsoft_email: "",
  yahoo_email: "",
  from_email: "",
  from_name: "",
  smtp_password: "",
  change_password: false,
};

const CREATE_BASELINE = cloneGroup(EMPTY_GROUP);

function cloneGroup(source) {
  return JSON.parse(JSON.stringify(source || EMPTY_GROUP));
}

function senderStatusBadge(status) {
  const map = {
    not_configured: "setup_incomplete",
    needs_verification: "setup_incomplete",
    ready: "active",
    error: "archived",
  };
  return map[status] || "setup_incomplete";
}

function senderStatusLabel(sender) {
  const labels = {
    not_configured: i18n.t("groups:editor.senderNotConfigured"),
    needs_verification: i18n.t("groups:editor.senderNeedsVerification"),
    ready: i18n.t("groups:editor.senderReady"),
    error: i18n.t("groups:editor.senderError"),
  };
  return labels[sender?.status] || sender?.status_label || i18n.t("groups:editor.senderNotConfigured");
}

export default function GroupEditorScreen({ session, groupId, onNavigate }) {
  const { t } = useTranslation(["groups", "common", "errors"]);
  const location = useLocation();
  const isEdit = Boolean(groupId);

  usePageTitle("pageTitles.groups", { ns: "workspace" });
  const structuredAllowed = canCreateStructuredGroups(session);
  const forwardEmailsAllowed = canUseGroupForwardEmails(session);
  const [values, setValues] = useState(cloneGroup(EMPTY_GROUP));
  const [readiness, setReadiness] = useState(null);
  const [emailSender, setEmailSender] = useState(EMPTY_SENDER);
  const [senderForm, setSenderForm] = useState({ ...EMPTY_SENDER_FORM });
  const [testEmail, setTestEmail] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [emailSenderOpen, setEmailSenderOpen] = useState(false);
  const [forwardEmailsOpen, setForwardEmailsOpen] = useState(false);
  const [draftVerified, setDraftVerified] = useState(false);
  const [draftStatus, setDraftStatus] = useState(""); // "" | "error" | "verified"
  const [draftError, setDraftError] = useState("");
  const [expandedAfterAction, setExpandedAfterAction] = useState("");
  const [error, setError] = useState("");
  const [senderMessage, setSenderMessage] = useState("");
  const [requireEmailNotice, setRequireEmailNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingSender, setSavingSender] = useState(false);
  const [testingSender, setTestingSender] = useState(false);
  const [pendingProvider, setPendingProvider] = useState("");
  const [showAppPasswordGuide, setShowAppPasswordGuide] = useState(false);
  const [showMicrosoftGuide, setShowMicrosoftGuide] = useState(false);
  const [showYahooGuide, setShowYahooGuide] = useState(false);
  const [savedBaseline, setSavedBaseline] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [planAccessDenied, setPlanAccessDenied] = useState(false);
  const skipLeaveConfirmRef = useRef(false);

  useEffect(() => {
    const panels = groupEmailTutorialPanels(location.search);
    if (panels.advanced) setAdvancedOpen(true);
    if (panels.sender) setEmailSenderOpen(true);
    if (panels.forwarding) setForwardEmailsOpen(true);
  }, [location.search]);

  const dirty = useMemo(() => {
    if (isEdit) {
      if (savedBaseline === null) {
        return false;
      }
      return isGroupConfigDirty(values, savedBaseline);
    }
    return isGroupConfigDirty(values, CREATE_BASELINE);
  }, [isEdit, savedBaseline, values]);

  const senderReady = emailSender.status === "ready";
  const isGmail = senderForm.provider === PROVIDER_GMAIL;
  const isMicrosoft = senderForm.provider === PROVIDER_MICROSOFT;
  const isYahoo = senderForm.provider === PROVIDER_YAHOO;

  function applyPersistedSender(payload) {
    const next = { ...EMPTY_SENDER, ...(payload || {}) };
    setEmailSender(next);
    setSenderForm({
      provider: next.provider || PROVIDER_CUSTOM_SMTP,
      smtp_host: next.smtp_host || "",
      smtp_port: next.smtp_port || 465,
      smtp_security: next.smtp_security || "ssl",
      smtp_username: next.smtp_username || "",
      gmail_address: next.gmail_address || (next.provider === PROVIDER_GMAIL ? next.from_email : "") || "",
      microsoft_email:
        next.microsoft_email ||
        (next.provider === PROVIDER_MICROSOFT ? next.from_email : "") ||
        "",
      yahoo_email:
        next.yahoo_email || (next.provider === PROVIDER_YAHOO ? next.from_email : "") || "",
      from_email: next.from_email || "",
      from_name: next.from_name || "",
      smtp_password: "",
      change_password: false,
    });
    setDraftVerified(false);
    setDraftStatus("");
    setDraftError("");
  }

  function clearDraftVerification() {
    setDraftVerified(false);
    setDraftStatus("");
    setDraftError("");
  }

  function patchSender(field, value) {
    setSenderForm((current) => ({ ...current, [field]: value }));
    if (field !== "from_name") {
      clearDraftVerification();
    }
  }

  function senderDraftIsDirty() {
    if (senderForm.provider !== emailSender.provider) return true;
    if (senderForm.change_password || senderForm.smtp_password) return true;
    if (senderForm.provider === PROVIDER_GMAIL) {
      return (
        (senderForm.gmail_address || "") !== (emailSender.gmail_address || emailSender.from_email || "")
      );
    }
    if (senderForm.provider === PROVIDER_MICROSOFT) {
      return (
        (senderForm.microsoft_email || "") !==
        (emailSender.microsoft_email || emailSender.from_email || "")
      );
    }
    if (senderForm.provider === PROVIDER_YAHOO) {
      return (
        (senderForm.yahoo_email || "") !== (emailSender.yahoo_email || emailSender.from_email || "")
      );
    }
    return (
      (senderForm.smtp_host || "") !== (emailSender.smtp_host || "") ||
      Number(senderForm.smtp_port) !== Number(emailSender.smtp_port || 0) ||
      (senderForm.smtp_security || "") !== (emailSender.smtp_security || "") ||
      (senderForm.smtp_username || "") !== (emailSender.smtp_username || "") ||
      (senderForm.from_email || "") !== (emailSender.from_email || "")
    );
  }

  function fromNameOnlyChange() {
    if (senderDraftIsDirty()) return false;
    return (senderForm.from_name || "") !== (emailSender.from_name || "");
  }

  function displayedSenderStatus() {
    if (draftStatus === "verified") {
      return { status: "ready", label: t("editor.senderVerifiedReady") };
    }
    if (draftStatus === "error") {
      return { status: "error", label: t("editor.senderError") };
    }
    if (senderDraftIsDirty()) {
      return { status: "needs_verification", label: t("editor.senderDraftNotSaved") };
    }
    return { status: emailSender.status, label: senderStatusLabel(emailSender) };
  }

  function buildSenderBody({ includePassword = true } = {}) {
    const body =
      senderForm.provider === PROVIDER_GMAIL
        ? {
            provider: PROVIDER_GMAIL,
            gmail_address: senderForm.gmail_address,
            from_name: senderForm.from_name,
          }
        : senderForm.provider === PROVIDER_MICROSOFT
          ? {
              provider: PROVIDER_MICROSOFT,
              microsoft_email: senderForm.microsoft_email,
              from_name: senderForm.from_name,
            }
          : senderForm.provider === PROVIDER_YAHOO
            ? {
                provider: PROVIDER_YAHOO,
                yahoo_email: senderForm.yahoo_email,
                from_name: senderForm.from_name,
              }
            : {
                provider: PROVIDER_CUSTOM_SMTP,
                smtp_host: senderForm.smtp_host,
                smtp_port: Number(senderForm.smtp_port) || null,
                smtp_security: senderForm.smtp_security,
                smtp_username: senderForm.smtp_username,
                from_email: senderForm.from_email,
                from_name: senderForm.from_name,
              };
    const providerChanged = senderForm.provider !== emailSender.provider;
    const needsPassword =
      includePassword &&
      (providerChanged ||
        senderForm.change_password ||
        Boolean(senderForm.smtp_password) ||
        !emailSender.password_configured ||
        senderDraftIsDirty());
    if (needsPassword && (senderForm.smtp_password || senderForm.change_password || providerChanged || !emailSender.password_configured)) {
      body.change_password = true;
      body.smtp_password = senderForm.smtp_password;
    }
    return body;
  }

  function canSaveSender() {
    if (savingSender) return false;
    if (fromNameOnlyChange() && senderReady) return true;
    return draftVerified;
  }

  useEffect(() => {
    if (!groupId) {
      return;
    }
    setError("");
    setPlanAccessDenied(false);
    setSuccessMessage("");
    api
      .getGroup(session, groupId)
      .then((result) => {
        const group = result.data;
        if (group.status === "archived") {
          skipNextWorkspaceLeaveCheck();
          onNavigate({ name: "groups", status: "archived", replace: true });
          return;
        }
        const config = groupConfigFromApi(group, EMPTY_GROUP);
        setValues(config);
        setSavedBaseline(config);
        setReadiness(group.readiness || null);
        applyPersistedSender(group.advanced?.email_sender);
      })
      .catch((loadError) => {
        if (loadError?.status === 403 && loadError?.data?.code === "plan_resource_locked") {
          setPlanAccessDenied(true);
          return;
        }
        setError(localizedErrorMessage(loadError, t));
      });
  }, [groupId, onNavigate, session]);

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
      return window.confirm(t("editor.leaveConfirm"));
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

  const payload = useMemo(() => normalizeGroupConfig(values), [values]);

  function patch(path, value) {
    setValues((current) => {
      const next = cloneGroup(current);
      const parts = path.split(".");
      let cursor = next;
      for (const part of parts.slice(0, -1)) {
        cursor = cursor[part];
      }
      cursor[parts.at(-1)] = value;
      return next;
    });
  }

  function forwardEmailSlots() {
    const emails = values.forward_emails || [];
    return emails.length > 0 ? emails : [""];
  }

  function setForwardEmailSlots(nextSlots) {
    setValues((current) => ({
      ...current,
      forward_emails: nextSlots,
    }));
  }

  function updateForwardEmail(index, value) {
    const slots = [...forwardEmailSlots()];
    slots[index] = value;
    setForwardEmailSlots(slots);
  }

  function addForwardEmail() {
    const slots = [...forwardEmailSlots()];
    if (slots.length >= 3) return;
    slots.push("");
    setForwardEmailSlots(slots);
  }

  function removeForwardEmail(index) {
    const slots = [...forwardEmailSlots()];
    if (slots.length <= 1) {
      setForwardEmailSlots([""]);
      return;
    }
    slots.splice(index, 1);
    setForwardEmailSlots(slots.length ? slots : [""]);
  }

  const configuredForwardCount = (values.forward_emails || []).filter((email) =>
    String(email || "").trim()
  ).length;
  const forwardEmailSummary =
    configuredForwardCount === 0
      ? t("editor.forwardNone")
      : t("editor.forwardConfigured", { count: configuredForwardCount });
  const forwardSlots = forwardEmailSlots();
  const forwardNumbered = forwardSlots.length > 1;

  function enableAfterAction(path, checked) {
    if (checked && !senderReady) {
      return;
    }
    patch(path, checked);
    if (checked && !values.participation.email_required) {
      patch("participation.email_required", true);
      setRequireEmailNotice(t("editor.requireEmailNotice"));
    }
  }

  function blankFormForProvider(provider) {
    if (provider === PROVIDER_GMAIL) {
      return {
        ...EMPTY_SENDER_FORM,
        provider: PROVIDER_GMAIL,
        smtp_port: "",
        smtp_security: "",
      };
    }
    if (provider === PROVIDER_MICROSOFT) {
      return {
        ...EMPTY_SENDER_FORM,
        provider: PROVIDER_MICROSOFT,
        smtp_port: "",
        smtp_security: "",
      };
    }
    if (provider === PROVIDER_YAHOO) {
      return {
        ...EMPTY_SENDER_FORM,
        provider: PROVIDER_YAHOO,
        smtp_port: "",
        smtp_security: "",
      };
    }
    return { ...EMPTY_SENDER_FORM, provider: PROVIDER_CUSTOM_SMTP };
  }

  function requestProviderChange(nextProvider) {
    if (nextProvider === senderForm.provider) {
      return;
    }
    const hasSecretOrConfig =
      emailSender.password_configured ||
      emailSender.configured ||
      Boolean(senderForm.smtp_password) ||
      Boolean(senderForm.smtp_host) ||
      Boolean(senderForm.gmail_address) ||
      Boolean(senderForm.microsoft_email) ||
      Boolean(senderForm.yahoo_email);
    if (hasSecretOrConfig) {
      setPendingProvider(nextProvider);
      return;
    }
    setSenderForm(blankFormForProvider(nextProvider));
    clearDraftVerification();
    setSenderMessage("");
  }

  function confirmProviderChange() {
    if (!pendingProvider) {
      return;
    }
    setSenderForm(blankFormForProvider(pendingProvider));
    setPendingProvider("");
    clearDraftVerification();
    setSenderMessage("");
  }

  function onSecurityChange(nextSecurity) {
    setSenderForm((current) => {
      const next = { ...current, smtp_security: nextSecurity };
      const port = Number(current.smtp_port);
      if (nextSecurity === "ssl" && (port === 587 || !port)) {
        next.smtp_port = 465;
      } else if (nextSecurity === "starttls" && (port === 465 || !port)) {
        next.smtp_port = 587;
      }
      return next;
    });
    clearDraftVerification();
  }

  function navigateAway() {
    skipLeaveConfirmRef.current = true;
    skipNextWorkspaceLeaveCheck();
    if (isEdit) {
      onNavigate({ name: "group-detail", groupId });
      return;
    }
    onNavigate({ name: "groups" });
  }

  function handleStay() {
    setLeaveDialogOpen(false);
  }

  function handleLeaveWithoutSaving() {
    setLeaveDialogOpen(false);
    navigateAway();
  }

  function handleBack() {
    if (!dirty) {
      navigateAway();
      return;
    }
    setLeaveDialogOpen(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isEdit && (!dirty || saving)) {
      return;
    }
    setSaving(true);
    setError("");
    setSuccessMessage("");
    try {
      if (isEdit) {
        const updated = await api.updateGroup(session, groupId, payload);
        const next = groupConfigFromApi(updated.data, EMPTY_GROUP);
        setValues(next);
        setSavedBaseline(next);
        setReadiness(updated.data.readiness || null);
        if (updated.data.require_email_enabled_for_after_action) {
          setRequireEmailNotice(t("editor.requireEmailNotice"));
        }
        setSuccessMessage(t("editor.saved"));
      } else {
        const created = await api.createGroup(session, payload);
        skipLeaveConfirmRef.current = true;
        skipNextWorkspaceLeaveCheck();
        onNavigate({ name: "group-detail", groupId: created.data.id });
      }
    } catch (saveError) {
      setError(localizedErrorMessage(saveError, t));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSender(event) {
    event.preventDefault();
    if (!isEdit || !canSaveSender()) {
      return;
    }
    setSavingSender(true);
    setSenderMessage("");
    setError("");
    try {
      const body = buildSenderBody({ includePassword: true });
      const result = await api.updateGroupEmailSender(session, groupId, body);
      applyPersistedSender(result.data);
      setSenderMessage(
        result.data.status === "ready"
          ? t("editor.senderSavedActive")
          : t("editor.senderSaved"),
      );
    } catch (saveError) {
      setError(localizedErrorMessage(saveError, t));
    } finally {
      setSavingSender(false);
    }
  }

  async function handleTestSender(event) {
    event.preventDefault();
    if (!isEdit) {
      return;
    }
    setTestingSender(true);
    setSenderMessage("");
    setError("");
    setDraftError("");
    try {
      const draft = buildSenderBody({ includePassword: true });
      const result = await api.testGroupEmailSender(session, groupId, {
        to_email: testEmail,
        ...draft,
      });
      // Keep persisted sender as returned (unchanged on draft test).
      if (result.data.email_sender) {
        setEmailSender({ ...EMPTY_SENDER, ...result.data.email_sender });
      }
      setDraftVerified(Boolean(result.data.draft_verified));
      setDraftStatus(result.data.draft_verified ? "verified" : "");
      setSenderMessage(
        result.data.detail || t("editor.testSentHint"),
      );
    } catch (testError) {
      setDraftVerified(false);
      setDraftStatus("error");
      setDraftError(localizedErrorMessage(testError, t));
      setError("");
      // Refresh persisted sender only — do not apply failed draft as saved config.
      try {
        const refreshed = await api.getGroupEmailSender(session, groupId);
        setEmailSender({ ...EMPTY_SENDER, ...refreshed.data });
      } catch {
        /* ignore refresh failure */
      }
    } finally {
      setTestingSender(false);
    }
  }

  const actions = values.actions;
  const participation = values.participation;
  const notifications = values.notifications;
  const setupSummary = setupIncompleteSummary(readiness);
  const statusMessages = [error, setupSummary, requireEmailNotice].filter(Boolean);
  const afterActionDisabled = !senderReady;
  const senderDisplay = displayedSenderStatus();

  if (isEdit && planAccessDenied) {
    return (
      <div className="page">
        <div className="plan-locked-banner plan-locked-page" role="alert">
          <span className="plan-locked-badge">{t("planLocked")}</span>
          <strong>{t("detail.planLockedPageTitle")}</strong>
          <p className="hint">{t("detail.planLockedEditorHint")}</p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              skipNextWorkspaceLeaveCheck();
              onNavigate({ name: "groups" });
            }}
          >
            {t("backToGroups")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={isEdit ? t("editor.editTitle") : t("editor.createTitle")}
        meta={
          isEdit ? (
            <>
              <span className="entity-kicker">{formatGroupId(groupId)}</span>
              {readiness && !readiness.setup_complete ? (
                <StatusBadge status="setup_incomplete" />
              ) : (
                <StatusBadge status="active" />
              )}
            </>
          ) : null
        }
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={handleBack}>
              {t("common:back")}
            </button>
            <button
              type="submit"
              form="group-editor-form"
              className="btn-primary"
              disabled={isEdit ? !dirty || saving || savedBaseline === null : saving}
              aria-disabled={isEdit ? !dirty || saving || savedBaseline === null : saving}
            >
              {saving ? t("editor.saving") : isEdit ? t("editor.saveGroup") : t("createGroup")}
            </button>
          </>
        }
      />

      {successMessage ? (
        <div className="alert alert-success kiosk-settings-save-notice" role="status">
          {successMessage}
        </div>
      ) : null}

      {statusMessages.length ? (
        <div className="editor-status-area">
          {error ? <ErrorBanner message={error} /> : null}
          {setupSummary ? (
            <div className="alert alert-warning" role="status">
              {t("editor.setupIncompletePrefix")} {setupSummary}
            </div>
          ) : null}
          {requireEmailNotice ? (
            <div className="alert alert-info" role="status">
              {requireEmailNotice}
            </div>
          ) : null}
        </div>
      ) : null}

      <form
        id="group-editor-form"
        className="group-form group-form-dashboard"
        data-tutorial-target="group-editor-form"
        onSubmit={handleSubmit}
      >
        {!isEdit ? (
          <SectionCard
            title={t("editor.groupType")}
            className="section-group-type"
            tutorialTarget="group-editor-type"
          >
            <div className="group-type-selector" role="radiogroup" aria-label={t("editor.groupTypeAria")}>
              <button
                type="button"
                className="group-type-option"
                role="radio"
                aria-checked={values.group_type === "standard"}
                data-selected={values.group_type === "standard" ? "true" : "false"}
                onClick={() =>
                  setValues((current) => ({
                    ...current,
                    group_type: "standard",
                    require_class_pin: false,
                  }))
                }
              >
                <strong>{t("type.standardShort")}</strong>
                <span>{t("type.standardDescription")}</span>
              </button>
              <button
                type="button"
                className={`group-type-option${structuredAllowed ? "" : " is-plan-locked"}`}
                role="radio"
                aria-checked={values.group_type === "structured"}
                data-selected={values.group_type === "structured" ? "true" : "false"}
                disabled={!structuredAllowed}
                title={structuredAllowed ? undefined : t("type.structuredPlanRequired")}
                onClick={() => {
                  if (!structuredAllowed) return;
                  setValues((current) => ({
                    ...current,
                    group_type: "structured",
                  }));
                }}
              >
                <strong>{t("type.structuredShort")}</strong>
                <span>
                  {structuredAllowed
                    ? t("type.structuredDescription")
                    : t("type.structuredLocked")}
                </span>
              </button>
            </div>
          </SectionCard>
        ) : (
          <SectionCard title={t("editor.groupType")} className="section-group-type">
            <p className="hint">
              {t("type.immutableHint", {
                type:
                  values.group_type === "structured"
                    ? t("type.structured")
                    : t("type.standard"),
              })}
            </p>
          </SectionCard>
        )}

        <SectionCard
          title={t("editor.groupName")}
          className="section-name"
          tutorialTarget="group-editor-name"
        >
          <Field label={t("editor.nameField")}>
            <input
              value={values.name}
              onChange={(event) => patch("name", event.target.value)}
              required
            />
          </Field>
        </SectionCard>

        <SectionCard
          title={t("editor.actionsTitle")}
          description={t("editor.actionsDescription")}
          className="section-actions"
          tutorialTarget="group-editor-actions"
        >
          <div className="toggle-grid toggle-grid-compact">
            <Toggle
              label={t("actions.checkIn")}
              checked={actions.check_in_enabled}
              onChange={(checked) => patch("actions.check_in_enabled", checked)}
            />
            <Toggle
              label={t("actions.checkOut")}
              checked={actions.check_out_enabled}
              onChange={(checked) => patch("actions.check_out_enabled", checked)}
            />
            <Toggle
              label={t("editor.breaks")}
              checked={actions.breaks_enabled}
              onChange={(checked) => patch("actions.breaks_enabled", checked)}
            />
          </div>
          {actions.breaks_enabled ? (
            <Field label={t("editor.maxBreaks")}>
              <div className="max-breaks-control" role="radiogroup" aria-label={t("editor.maxBreaksAria")}>
                {[1, 2, 3].map((count) => (
                  <button
                    key={count}
                    type="button"
                    className="max-breaks-option"
                    role="radio"
                    aria-checked={actions.max_breaks === count}
                    data-selected={actions.max_breaks === count ? "true" : "false"}
                    onClick={() => patch("actions.max_breaks", count)}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}
        </SectionCard>

        <SectionCard
          title={
            isEdit
              ? t("editor.participationTitle")
              : t("editor.participationTitle", { context: "create" })
          }
          description={
            isEdit
              ? t("editor.participationDescription")
              : t("editor.participationDescription", { context: "create" })
          }
          className="section-participation"
          tutorialTarget="group-editor-participation"
        >
          <div className="toggle-grid toggle-grid-compact toggle-grid-stack">
            <Toggle
              label={t("editor.requireEmail")}
              checked={participation.email_required}
              onChange={(checked) => {
                patch("participation.email_required", checked);
                if (!checked) {
                  setRequireEmailNotice("");
                }
              }}
            />
            <Toggle
              label={t("editor.requirePin")}
              checked={participation.pin_required}
              onChange={(checked) => patch("participation.pin_required", checked)}
            />
            {values.group_type === "structured" ? (
              <Toggle
                label={t("editor.requireClassPin")}
                checked={Boolean(values.require_class_pin)}
                onChange={(checked) => patch("require_class_pin", checked)}
              />
            ) : null}
          </div>
          {values.group_type === "structured" ? (
            <p className="hint">{t("editor.classPinHint")}</p>
          ) : null}
        </SectionCard>

        <SectionCard
          title={t("editor.afterActionTitle")}
          description={t("editor.afterActionDescription")}
          className={`section-after-action${afterActionDisabled ? " is-disabled" : ""}`}
          tutorialTarget="group-editor-after-action"
        >
          {afterActionDisabled ? (
            <p className="hint after-action-blocked">{t("editor.afterActionBlocked")}</p>
          ) : null}
          {!actions.check_in_enabled &&
          !actions.check_out_enabled &&
          !actions.breaks_enabled ? (
            <p className="hint">{t("editor.afterActionEnableHint")}</p>
          ) : (
            <div className="after-action-accordion" aria-disabled={afterActionDisabled}>
              {actions.check_in_enabled ? (
                <AfterActionRow
                  title={t("editor.afterCheckIn")}
                  expanded={expandedAfterAction === "check_in"}
                  onToggle={() =>
                    setExpandedAfterAction((current) =>
                      current === "check_in" ? "" : "check_in"
                    )
                  }
                  setting={notifications.check_in}
                  disabled={afterActionDisabled}
                  onEnable={(checked) =>
                    enableAfterAction("notifications.check_in.send_email", checked)
                  }
                  onTemplate={(value) => patch("notifications.check_in.email_template", value)}
                />
              ) : null}
              {actions.check_out_enabled ? (
                <AfterActionRow
                  title={t("editor.afterCheckOut")}
                  expanded={expandedAfterAction === "check_out"}
                  onToggle={() =>
                    setExpandedAfterAction((current) =>
                      current === "check_out" ? "" : "check_out"
                    )
                  }
                  setting={notifications.check_out}
                  disabled={afterActionDisabled}
                  onEnable={(checked) =>
                    enableAfterAction("notifications.check_out.send_email", checked)
                  }
                  onTemplate={(value) => patch("notifications.check_out.email_template", value)}
                />
              ) : null}
              {actions.breaks_enabled ? (
                <AfterActionRow
                  title={t("editor.afterBreak")}
                  expanded={expandedAfterAction === "break"}
                  onToggle={() =>
                    setExpandedAfterAction((current) => (current === "break" ? "" : "break"))
                  }
                  setting={notifications.break}
                  disabled={afterActionDisabled}
                  onEnable={(checked) =>
                    enableAfterAction("notifications.break.send_email", checked)
                  }
                  onTemplate={(value) => patch("notifications.break.email_template", value)}
                />
              ) : null}
            </div>
          )}
        </SectionCard>

        <section className="section-card section-advanced" data-tutorial-target="group-email-settings">
          <header className="advanced-header">
            <div>
              <h2>{t("editor.advanced")}</h2>
              <p>{t("editor.advancedDescription")}</p>
            </div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              data-tutorial-target="group-email-advanced-toggle"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              {advancedOpen ? t("editor.hide") : t("editor.show")}
            </button>
          </header>
          {advancedOpen ? (
            <div className="advanced-body compact">
              <div className={`advanced-subsection${emailSenderOpen ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="advanced-subsection-toggle"
                  aria-expanded={emailSenderOpen}
                  onClick={() => setEmailSenderOpen((open) => !open)}
                >
                  <span className="advanced-subsection-copy">
                    <span className="advanced-subsection-title">{t("editor.emailSender")}</span>
                    <span className="advanced-subsection-hint">{t("editor.emailSenderHint")}</span>
                  </span>
                  <span className="advanced-subsection-meta">
                    <span className="advanced-subsection-summary">{senderDisplay.label}</span>
                    <span className="advanced-subsection-action">
                      {emailSenderOpen ? t("editor.hide") : t("editor.show")}
                    </span>
                  </span>
                </button>
                {emailSenderOpen ? (
                  <div className="advanced-subsection-body">
                    {!isEdit ? (
                      <p className="hint">{t("editor.saveGroupFirst")}</p>
                    ) : (
                      <>
                    <div
                      className="email-sender-status-row"
                      data-tutorial-target="group-email-sender"
                    >
                      <Field label={t("editor.provider")}>
                        <select
                          value={senderForm.provider}
                          onChange={(event) => requestProviderChange(event.target.value)}
                        >
                          <option value={PROVIDER_CUSTOM_SMTP}>{t("editor.providerCustomSmtp")}</option>
                          <option value={PROVIDER_GMAIL}>{t("editor.providerGmail")}</option>
                          <option value={PROVIDER_MICROSOFT}>{t("editor.providerMicrosoft")}</option>
                          <option value={PROVIDER_YAHOO}>{t("editor.providerYahoo")}</option>
                        </select>
                      </Field>
                      <div className="email-sender-badge">
                        <span className="field-label">{t("editor.status")}</span>
                        <StatusBadge status={senderStatusBadge(senderDisplay.status)}>
                          {senderDisplay.label}
                        </StatusBadge>
                      </div>
                    </div>
                    {isGmail ? (
                      <p className="hint">{t("editor.gmailHint")}</p>
                    ) : isMicrosoft ? (
                      <div className="alert alert-warning email-sender-availability" role="status">
                        <strong>{t("editor.microsoftAvailabilityTitle")}</strong>
                        <p>{t("editor.microsoftAvailabilityP1")}</p>
                        <p>{t("editor.microsoftAvailabilityP2")}</p>
                        <p>{t("editor.microsoftAvailabilityP3")}</p>
                        <p className="email-sender-availability-alt">{t("editor.microsoftAvailabilityAlt")}</p>
                      </div>
                    ) : isYahoo ? (
                      <p className="hint">{t("editor.yahooHint")}</p>
                    ) : (
                      <p className="hint">{t("editor.customSmtpHint")}</p>
                    )}
                    {senderMessage ? (
                      <div className="alert alert-info" role="status">
                        {senderMessage}
                      </div>
                    ) : null}
                    {draftError ? (
                      <div className="alert alert-warning" role="alert">
                        {draftError}
                      </div>
                    ) : null}
                    {!draftError &&
                    emailSender.last_test_error &&
                    emailSender.status === "error" &&
                    !senderDraftIsDirty() ? (
                      <div className="alert alert-warning" role="status">
                        {emailSender.last_test_error}
                      </div>
                    ) : null}
                    {isGmail ? (
                      <div className="email-sender-fields">
                        <Field label={t("editor.gmailAddress")}>
                          <input
                            type="email"
                            value={senderForm.gmail_address}
                            onChange={(event) =>
                              patchSender("gmail_address", event.target.value)
                            }
                            placeholder="user@gmail.com"
                            autoComplete="off"
                          />
                        </Field>
                        <Field label={t("editor.appPassword")}>
                          {emailSender.password_configured &&
                          emailSender.provider === PROVIDER_GMAIL &&
                          !senderForm.change_password ? (
                            <div className="password-configured-row">
                              <span className="hint">{t("editor.configured")}</span>
                              <button
                                type="button"
                                className="btn-link btn-sm"
                                onClick={() => patchSender("change_password", true)}
                              >
                                {t("editor.changeAppPassword")}
                              </button>
                            </div>
                          ) : (
                            <PasswordInput
                              value={senderForm.smtp_password}
                              onChange={(event) =>
                                patchSender("smtp_password", event.target.value)
                              }
                              autoComplete="new-password"
                              placeholder={
                                emailSender.password_configured &&
                                emailSender.provider === PROVIDER_GMAIL
                                  ? t("editor.enterNewAppPassword")
                                  : t("editor.googleAppPassword")
                              }
                            />
                          )}
                        </Field>
                        <button
                          type="button"
                          className="btn-link email-sender-help-link"
                          onClick={() => setShowAppPasswordGuide(true)}
                        >
                          {t("editor.gmailAppPasswordGuide")}
                        </button>
                        {senderForm.gmail_address ? (
                          <Field label={t("editor.senderEmail")}>
                            <input
                              type="email"
                              value={senderForm.gmail_address}
                              readOnly
                              className="input-readonly"
                            />
                          </Field>
                        ) : null}
                        <Field label={t("editor.fromNameOptional")}>
                          <input
                            value={senderForm.from_name}
                            onChange={(event) =>
                              patchSender("from_name", event.target.value)
                            }
                            placeholder="CheckStation"
                          />
                        </Field>
                      </div>
                    ) : isMicrosoft ? (
                      <div className="email-sender-fields">
                        <Field label={t("editor.microsoftEmail")}>
                          <input
                            type="email"
                            value={senderForm.microsoft_email}
                            onChange={(event) =>
                              patchSender("microsoft_email", event.target.value)
                            }
                            placeholder="name@company.com"
                            autoComplete="off"
                          />
                        </Field>
                        <Field
                          label={t("editor.passwordAppPassword")}
                          hint={t("editor.microsoftPasswordHint")}
                        >
                          {emailSender.password_configured &&
                          emailSender.provider === PROVIDER_MICROSOFT &&
                          !senderForm.change_password ? (
                            <div className="password-configured-row">
                              <span className="hint">{t("editor.configured")}</span>
                              <button
                                type="button"
                                className="btn-link btn-sm"
                                onClick={() => patchSender("change_password", true)}
                              >
                                {t("editor.changePassword")}
                              </button>
                            </div>
                          ) : (
                            <PasswordInput
                              value={senderForm.smtp_password}
                              onChange={(event) =>
                                patchSender("smtp_password", event.target.value)
                              }
                              autoComplete="new-password"
                              placeholder={
                                emailSender.password_configured &&
                                emailSender.provider === PROVIDER_MICROSOFT
                                  ? t("editor.enterNewPassword")
                                  : t("editor.passwordOrAppPassword")
                              }
                            />
                          )}
                        </Field>
                        <button
                          type="button"
                          className="btn-link email-sender-help-link"
                          onClick={() => setShowMicrosoftGuide(true)}
                        >
                          {t("editor.microsoftGuide")}
                        </button>
                        {senderForm.microsoft_email ? (
                          <Field label={t("editor.senderEmail")}>
                            <input
                              type="email"
                              value={senderForm.microsoft_email}
                              readOnly
                              className="input-readonly"
                            />
                          </Field>
                        ) : null}
                        <Field label={t("editor.fromNameOptional")}>
                          <input
                            value={senderForm.from_name}
                            onChange={(event) =>
                              patchSender("from_name", event.target.value)
                            }
                            placeholder="CheckStation"
                          />
                        </Field>
                      </div>
                    ) : isYahoo ? (
                      <div className="email-sender-fields">
                        <Field label={t("editor.yahooEmail")}>
                          <input
                            type="email"
                            value={senderForm.yahoo_email}
                            onChange={(event) =>
                              patchSender("yahoo_email", event.target.value)
                            }
                            placeholder="example@yahoo.com"
                            autoComplete="off"
                          />
                        </Field>
                        <Field
                          label={t("editor.appPassword")}
                          hint={t("editor.yahooAppPasswordHint")}
                        >
                          {emailSender.password_configured &&
                          emailSender.provider === PROVIDER_YAHOO &&
                          !senderForm.change_password ? (
                            <div className="password-configured-row">
                              <span className="hint">{t("editor.configured")}</span>
                              <button
                                type="button"
                                className="btn-link btn-sm"
                                onClick={() => patchSender("change_password", true)}
                              >
                                {t("editor.changeAppPassword")}
                              </button>
                            </div>
                          ) : (
                            <PasswordInput
                              value={senderForm.smtp_password}
                              onChange={(event) =>
                                patchSender("smtp_password", event.target.value)
                              }
                              autoComplete="new-password"
                              placeholder={
                                emailSender.password_configured &&
                                emailSender.provider === PROVIDER_YAHOO
                                  ? t("editor.enterNewYahooAppPassword")
                                  : t("editor.yahooAppPassword")
                              }
                            />
                          )}
                        </Field>
                        <button
                          type="button"
                          className="btn-link email-sender-help-link"
                          onClick={() => setShowYahooGuide(true)}
                        >
                          {t("editor.yahooAppPasswordGuide")}
                        </button>
                        {senderForm.yahoo_email ? (
                          <Field label={t("editor.senderEmail")}>
                            <input
                              type="email"
                              value={senderForm.yahoo_email}
                              readOnly
                              className="input-readonly"
                            />
                          </Field>
                        ) : null}
                        <Field label={t("editor.fromNameOptional")}>
                          <input
                            value={senderForm.from_name}
                            onChange={(event) =>
                              patchSender("from_name", event.target.value)
                            }
                            placeholder="CheckStation"
                          />
                        </Field>
                      </div>
                    ) : (
                      <div className="email-sender-fields">
                        <Field label={t("editor.smtpHost")}>
                          <input
                            value={senderForm.smtp_host}
                            onChange={(event) => patchSender("smtp_host", event.target.value)}
                            placeholder="smtp.example.com"
                            autoComplete="off"
                          />
                        </Field>
                        <div className="email-sender-row">
                          <Field label={t("editor.port")}>
                            <input
                              type="number"
                              min="1"
                              max="65535"
                              value={senderForm.smtp_port}
                              onChange={(event) => patchSender("smtp_port", event.target.value)}
                            />
                          </Field>
                          <Field
                            label={t("editor.security")}
                            hint={
                              senderForm.smtp_security === "ssl"
                                ? t("editor.securitySslHint")
                                : senderForm.smtp_security === "starttls"
                                  ? t("editor.securityStarttlsHint")
                                  : senderForm.smtp_security === "none"
                                    ? t("editor.securityNoneHint")
                                    : ""
                            }
                          >
                            <select
                              value={senderForm.smtp_security}
                              onChange={(event) => onSecurityChange(event.target.value)}
                            >
                              <option value="ssl">{t("editor.securitySsl")}</option>
                              <option value="starttls">{t("editor.securityStarttls")}</option>
                              <option value="none">{t("editor.securityNone")}</option>
                            </select>
                          </Field>
                        </div>
                        {senderForm.smtp_security === "none" ? (
                          <p className="hint warning-hint">{t("editor.securityNoneWarning")}</p>
                        ) : null}
                        <Field label={t("editor.username")}>
                          <input
                            value={senderForm.smtp_username}
                            onChange={(event) =>
                              patchSender("smtp_username", event.target.value)
                            }
                            autoComplete="off"
                          />
                        </Field>
                        <Field label={t("editor.password")}>
                          {emailSender.password_configured &&
                          emailSender.provider === PROVIDER_CUSTOM_SMTP &&
                          !senderForm.change_password ? (
                            <div className="password-configured-row">
                              <span className="hint">{t("editor.configured")}</span>
                              <button
                                type="button"
                                className="btn-link btn-sm"
                                onClick={() => patchSender("change_password", true)}
                              >
                                {t("editor.changePassword")}
                              </button>
                            </div>
                          ) : (
                            <PasswordInput
                              value={senderForm.smtp_password}
                              onChange={(event) =>
                                patchSender("smtp_password", event.target.value)
                              }
                              autoComplete="new-password"
                              placeholder={
                                emailSender.password_configured &&
                                emailSender.provider === PROVIDER_CUSTOM_SMTP
                                  ? t("editor.enterNewSmtpPassword")
                                  : t("editor.smtpPassword")
                              }
                            />
                          )}
                        </Field>
                        <div className="email-sender-row">
                          <Field
                            label={t("editor.fromEmail")}
                            hint={t("editor.fromEmailHint")}
                          >
                            <input
                              type="email"
                              value={senderForm.from_email}
                              onChange={(event) =>
                                patchSender("from_email", event.target.value)
                              }
                            />
                          </Field>
                          <Field label={t("editor.fromNameOptional")}>
                            <input
                              value={senderForm.from_name}
                              onChange={(event) =>
                                patchSender("from_name", event.target.value)
                              }
                            />
                          </Field>
                        </div>
                      </div>
                    )}
                    <div className="email-sender-test">
                      <Field label={t("editor.sendTestEmail")}>
                        <div className="email-sender-test-row">
                          <input
                            type="email"
                            value={testEmail}
                            onChange={(event) => setTestEmail(event.target.value)}
                            placeholder="you@example.com"
                          />
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={testingSender || !testEmail}
                            onClick={handleTestSender}
                          >
                            {testingSender ? t("editor.sending") : t("editor.sendTest")}
                          </button>
                        </div>
                      </Field>
                      <p className="hint">{t("editor.testVerifyHint")}</p>
                    </div>
                    <div className="email-sender-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={!canSaveSender()}
                        onClick={handleSaveSender}
                      >
                        {savingSender ? t("editor.saving") : t("editor.saveSender")}
                      </button>
                    </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>

              <div className={`advanced-subsection${forwardEmailsOpen ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="advanced-subsection-toggle"
                  data-tutorial-target="group-forward-emails"
                  aria-expanded={forwardEmailsOpen}
                  onClick={() => setForwardEmailsOpen((open) => !open)}
                >
                  <span className="advanced-subsection-copy">
                    <span className="advanced-subsection-title">{t("editor.forwardEmails")}</span>
                    <span className="advanced-subsection-hint">
                      {forwardEmailsAllowed
                        ? t("editor.forwardEmailsHint")
                        : t("editor.forwardEmailsLockedHint")}
                    </span>
                  </span>
                  <span className="advanced-subsection-meta">
                    <span className="advanced-subsection-summary">
                      {forwardEmailsAllowed ? forwardEmailSummary : t("editor.forwardLocked")}
                    </span>
                    <span className="advanced-subsection-action">
                      {forwardEmailsOpen ? t("editor.hide") : t("editor.show")}
                    </span>
                  </span>
                </button>
                {forwardEmailsOpen ? (
                  <div className="advanced-subsection-body forward-emails-body">
                    {!forwardEmailsAllowed ? (
                      <p className="plan-lock-note" role="status">
                        {t("editor.forwardBasicLock")}
                      </p>
                    ) : (
                      <>
                        {forwardSlots.map((email, index) => (
                          <div key={`forward-email-${index}`} className="forward-email-row">
                            <Field
                              label={
                                forwardNumbered
                                  ? t("editor.forwardEmailNumbered", { number: index + 1 })
                                  : t("editor.forwardEmail")
                              }
                            >
                              <div className="forward-email-input-row">
                                <input
                                  type="email"
                                  value={email}
                                  onChange={(event) =>
                                    updateForwardEmail(index, event.target.value)
                                  }
                                  placeholder="email@example.com"
                                  autoComplete="off"
                                />
                                {forwardNumbered && index > 0 ? (
                                  <button
                                    type="button"
                                    className="btn-text"
                                    onClick={() => removeForwardEmail(index)}
                                  >
                                    {t("common:remove")}
                                  </button>
                                ) : null}
                              </div>
                            </Field>
                          </div>
                        ))}
                        {forwardSlots.length < 3 ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={addForwardEmail}
                          >
                            {t("editor.addAnotherForwardEmail")}
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </form>
      {pendingProvider ? (
        <ConfirmDialog
          title={t("editor.switchProviderTitle")}
          body={t("editor.switchProviderBody")}
          confirmLabel={t("editor.switchProviderConfirm")}
          danger
          onCancel={() => setPendingProvider("")}
          onConfirm={confirmProviderChange}
        />
      ) : null}
      {showAppPasswordGuide ? (
        <GmailAppPasswordGuide onClose={() => setShowAppPasswordGuide(false)} />
      ) : null}
      {showMicrosoftGuide ? (
        <MicrosoftSmtpGuide onClose={() => setShowMicrosoftGuide(false)} />
      ) : null}
      {showYahooGuide ? (
        <YahooAppPasswordGuide onClose={() => setShowYahooGuide(false)} />
      ) : null}
      {leaveDialogOpen ? (
        <ConfirmDialog
          title={isEdit ? t("editor.unsavedSettings") : t("editor.unsavedGroup")}
          body={t("editor.leaveConfirm")}
          cancelLabel={t("editor.stay")}
          confirmLabel={t("editor.leaveWithoutSaving")}
          danger
          onCancel={handleStay}
          onConfirm={handleLeaveWithoutSaving}
        />
      ) : null}
    </div>
  );
}

function GmailAppPasswordGuide({ onClose }) {
  const { t } = useTranslation(["groups", "common"]);
  const g = t("editor.gmailGuide", { returnObjects: true });
  return (
    <div
      className="confirm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gmail-app-password-guide-title"
    >
      <div className="confirm-modal email-sender-guide-modal">
        <h2 id="gmail-app-password-guide-title">{g.title}</h2>
        <ol className="email-sender-guide-steps">
          <li>{g.step1}</li>
          <li>{g.step2}</li>
          <li>{g.step3}</li>
          <li>{g.step4}</li>
          <li>{g.step5}</li>
          <li>{g.step6}</li>
          <li>{g.step7}</li>
        </ol>
        <p className="hint">{g.workspaceNote}</p>
        <p className="hint">
          {g.officialPages}{" "}
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
            {g.appPasswords}
          </a>
          {" · "}
          <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">
            {g.security}
          </a>
        </p>
        <div className="confirm-modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            {t("common:close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function MicrosoftSmtpGuide({ onClose }) {
  const { t } = useTranslation(["groups", "common"]);
  const g = t("editor.microsoftGuide", { returnObjects: true });
  return (
    <div
      className="confirm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="microsoft-smtp-guide-title"
    >
      <div className="confirm-modal email-sender-guide-modal">
        <h2 id="microsoft-smtp-guide-title">{g.title}</h2>
        <p className="hint">{g.intro}</p>
        <h3 className="email-sender-guide-subtitle">{g.businessSubtitle}</h3>
        <p className="hint">{g.businessIntro}</p>
        <ol className="email-sender-guide-steps">
          <li>{g.step1}</li>
          <li>{g.step2}</li>
          <li>{g.step3}</li>
          <li>{g.step4}</li>
          <li>{g.step5}</li>
          <li>{g.step6}</li>
          <li>{g.step7}</li>
        </ol>
        <h3 className="email-sender-guide-subtitle">{g.personalSubtitle}</h3>
        <p className="hint">{g.personalNote}</p>
        <p className="hint">
          {g.officialPages}{" "}
          <a
            href="https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission"
            target="_blank"
            rel="noreferrer"
          >
            {g.authenticatedSmtp}
          </a>
          {" · "}
          <a
            href="https://learn.microsoft.com/en-us/exchange/mail-flow-best-practices/how-to-set-up-a-multifunction-device-or-application-to-send-email-using-microsoft-365-or-office-365"
            target="_blank"
            rel="noreferrer"
          >
            {g.smtpSubmission}
          </a>
          {" · "}
          <a
            href="https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040"
            target="_blank"
            rel="noreferrer"
          >
            {g.outlookSmtp}
          </a>
        </p>
        <div className="confirm-modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            {t("common:close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function YahooAppPasswordGuide({ onClose }) {
  const { t } = useTranslation(["groups", "common"]);
  const g = t("editor.yahooGuide", { returnObjects: true });
  return (
    <div
      className="confirm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="yahoo-app-password-guide-title"
    >
      <div className="confirm-modal email-sender-guide-modal">
        <h2 id="yahoo-app-password-guide-title">{g.title}</h2>
        <ol className="email-sender-guide-steps">
          <li>{g.step1}</li>
          <li>{g.step2}</li>
          <li>{g.step3}</li>
          <li>{g.step4}</li>
          <li>{g.step5}</li>
          <li>{g.step6}</li>
          <li>{g.step7}</li>
          <li>{g.step8}</li>
        </ol>
        <p className="hint">{g.unavailableNote}</p>
        <p className="hint">
          {g.officialPages}{" "}
          <a href="https://login.yahoo.com/account/security" target="_blank" rel="noreferrer">
            {g.accountSecurity}
          </a>
          {" · "}
          <a href="https://help.yahoo.com/kb/account/SLN27791.html" target="_blank" rel="noreferrer">
            {g.appPasswordsHelp}
          </a>
          {" · "}
          <a href="https://help.yahoo.com/kb/pop-smtp-settings-article-sln4724.html" target="_blank" rel="noreferrer">
            {g.smtpSettings}
          </a>
        </p>
        <div className="confirm-modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            {t("common:close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AfterActionRow({
  title,
  expanded,
  onToggle,
  setting,
  onEnable,
  onTemplate,
  disabled = false,
}) {
  const { t } = useTranslation("groups");
  return (
    <div className={`after-action-row${expanded ? " expanded" : ""}${disabled ? " disabled" : ""}`}>
      <div className="after-action-row-head">
        <Toggle
          label={title}
          checked={setting.send_email}
          disabled={disabled}
          onChange={onEnable}
        />
        {setting.send_email && !disabled ? (
          <button type="button" className="btn-link btn-sm" onClick={onToggle}>
            {expanded ? t("editor.hideMessage") : t("editor.editMessage")}
          </button>
        ) : null}
      </div>
      {setting.send_email && expanded && !disabled ? (
        <Field label={t("editor.emailMessage")} hint={t("editor.emailMessageHint")}>
          <textarea
            className="template-input"
            rows="2"
            value={setting.email_template}
            onChange={(event) => onTemplate(event.target.value)}
          />
        </Field>
      ) : null}
    </div>
  );
}
