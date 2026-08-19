import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "./api.js";
import { ErrorBanner, Field, LoadingState, PageHeader, PlanHint, SectionCard, Toggle, KIOSK_THEME_LABELS } from "./components.jsx";

const EMPTY_GROUP = {
  name: "",
  actions: {
    check_in_enabled: true,
    check_out_enabled: false,
    breaks_enabled: false,
    max_breaks: 1,
  },
  requirements: {
    name: "required",
    email: "optional",
    photo: "optional",
    check_in_identifier: "optional",
    pin: "optional",
  },
  notifications: {
    check_in: { send_email: false, email_template: "{name} checked in at {time}." },
    check_out: { send_email: false, email_template: "{name} checked out at {time}." },
    break: { send_email: false, email_template: "{name} started a break at {time}." },
  },
  advanced: {
    automatic_check_in_enabled: false,
    automatic_check_in_time: "08:00",
    email_sender_mode: "platform",
  },
  kiosk: {
    kiosk_enabled: false,
    kiosk_mode: "member_list",
    kiosk_theme: "classic",
    kiosk_title: "",
    kiosk_welcome_text: "",
    kiosk_success_message: "",
    kiosk_confirmation_message: "",
    kiosk_return_delay_seconds: 5,
    kiosk_list_show_name: true,
    kiosk_list_show_photo: true,
    kiosk_list_show_identifier: false,
    kiosk_list_show_email: false,
    kiosk_input_field_1: "name",
    kiosk_input_field_2: "",
  },
};

function cloneGroup(source) {
  return JSON.parse(JSON.stringify(source || EMPTY_GROUP));
}

function RequirementRow({ label, field, alwaysRequired, value, onChange }) {
  return (
    <div className="requirement-row">
      <span className="requirement-label">{label}</span>
      {alwaysRequired ? (
        <span className="requirement-fixed">Always required</span>
      ) : (
        <div className="segmented-control" role="group" aria-label={`${label} requirement`}>
          <button
            type="button"
            className={`segment ${value === "required" ? "active" : ""}`}
            onClick={() => onChange("required")}
          >
            Required
          </button>
          <button
            type="button"
            className={`segment ${value === "optional" ? "active" : ""}`}
            onClick={() => onChange("optional")}
          >
            Optional
          </button>
        </div>
      )}
    </div>
  );
}

