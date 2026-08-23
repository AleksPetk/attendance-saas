import { useEffect, useState } from "react";
import { api, errorMessage } from "./api.js";
import { ErrorBanner, Field, LoadingState, PasswordInput, StatusBadge } from "./components.jsx";
import GroupParticipantsSection from "./GroupParticipantsSection.jsx";
import { formatClassId, formatGroupId, setupIncompleteSummary } from "./groupForm.js";

export default function GroupClassDetailScreen({ session, groupId, classId, onNavigate }) {
  const [group, setGroup] = useState(null);
  const [section, setSection] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [pinDraft, setPinDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setError("");
    try {
      const [groupResult, classResult] = await Promise.all([
        api.getGroup(session, groupId),
        api.getGroupClass(session, groupId, classId),
      ]);
      if (groupResult.data.status === "archived") {
        onNavigate({ name: "groups", status: "archived", replace: true });
        return;
      }
      if (groupResult.data.group_type !== "structured") {
        onNavigate({ name: "group-detail", groupId, replace: true });
        return;
      }
      if (classResult.data.status === "archived") {
        onNavigate({ name: "group-detail", groupId, replace: true });
        return;
      }
      setGroup(groupResult.data);
      setSection(classResult.data);
      setNameDraft(classResult.data.name || "");
      setPinDraft(classResult.data.class_pin || "");
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }

  useEffect(() => {
    load();
  }, [groupId, classId]);

  async function saveRename(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = { name: nameDraft.trim() };
      if (group.require_class_pin || pinDraft) {
        body.class_pin = pinDraft;
      }
      const updated = await api.updateGroupClass(session, groupId, classId, body);
      setSection(updated.data);
      setPinDraft(updated.data.class_pin || "");
      setEditing(false);
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (!group || !section) {
    return (
      <div className="page">
        <ErrorBanner message={error} />
        <LoadingState label="Loading Class…" />
      </div>
    );
  }

  const setupIncomplete = group.readiness && !group.readiness.setup_complete;
  const setupSummary = setupIncompleteSummary(group.readiness);

  return (
    <div className="page page-detail">
      <header className="page-header">
        <div className="page-header-copy">
          <div className="editor-title-row">
            <h2>{section.name}</h2>
            <span className="entity-kicker">{formatClassId(section.id)}</span>
            {setupIncomplete ? (
              <StatusBadge status="setup_incomplete" />
            ) : (
              <StatusBadge status="active" />
            )}
          </div>
          <p>
            {formatGroupId(group.id)} · {group.name} · {section.participant_count} participant
            {section.participant_count === 1 ? "" : "s"}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-secondary" onClick={() => setEditing((open) => !open)}>
            {editing ? "Cancel edit" : "Edit Class"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate({ name: "group-detail", groupId })}
          >
            Back to Group
          </button>
        </div>
      </header>

      <ErrorBanner message={error} />

      {setupIncomplete ? (
        <div className="setup-incomplete-banner">
          <div>
            <strong>Group setup incomplete</strong>
            <p className="hint">{setupSummary || "Complete participant setup across Classes."}</p>
          </div>
        </div>
      ) : null}

      {editing ? (
        <form className="panel-form card-surface panel-form-edit" onSubmit={saveRename}>
          <h3>Edit Class</h3>
          <Field label="Name">
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              required
            />
          </Field>
          <Field
            label="Class PIN"
            hint={
              group.require_class_pin
                ? "Required while Require PIN for classes is ON."
                : "Optional. Stored for when Class PIN is enabled."
            }
          >
            <PasswordInput
              value={pinDraft}
              onChange={(event) => setPinDraft(event.target.value)}
              autoComplete="off"
              name="class-pin"
              required={Boolean(group.require_class_pin)}
            />
          </Field>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              Save
            </button>
          </div>
        </form>
      ) : null}

      <div className="summary-grid">
        <article className="summary-card">
          <h3>Parent Group</h3>
          <p>{group.name}</p>
          <p className="hint">{formatGroupId(group.id)}</p>
        </article>
        <article className="summary-card">
          <h3>People</h3>
          <p className="summary-stat">
            <strong>{section.participant_count}</strong> participants
          </p>
        </article>
        <article className="summary-card">
          <h3>Participation rules</h3>
          <ul className="summary-list compact">
            <li>
              <span>Email</span>
              <strong>{group.participation?.email_required ? "Required" : "Optional"}</strong>
            </li>
            <li>
              <span>PIN</span>
              <strong>{group.participation?.pin_required ? "Required" : "Optional"}</strong>
            </li>
            <li>
              <span>Class PIN</span>
              <strong>
                {group.require_class_pin
                  ? section.has_class_pin
                    ? "Set"
                    : "Needed"
                  : "Off"}
              </strong>
            </li>
          </ul>
        </article>
      </div>

      <GroupParticipantsSection
        session={session}
        group={group}
        groupId={groupId}
        classId={classId}
        onError={setError}
        onChanged={load}
      />
    </div>
  );
}
