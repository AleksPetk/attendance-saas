import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "./api.js";
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

const LEAVE_CONFIRM_MESSAGE =
  "You have changes that haven't been saved. Leave without saving?";

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
    not_configured: "Not configured",
    needs_verification: "Needs verification",
    ready: "Ready",
    error: "Error",
  };
  return labels[sender?.status] || sender?.status_label || "Not configured";
}

export default function GroupEditorScreen({ session, groupId, onNavigate }) {
  const isEdit = Boolean(groupId);
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
      return { status: "ready", label: "Verified — ready to save" };
    }
    if (draftStatus === "error") {
      return { status: "error", label: "Error" };
    }
    if (senderDraftIsDirty()) {
      return { status: "needs_verification", label: "Draft — not saved" };
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
        setError(errorMessage(loadError));
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
      ? "None"
      : `${configuredForwardCount} configured`;
  const forwardSlots = forwardEmailSlots();
  const forwardNumbered = forwardSlots.length > 1;

  function enableAfterAction(path, checked) {
    if (checked && !senderReady) {
      return;
    }
    patch(path, checked);
    if (checked && !values.participation.email_required) {
      patch("participation.email_required", true);
      setRequireEmailNotice(
        "Participant email was enabled because after-action emails require an email address."
      );
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
          setRequireEmailNotice(
            "Participant email was enabled because after-action emails require an email address."
          );
        }
        setSuccessMessage("Group settings saved.");
      } else {
        const created = await api.createGroup(session, payload);
        skipLeaveConfirmRef.current = true;
        skipNextWorkspaceLeaveCheck();
        onNavigate({ name: "group-detail", groupId: created.data.id });
      }
    } catch (saveError) {
      setError(errorMessage(saveError));
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
          ? "Email sender saved and active."
          : "Email sender saved."
      );
    } catch (saveError) {
      setError(errorMessage(saveError));
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
        result.data.detail ||
          "Test email sent. Save the sender to make this configuration active."
      );
    } catch (testError) {
      setDraftVerified(false);
      setDraftStatus("error");
      setDraftError(errorMessage(testError));
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
          <span className="plan-locked-badge">Plan locked</span>
          <strong>This Group is not available on the current plan</strong>
          <p className="hint">
            Configuration stays preserved. Unlock the Group during capacity selection or upgrade
            the plan before editing.
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              skipNextWorkspaceLeaveCheck();
              onNavigate({ name: "groups" });
            }}
          >
            Back to Groups
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={isEdit ? "Edit Group" : "Create Group"}
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
              Back
            </button>
            <button
              type="submit"
              form="group-editor-form"
              className="btn-primary"
              disabled={isEdit ? !dirty || saving || savedBaseline === null : saving}
              aria-disabled={isEdit ? !dirty || saving || savedBaseline === null : saving}
            >
              {saving ? "Saving…" : isEdit ? "Save Group" : "Create Group"}
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
              Setup incomplete: {setupSummary}
            </div>
          ) : null}
          {requireEmailNotice ? (
            <div className="alert alert-info" role="status">
              {requireEmailNotice}
            </div>
          ) : null}
        </div>
      ) : null}

      <form id="group-editor-form" className="group-form group-form-dashboard" onSubmit={handleSubmit}>
        {!isEdit ? (
          <SectionCard title="Group type" className="section-group-type">
            <div className="group-type-selector" role="radiogroup" aria-label="Group type">
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
                <strong>Standard Group</strong>
                <span>Participants belong directly to the Group.</span>
              </button>
              <button
                type="button"
                className={`group-type-option${structuredAllowed ? "" : " is-plan-locked"}`}
                role="radio"
                aria-checked={values.group_type === "structured"}
                data-selected={values.group_type === "structured" ? "true" : "false"}
                disabled={!structuredAllowed}
                title={
                  structuredAllowed
                    ? undefined
                    : "Structured Groups require the Business plan"
                }
                onClick={() => {
                  if (!structuredAllowed) return;
                  setValues((current) => ({
                    ...current,
                    group_type: "structured",
                  }));
                }}
              >
                <strong>Structured Group</strong>
                <span>
                  {structuredAllowed
                    ? "Organize participants inside Classes/Sections."
                    : "Business plan feature — locked on your current plan."}
                </span>
              </button>
            </div>
          </SectionCard>
        ) : (
          <SectionCard title="Group type" className="section-group-type">
            <p className="hint">
              {values.group_type === "structured" ? "Structured Group" : "Standard Group"} — type
              cannot be changed after creation.
            </p>
          </SectionCard>
        )}

        <SectionCard title="Group name" className="section-name">
          <Field label="Name">
            <input
              value={values.name}
              onChange={(event) => patch("name", event.target.value)}
              required
            />
          </Field>
        </SectionCard>

        <SectionCard
          title="Actions"
          description="What this Group can perform."
          className="section-actions"
        >
          <div className="toggle-grid toggle-grid-compact">
            <Toggle
              label="Check-in"
              checked={actions.check_in_enabled}
              onChange={(checked) => patch("actions.check_in_enabled", checked)}
            />
            <Toggle
              label="Check-out"
              checked={actions.check_out_enabled}
              onChange={(checked) => patch("actions.check_out_enabled", checked)}
            />
            <Toggle
              label="Breaks"
              checked={actions.breaks_enabled}
              onChange={(checked) => patch("actions.breaks_enabled", checked)}
            />
          </div>
          {actions.breaks_enabled ? (
            <Field label="Maximum breaks">
              <div className="max-breaks-control" role="radiogroup" aria-label="Maximum breaks">
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
          title="Participation"
          description="Require participation email or PIN for operational participants."
          className="section-participation"
        >
          <div className="toggle-grid toggle-grid-compact toggle-grid-stack">
            <Toggle
              label="Require email"
              checked={participation.email_required}
              onChange={(checked) => {
                patch("participation.email_required", checked);
                if (!checked) {
                  setRequireEmailNotice("");
                }
              }}
            />
            <Toggle
              label="Require PIN"
              checked={participation.pin_required}
              onChange={(checked) => patch("participation.pin_required", checked)}
            />
            {values.group_type === "structured" ? (
              <Toggle
                label="Require PIN for classes"
                checked={Boolean(values.require_class_pin)}
                onChange={(checked) => patch("require_class_pin", checked)}
              />
            ) : null}
          </div>
          {values.group_type === "structured" ? (
            <p className="hint">
              Class PIN is stored for upcoming Structured kiosk flow. Kiosk class entry is not
              enabled in this stage.
            </p>
          ) : null}
        </SectionCard>

        <SectionCard
          title="After-action"
          description="Email participants after enabled actions."
          className={`section-after-action${afterActionDisabled ? " is-disabled" : ""}`}
        >
          {afterActionDisabled ? (
            <p className="hint after-action-blocked">
              Configure and verify an email sender in Advanced before enabling after-action
              emails.
            </p>
          ) : null}
          {!actions.check_in_enabled &&
          !actions.check_out_enabled &&
          !actions.breaks_enabled ? (
            <p className="hint">Enable an action to configure after-action behavior.</p>
          ) : (
            <div className="after-action-accordion" aria-disabled={afterActionDisabled}>
              {actions.check_in_enabled ? (
                <AfterActionRow
                  title="After check-in"
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
                  title="After check-out"
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
                  title="After break"
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

        <section className="section-card section-advanced">
          <header className="advanced-header">
            <div>
              <h2>Advanced</h2>
              <p>Outgoing email settings for this Group.</p>
            </div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              {advancedOpen ? "Hide" : "Show"}
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
                    <span className="advanced-subsection-title">Email sender</span>
                    <span className="advanced-subsection-hint">
                      Provider configuration for after-action emails.
                    </span>
                  </span>
                  <span className="advanced-subsection-meta">
                    <span className="advanced-subsection-summary">{senderDisplay.label}</span>
                    <span className="advanced-subsection-action">
                      {emailSenderOpen ? "Hide" : "Show"}
                    </span>
                  </span>
                </button>
                {emailSenderOpen ? (
                  <div className="advanced-subsection-body">
                    {!isEdit ? (
                      <p className="hint">Save the Group first, then configure an email sender here.</p>
                    ) : (
                      <>
                    <div className="email-sender-status-row">
                      <Field label="Provider">
                        <select
                          value={senderForm.provider}
                          onChange={(event) => requestProviderChange(event.target.value)}
                        >
                          <option value={PROVIDER_CUSTOM_SMTP}>Custom SMTP</option>
                          <option value={PROVIDER_GMAIL}>Gmail</option>
                          <option value={PROVIDER_MICROSOFT}>Outlook / Microsoft 365</option>
                          <option value={PROVIDER_YAHOO}>Yahoo Mail</option>
                        </select>
                      </Field>
                      <div className="email-sender-badge">
                        <span className="field-label">Status</span>
                        <StatusBadge status={senderStatusBadge(senderDisplay.status)}>
                          {senderDisplay.label}
                        </StatusBadge>
                      </div>
                    </div>
                    {isGmail ? (
                      <p className="hint">
                        Use a Google App Password, not your normal Google password. Google App
                        Passwords require 2-Step Verification. Create an App Password in your
                        Google Account, then paste it here.
                      </p>
                    ) : isMicrosoft ? (
                      <div className="alert alert-warning email-sender-availability" role="status">
                        <strong>Microsoft SMTP availability</strong>
                        <p>
                          This connection requires a Microsoft mailbox with Authenticated SMTP
                          (SMTP AUTH) enabled.
                        </p>
                        <p>
                          It is mainly intended for Microsoft 365 business/work accounts where
                          SMTP AUTH can be enabled by an administrator.
                        </p>
                        <p>
                          Personal Outlook.com / Hotmail accounts may not support this
                          connection method. If you use a personal Microsoft account and cannot
                          enable SMTP AUTH, this option may not work.
                        </p>
                        <p className="email-sender-availability-alt">
                          If your organization provides different SMTP server credentials, you
                          can use Custom SMTP instead.
                        </p>
                      </div>
                    ) : isYahoo ? (
                      <p className="hint">
                        Use a Yahoo App Password, not your normal Yahoo password.
                      </p>
                    ) : (
                      <p className="hint">
                        You can use SMTP credentials from your email provider.
                      </p>
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
                        <Field label="Gmail address">
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
                        <Field label="App password">
                          {emailSender.password_configured &&
                          emailSender.provider === PROVIDER_GMAIL &&
                          !senderForm.change_password ? (
                            <div className="password-configured-row">
                              <span className="hint">Configured</span>
                              <button
                                type="button"
                                className="btn-link btn-sm"
                                onClick={() => patchSender("change_password", true)}
                              >
                                Change app password
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
                                  ? "Enter new App Password"
                                  : "Google App Password"
                              }
                            />
                          )}
                        </Field>
                        <button
                          type="button"
                          className="btn-link email-sender-help-link"
                          onClick={() => setShowAppPasswordGuide(true)}
                        >
                          How to create a Gmail App Password
                        </button>
                        {senderForm.gmail_address ? (
                          <Field label="Sender email">
                            <input
                              type="email"
                              value={senderForm.gmail_address}
                              readOnly
                              className="input-readonly"
                            />
                          </Field>
                        ) : null}
                        <Field label="From name (optional)">
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
                        <Field label="Microsoft email">
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
                          label="Password / App password"
                          hint="Only use a credential that works with Authenticated SMTP. An app password does not help if SMTP AUTH is disabled for the mailbox."
                        >
                          {emailSender.password_configured &&
                          emailSender.provider === PROVIDER_MICROSOFT &&
                          !senderForm.change_password ? (
                            <div className="password-configured-row">
                              <span className="hint">Configured</span>
                              <button
                                type="button"
                                className="btn-link btn-sm"
                                onClick={() => patchSender("change_password", true)}
                              >
                                Change password
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
                                  ? "Enter new password / app password"
                                  : "Password or app password"
                              }
                            />
                          )}
                        </Field>
                        <button
                          type="button"
                          className="btn-link email-sender-help-link"
                          onClick={() => setShowMicrosoftGuide(true)}
                        >
                          How to connect Outlook / Microsoft 365
                        </button>
                        {senderForm.microsoft_email ? (
                          <Field label="Sender email">
                            <input
                              type="email"
                              value={senderForm.microsoft_email}
                              readOnly
                              className="input-readonly"
                            />
                          </Field>
                        ) : null}
                        <Field label="From name (optional)">
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
                        <Field label="Yahoo email">
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
                          label="App password"
                          hint="Use a Yahoo App Password, not your normal Yahoo password."
                        >
                          {emailSender.password_configured &&
                          emailSender.provider === PROVIDER_YAHOO &&
                          !senderForm.change_password ? (
                            <div className="password-configured-row">
                              <span className="hint">Configured</span>
                              <button
                                type="button"
                                className="btn-link btn-sm"
                                onClick={() => patchSender("change_password", true)}
                              >
                                Change app password
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
                                  ? "Enter new App Password"
                                  : "Yahoo App Password"
                              }
                            />
                          )}
                        </Field>
                        <button
                          type="button"
                          className="btn-link email-sender-help-link"
                          onClick={() => setShowYahooGuide(true)}
                        >
                          How to create a Yahoo App Password
                        </button>
                        {senderForm.yahoo_email ? (
                          <Field label="Sender email">
                            <input
                              type="email"
                              value={senderForm.yahoo_email}
                              readOnly
                              className="input-readonly"
                            />
                          </Field>
                        ) : null}
                        <Field label="From name (optional)">
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
                        <Field label="SMTP host">
                          <input
                            value={senderForm.smtp_host}
                            onChange={(event) => patchSender("smtp_host", event.target.value)}
                            placeholder="smtp.example.com"
                            autoComplete="off"
                          />
                        </Field>
                        <div className="email-sender-row">
                          <Field label="Port">
                            <input
                              type="number"
                              min="1"
                              max="65535"
                              value={senderForm.smtp_port}
                              onChange={(event) => patchSender("smtp_port", event.target.value)}
                            />
                          </Field>
                          <Field
                            label="Security"
                            hint={
                              senderForm.smtp_security === "ssl"
                                ? "Commonly port 465"
                                : senderForm.smtp_security === "starttls"
                                  ? "Commonly port 587"
                                  : senderForm.smtp_security === "none"
                                    ? "Not recommended"
                                    : ""
                            }
                          >
                            <select
                              value={senderForm.smtp_security}
                              onChange={(event) => onSecurityChange(event.target.value)}
                            >
                              <option value="ssl">SSL/TLS</option>
                              <option value="starttls">STARTTLS</option>
                              <option value="none">None</option>
                            </select>
                          </Field>
                        </div>
                        {senderForm.smtp_security === "none" ? (
                          <p className="hint warning-hint">
                            Sending without encryption is insecure. Use only if your provider
                            requires it on a trusted network.
                          </p>
                        ) : null}
                        <Field label="Username">
                          <input
                            value={senderForm.smtp_username}
                            onChange={(event) =>
                              patchSender("smtp_username", event.target.value)
                            }
                            autoComplete="off"
                          />
                        </Field>
                        <Field label="Password">
                          {emailSender.password_configured &&
                          emailSender.provider === PROVIDER_CUSTOM_SMTP &&
                          !senderForm.change_password ? (
                            <div className="password-configured-row">
                              <span className="hint">Configured</span>
                              <button
                                type="button"
                                className="btn-link btn-sm"
                                onClick={() => patchSender("change_password", true)}
                              >
                                Change password
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
                                  ? "Enter new password"
                                  : "SMTP password"
                              }
                            />
                          )}
                        </Field>
                        <div className="email-sender-row">
                          <Field
                            label="From email"
                            hint="Must be an address your SMTP mailbox is allowed to send as."
                          >
                            <input
                              type="email"
                              value={senderForm.from_email}
                              onChange={(event) =>
                                patchSender("from_email", event.target.value)
                              }
                            />
                          </Field>
                          <Field label="From name (optional)">
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
                      <Field label="Send test email">
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
                            {testingSender ? "Sending…" : "Send test"}
                          </button>
                        </div>
                      </Field>
                      <p className="hint">
                        Verify the draft first. Save becomes available only after a successful test.
                      </p>
                    </div>
                    <div className="email-sender-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={!canSaveSender()}
                        onClick={handleSaveSender}
                      >
                        {savingSender ? "Saving…" : "Save sender"}
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
                  aria-expanded={forwardEmailsOpen}
                  onClick={() => setForwardEmailsOpen((open) => !open)}
                >
                  <span className="advanced-subsection-copy">
                    <span className="advanced-subsection-title">Forward emails</span>
                    <span className="advanced-subsection-hint">
                      {forwardEmailsAllowed
                        ? "Send a copy of this Group’s after-action emails to additional addresses."
                        : "Forward emails require Plus or Business."}
                    </span>
                  </span>
                  <span className="advanced-subsection-meta">
                    <span className="advanced-subsection-summary">
                      {forwardEmailsAllowed ? forwardEmailSummary : "Locked"}
                    </span>
                    <span className="advanced-subsection-action">
                      {forwardEmailsOpen ? "Hide" : "Show"}
                    </span>
                  </span>
                </button>
                {forwardEmailsOpen ? (
                  <div className="advanced-subsection-body forward-emails-body">
                    {!forwardEmailsAllowed ? (
                      <p className="plan-lock-note" role="status">
                        Forward emails are not included on the Basic plan. Existing empty
                        configuration is unchanged; upgrades unlock this setting.
                      </p>
                    ) : (
                      <>
                        {forwardSlots.map((email, index) => (
                          <div key={`forward-email-${index}`} className="forward-email-row">
                            <Field
                              label={
                                forwardNumbered
                                  ? `Forward email ${index + 1}`
                                  : "Forward email"
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
                                    Remove
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
                            + Add another email
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
          title="Switch email provider?"
          body="Switching email provider will remove the current provider credentials. Continue?"
          confirmLabel="Switch provider"
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
          title={isEdit ? "Unsaved group settings" : "Unsaved group"}
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

function GmailAppPasswordGuide({ onClose }) {
  return (
    <div
      className="confirm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gmail-app-password-guide-title"
    >
      <div className="confirm-modal email-sender-guide-modal">
        <h2 id="gmail-app-password-guide-title">How to create a Gmail App Password</h2>
        <ol className="email-sender-guide-steps">
          <li>Open your Google Account security settings.</li>
          <li>Turn on 2-Step Verification if it is not already enabled.</li>
          <li>Open App Passwords (search for “App passwords” in Google Account).</li>
          <li>Create an App Password for CheckStation (or Mail / Other).</li>
          <li>Copy the generated 16-character password.</li>
          <li>Paste it into CheckStation as the App password.</li>
          <li>Save the sender, then send a test email.</li>
        </ol>
        <p className="hint">
          App Passwords may not be available for some Google Workspace or security-managed
          accounts. If App Passwords are unavailable, use Custom SMTP with another mailbox
          for now.
        </p>
        <p className="hint">
          Official Google pages:{" "}
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noreferrer"
          >
            App Passwords
          </a>
          {" · "}
          <a
            href="https://myaccount.google.com/security"
            target="_blank"
            rel="noreferrer"
          >
            Security
          </a>
        </p>
        <div className="confirm-modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function MicrosoftSmtpGuide({ onClose }) {
  return (
    <div
      className="confirm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="microsoft-smtp-guide-title"
    >
      <div className="confirm-modal email-sender-guide-modal">
        <h2 id="microsoft-smtp-guide-title">How to connect Outlook / Microsoft 365</h2>
        <p className="hint">
          CheckStation uses Authenticated SMTP (SMTP AUTH) for this provider. Microsoft OAuth
          is not available yet.
        </p>

        <h3 className="email-sender-guide-subtitle">Using Microsoft 365 for work or business</h3>
        <p className="hint">
          This is the main supported use case. An administrator can enable Authenticated SMTP
          for the mailbox in Microsoft 365 Admin Center:
        </p>
        <ol className="email-sender-guide-steps">
          <li>Open Microsoft 365 Admin Center.</li>
          <li>Go to Users → Active users.</li>
          <li>Select the user / mailbox.</li>
          <li>Open Mail → Manage email apps.</li>
          <li>Enable Authenticated SMTP for the mailbox.</li>
          <li>In CheckStation, enter the Microsoft email and allowed password/app password.</li>
          <li>Save the sender, then send a test email.</li>
        </ol>

        <h3 className="email-sender-guide-subtitle">Personal Outlook / Hotmail accounts</h3>
        <p className="hint">
          Microsoft increasingly requires Modern Authentication / OAuth for personal Outlook
          accounts. CheckStation does not yet support Microsoft OAuth, so personal
          Outlook/Hotmail accounts may not be able to use this provider. An app password does
          not guarantee compatibility if SMTP AUTH is unavailable.
        </p>

        <p className="hint">
          Official Microsoft pages:{" "}
          <a
            href="https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission"
            target="_blank"
            rel="noreferrer"
          >
            Authenticated SMTP
          </a>
          {" · "}
          <a
            href="https://learn.microsoft.com/en-us/exchange/mail-flow-best-practices/how-to-set-up-a-multifunction-device-or-application-to-send-email-using-microsoft-365-or-office-365"
            target="_blank"
            rel="noreferrer"
          >
            SMTP submission settings
          </a>
          {" · "}
          <a
            href="https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040"
            target="_blank"
            rel="noreferrer"
          >
            Outlook.com SMTP settings
          </a>
        </p>
        <div className="confirm-modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function YahooAppPasswordGuide({ onClose }) {
  return (
    <div
      className="confirm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="yahoo-app-password-guide-title"
    >
      <div className="confirm-modal email-sender-guide-modal">
        <h2 id="yahoo-app-password-guide-title">How to create a Yahoo App Password</h2>
        <ol className="email-sender-guide-steps">
          <li>Open Yahoo Account Security.</li>
          <li>Find External connections (or Generate app password).</li>
          <li>Choose Create app password.</li>
          <li>Enter a name such as CheckStation.</li>
          <li>Generate the password.</li>
          <li>Copy it.</li>
          <li>Paste it into CheckStation as the App password.</li>
          <li>Save the sender, then send a test email.</li>
        </ol>
        <p className="hint">
          Yahoo may temporarily prevent App Password creation for some accounts. If the option
          is unavailable, check your Yahoo Account Security settings and try again later.
        </p>
        <p className="hint">
          Official Yahoo pages:{" "}
          <a
            href="https://login.yahoo.com/account/security"
            target="_blank"
            rel="noreferrer"
          >
            Account Security
          </a>
          {" · "}
          <a
            href="https://help.yahoo.com/kb/account/SLN27791.html"
            target="_blank"
            rel="noreferrer"
          >
            App passwords help
          </a>
          {" · "}
          <a
            href="https://help.yahoo.com/kb/pop-smtp-settings-article-sln4724.html"
            target="_blank"
            rel="noreferrer"
          >
            SMTP settings
          </a>
        </p>
        <div className="confirm-modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            Close
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
            {expanded ? "Hide message" : "Edit message"}
          </button>
        ) : null}
      </div>
      {setting.send_email && expanded && !disabled ? (
        <Field label="Email message" hint="Placeholders: {name}, {time}, {group}">
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