export default function GroupEditorScreen({ session, groupId, onNavigate }) {
  const isEdit = Boolean(groupId);
  const [values, setValues] = useState(cloneGroup(EMPTY_GROUP));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!groupId) {
      return;
    }
    api.getGroup(session, groupId).then((result) => {
      const group = result.data;
      setValues({
        name: group.name,
        actions: { ...EMPTY_GROUP.actions, ...group.actions },
        requirements: { ...EMPTY_GROUP.requirements, ...group.requirements },
        notifications: {
          check_in: { ...EMPTY_GROUP.notifications.check_in, ...group.notifications.check_in },
          check_out: { ...EMPTY_GROUP.notifications.check_out, ...group.notifications.check_out },
          break: { ...EMPTY_GROUP.notifications.break, ...group.notifications.break },
        },
        advanced: { ...EMPTY_GROUP.advanced, ...group.advanced },
        kiosk: { ...EMPTY_GROUP.kiosk, ...(group.kiosk || {}) },
      });
      if (group.advanced?.automatic_check_in_enabled) {
        setAdvancedOpen(true);
      }
    }).catch((loadError) => setError(errorMessage(loadError)));
  }, [groupId]);

  const payload = useMemo(() => {
    const body = cloneGroup(values);
    if (!body.actions.breaks_enabled) {
      body.actions.max_breaks = body.actions.max_breaks || 1;
    }
    if (body.actions.check_in_enabled) {
      body.advanced.automatic_check_in_enabled = false;
    }
    if (!body.advanced.automatic_check_in_enabled) {
      body.advanced.automatic_check_in_time = body.advanced.automatic_check_in_time || null;
    }
    return body;
  }, [values]);

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

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setConflicts([]);
    try {
      if (kioskModeInvalid) {
        setError(
          "Kiosk mode is not valid for this Group configuration. Member list mode requires no breaks and exactly one of check-in/check-out to be enabled. Please switch to Input mode."
        );
        return;
      }
      if (isEdit) {
        await api.updateGroup(session, groupId, payload);
        onNavigate({ name: "group-detail", groupId });
      } else {
        const created = await api.createGroup(session, payload);
        onNavigate({ name: "group-detail", groupId: created.data.id });
      }
    } catch (saveError) {
      if (saveError.status === 409 && saveError.data?.conflicts) {
        setConflicts(saveError.data.conflicts);
        setError(saveError.data.detail || errorMessage(saveError));
      } else {
        setError(errorMessage(saveError));
      }
    } finally {
      setSaving(false);
    }
  }

  const actions = values.actions;
  const notifications = values.notifications;
  const advanced = values.advanced;
  const kiosk = values.kiosk || EMPTY_GROUP.kiosk;
  const listModeAllowed =
    !actions.breaks_enabled &&
    ((actions.check_in_enabled && !actions.check_out_enabled) ||
      (!actions.check_in_enabled && actions.check_out_enabled));
  const kioskModeInvalid =
    kiosk.kiosk_enabled &&
    kiosk.kiosk_mode === "member_list" &&
    !listModeAllowed;

  return (
    <div className="page page-editor">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>{isEdit ? "Edit Group" : "Create Group"}</h2>
          <p>A Group is a reusable check-in configuration, not just a list of people.</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            onNavigate(isEdit ? { name: "group-detail", groupId } : { name: "groups" })
          }
        >
          Cancel
        </button>
      </header>
      <form className="group-form" onSubmit={handleSubmit}>
        <SectionCard
          title="Basic settings"
          description="Name, Actions, and what people in this Group must have."
          className="section-primary"
        >
          <Field label="Group name">
            <input value={values.name} onChange={(event) => patch("name", event.target.value)} required />
          </Field>
          <div className="toggle-grid">
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
            <Field label="Maximum breaks" hint="Minimum 1">
              <input
                type="number"
                min="1"
                value={actions.max_breaks || 1}
                onChange={(event) => patch("actions.max_breaks", Number(event.target.value))}
              />
            </Field>
          ) : null}
          <div className="requirements-box">
            <h3>Member requirements</h3>
            <p className="hint">These apply to this Group only. They do not make fields mandatory on every Member.</p>
            <RequirementRow label="Name" field="name" alwaysRequired value="required" />
            <RequirementRow
              label="Email"
              field="email"
              value={values.requirements.email}
              onChange={(value) => patch("requirements.email", value)}
            />
            <RequirementRow
              label="Photo"
              field="photo"
              value={values.requirements.photo}
              onChange={(value) => patch("requirements.photo", value)}
            />
            <RequirementRow
              label="Member identifier"
              field="check_in_identifier"
              value={values.requirements.check_in_identifier}
              onChange={(value) => patch("requirements.check_in_identifier", value)}
            />
            <RequirementRow
              label="PIN"
              field="pin"
              value={values.requirements.pin}
              onChange={(value) => patch("requirements.pin", value)}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="After-action behavior"
          description="Stored now. Email is not sent in this slice."
        >
          <NotificationBlock
            title="After check-in"
            setting={notifications.check_in}
            onToggle={(checked) => patch("notifications.check_in.send_email", checked)}
            onTemplate={(value) => patch("notifications.check_in.email_template", value)}
            requireEmail={values.requirements.email === "required"}
          />
          <NotificationBlock
            title="After check-out"
            setting={notifications.check_out}
            onToggle={(checked) => patch("notifications.check_out.send_email", checked)}
            onTemplate={(value) => patch("notifications.check_out.email_template", value)}
            requireEmail={values.requirements.email === "required"}
          />
          <NotificationBlock
            title="After break"
            setting={notifications.break}
            onToggle={(checked) => patch("notifications.break.send_email", checked)}
            onTemplate={(value) => patch("notifications.break.email_template", value)}
            requireEmail={values.requirements.email === "required"}
          />
        </SectionCard>

        <SectionCard
          title="Kiosk configuration"
          description="Participant-facing kiosk for this Group (check-in/check-out/break actions)."
        >
          <Toggle
            label="Kiosk enabled"
            hint="When enabled, this Group can launch a participant-facing kiosk screen."
            checked={kiosk.kiosk_enabled}
            onChange={(checked) => patch("kiosk.kiosk_enabled", checked)}
          />

          {kiosk.kiosk_enabled ? (
            <>
              <div className="form-grid">
                <Field label="Kiosk mode">
                  <div className="segmented-control" role="group" aria-label="Kiosk mode">
                    <button
                      type="button"
                      className={`segment ${kiosk.kiosk_mode === "member_list" ? "active" : ""}`}
                      disabled={!listModeAllowed}
                      onClick={() => patch("kiosk.kiosk_mode", "member_list")}
                    >
                      Member list
                    </button>
                    <button
                      type="button"
                      className={`segment ${kiosk.kiosk_mode === "input" ? "active" : ""}`}
                      onClick={() => patch("kiosk.kiosk_mode", "input")}
                    >
                      Input
                    </button>
                  </div>
                  {kioskModeInvalid ? (
                    <p className="hint" style={{ marginTop: "0.5rem" }}>
                      Member list mode is only valid for check-in-only or check-out-only Groups with no breaks. Switch to Input mode to save this Group.
                    </p>
                  ) : null}
                </Field>

                <Field label="Theme">
                  <select
                    value={kiosk.kiosk_theme}
                    onChange={(e) => patch("kiosk.kiosk_theme", e.target.value)}
                  >
                    {Object.entries(KIOSK_THEME_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div className="theme-preview-grid">
                    <div className="theme-preview theme-preview-classic" title="Station Blue" />
                    <div className="theme-preview theme-preview-modern" title="Live Green" />
                  </div>
                </Field>

                <Field label="Return delay (seconds)">
                  <input
                    type="number"
                    min={1}
                    max={3600}
                    value={kiosk.kiosk_return_delay_seconds}
                    onChange={(e) =>
                      patch("kiosk.kiosk_return_delay_seconds", Number(e.target.value || 5))
                    }
                  />
                </Field>
              </div>

              <Field label="Kiosk title">
                <input
                  value={kiosk.kiosk_title}
                  onChange={(e) => patch("kiosk.kiosk_title", e.target.value)}
                />
              </Field>
              <Field label="Welcome text">
                <textarea
                  rows={3}
                  value={kiosk.kiosk_welcome_text}
                  onChange={(e) => patch("kiosk.kiosk_welcome_text", e.target.value)}
                />
              </Field>

              <Field label="Success / confirmation message">
                <textarea
                  rows={2}
                  value={kiosk.kiosk_success_message}
                  onChange={(e) => patch("kiosk.kiosk_success_message", e.target.value)}
                />
              </Field>
              <Field label="Confirmation message (when PIN is not required)">
                <textarea
                  rows={2}
                  value={kiosk.kiosk_confirmation_message}
                  onChange={(e) =>
                    patch("kiosk.kiosk_confirmation_message", e.target.value)
                  }
                />
              </Field>

              {kiosk.kiosk_mode === "member_list" ? (
                <div className="kiosk-list-settings">
                  <h3>Member cards</h3>
                  <div className="form-grid">
                    <Toggle
                      label="Show name"
                      checked={kiosk.kiosk_list_show_name}
                      disabled
                      onChange={() => {}}
                    />
                    <Toggle
                      label="Show photo (if available)"
                      hint="Uses the effective Group-specific or Member photo."
                      checked={kiosk.kiosk_list_show_photo}
                      onChange={(checked) => patch("kiosk.kiosk_list_show_photo", checked)}
                    />
                    <Toggle
                      label="Show member identifier"
                      checked={kiosk.kiosk_list_show_identifier}
                      onChange={(checked) => patch("kiosk.kiosk_list_show_identifier", checked)}
                    />
                    <Toggle
                      label="Show email"
                      checked={kiosk.kiosk_list_show_email}
                      onChange={(checked) => patch("kiosk.kiosk_list_show_email", checked)}
                    />
                  </div>
                </div>
              ) : null}

              {kiosk.kiosk_mode === "input" ? (
                <div className="kiosk-input-settings">
                  <h3>Identification inputs</h3>
                  <div className="form-grid">
                    <Field label="Input field 1">
                      <select
                        value={kiosk.kiosk_input_field_1}
                        onChange={(e) => patch("kiosk.kiosk_input_field_1", e.target.value)}
                      >
                        <option value="name">Name</option>
                        <option value="email">Email</option>
                        <option value="identifier">Member identifier</option>
                        <option value="pin">PIN</option>
                      </select>
                    </Field>
                    <Field label="Input field 2 (optional)">
                      <select
                        value={kiosk.kiosk_input_field_2}
                        onChange={(e) => patch("kiosk.kiosk_input_field_2", e.target.value)}
                      >
                        <option value="">None</option>
                        <option value="name">Name</option>
                        <option value="email">Email</option>
                        <option value="identifier">Member identifier</option>
                        <option value="pin">PIN</option>
                      </select>
                    </Field>
                  </div>
                  {values.requirements.pin === "required" ? (
                    <p className="hint" style={{ marginTop: "0.75rem" }}>
                      This Group requires a PIN. PIN must be selected as one of the kiosk identification inputs.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </SectionCard>

        <section className="section-card section-advanced">
          <header className="advanced-header">
            <div>
              <h2>Advanced</h2>
              <p>Less common configuration. Expand only when needed.</p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setAdvancedOpen((open) => !open)}>
              {advancedOpen ? "Hide advanced" : "Show advanced"}
            </button>
          </header>
          {advancedOpen ? (
            <div className="advanced-body">
              <div className="advanced-block">
                <header className="advanced-block-header">
                  <h3>
                    <PlanHint plan="Pro">Automatic check-in</PlanHint>
                  </h3>
                  <p>
                    Later Action Records can use a preset arrival time. Nothing is
                    scheduled yet.
                  </p>
                </header>
                {actions.check_in_enabled ? (
                  <Toggle
                    label="Automatic check-in"
                    hint="Turn manual check-in off in Basic settings to configure a preset arrival time."
                    checked={false}
                    disabled
                    onChange={() => {}}
                  />
                ) : (
                  <>
                    <Toggle
                      label="Automatic check-in"
                      hint="People are recorded as present at the time below instead of checking in manually."
                      checked={advanced.automatic_check_in_enabled}
                      onChange={(checked) =>
                        patch("advanced.automatic_check_in_enabled", checked)
                      }
                    />
                    {advanced.automatic_check_in_enabled ? (
                      <Field label="Automatic check-in time">
                        <input
                          type="time"
                          value={advanced.automatic_check_in_time || "08:00"}
                          onChange={(event) =>
                            patch("advanced.automatic_check_in_time", event.target.value)
                          }
                        />
                      </Field>
                    ) : null}
                  </>
                )}
              </div>
              <div className="advanced-block">
                <header className="advanced-block-header">
                  <h3>Email sender</h3>
                  <p>
                    Who later notification emails are sent from. Email is stored now,
                    not sent in this slice.
                  </p>
                </header>
                <div className="choice-list" role="radiogroup" aria-label="Email sender">
                  <label className="choice-card selected">
                    <input
                      type="radio"
                      name="email_sender_mode"
                      value="platform"
                      checked
                      onChange={() => patch("advanced.email_sender_mode", "platform")}
                    />
                    <span className="choice-copy">
                      <span className="choice-title">Platform email</span>
                      <span className="choice-description">
                        Available now. Default sender for this Group.
                      </span>
                    </span>
                  </label>
                  <label className="choice-card disabled" aria-disabled="true">
                    <input
                      type="radio"
                      name="email_sender_mode"
                      value="custom"
                      disabled
                    />
                    <span className="choice-copy">
                      <span className="choice-title">
                        Custom sender
                        <em className="plan-badge">Business</em>
                      </span>
                      <span className="choice-description">
                        Future feature. Not available yet.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {conflicts.length > 0 ? (
          <div className="conflict-box">
            <h3>Some people are missing required information</h3>
            <p>
              The Group was not changed. Add the missing information on those
              memberships or participants, then try again.
            </p>
            <ul>
              {conflicts.map((conflict) => (
                <li key={`${conflict.kind}-${conflict.id}`}>
                  <strong>{conflict.name}</strong>
                  {` — missing ${conflict.missing_fields.join(", ")}`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ErrorBanner message={error} />
        <div className="form-actions sticky-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Group" : "Create Group"}
          </button>
        </div>
      </form>
    </div>
  );
}

function NotificationBlock({ title, setting, onToggle, onTemplate, requireEmail }) {
  return (
    <div className="notification-block">
      <Toggle label={title} checked={setting.send_email} onChange={onToggle} />
      {setting.send_email ? (
        <>
          <Field label="Email message" hint="Placeholders: {name}, {time}, {group}">
            <textarea
              className="template-input"
              rows="4"
              value={setting.email_template}
              onChange={(event) => onTemplate(event.target.value)}
            />
          </Field>
          <p className="hint">
            Sending email is stored separately from requiring email.
            {requireEmail
              ? " This Group currently requires an email for every participant."
              : " People without an email can still belong to this Group; they just will not be able to receive this message later."}
          </p>
        </>
      ) : null}
    </div>
  );
}

export function GroupsScreen({ session, onNavigate }) {
  const [statusFilter, setStatusFilter] = useState("active");
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api.listGroups(session, `?status=${statusFilter}`);
      setGroups(result.data);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  return (
    <div className="page">
      <PageHeader
        title="Groups"
        description="Reusable participation and check-in configurations for this workspace."
        actions={
          <button type="button" className="btn-primary" onClick={() => onNavigate({ name: "group-editor" })}>
            Create Group
          </button>
        }
      />
      <div className="toolbar card-surface toolbar-compact">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <ErrorBanner message={error} />
      {loading ? <LoadingState label="Loading Groups…" /> : null}
      {!loading && groups.length === 0 ? (
        <div className="empty-state">
          <h2>No Groups yet</h2>
          <p>Create a Group to configure check-in behavior and add people.</p>
          <div className="empty-state-action">
            <button type="button" className="btn-primary" onClick={() => onNavigate({ name: "group-editor" })}>
              Create Group
            </button>
          </div>
        </div>
      ) : null}
      {!loading && groups.length > 0 ? (
        <div className="card-grid">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className="group-card"
              onClick={() => onNavigate({ name: "group-detail", groupId: group.id })}
            >
              <div className="group-card-top">
                <h3>{group.name}</h3>
                <span className={`status-badge ${group.status}`}>{group.status}</span>
              </div>
              <p>{actionSummary(group.actions)}</p>
              <div className="group-card-meta">
                {group.kiosk?.kiosk_enabled ? (
                  <span className="badge badge-live">Kiosk on</span>
                ) : (
                  <span className="badge badge-default">Kiosk off</span>
                )}
              </div>
              <p className="muted">
                {group.member_count} Members · {group.group_only_participant_count} Group-only
                Participants
              </p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function actionSummary(actions) {
  if (!actions) {
    return "No Actions configured";
  }
  const parts = [];
  if (actions.check_in_enabled) {
    parts.push("Check-in");
  }
  if (actions.check_out_enabled) {
    parts.push("Check-out");
  }
  if (actions.breaks_enabled) {
    parts.push(`Breaks (max ${actions.max_breaks || 1})`);
  }
  return parts.length ? parts.join(" · ") : "No check-in/check-out/break Actions";
}
