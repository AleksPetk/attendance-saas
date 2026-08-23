import { useEffect, useState } from "react";
import { api, errorMessage } from "./api.js";
import { ErrorBanner, Field, LoadingState, PasswordInput, SectionCard, StatusBadge } from "./components.jsx";
import GroupParticipantsSection from "./GroupParticipantsSection.jsx";
import { actionSummary } from "./GroupsScreen.jsx";
import {
  formatClassId,
  formatGroupId,
  isStructuredGroup,
  setupIncompleteSummary,
} from "./groupForm.js";

export default function GroupDetailScreen({ session, groupId, onNavigate }) {
  const [group, setGroup] = useState(null);
  const [kioskReadiness, setKioskReadiness] = useState(null);
  const [classes, setClasses] = useState([]);
  const [addClassMode, setAddClassMode] = useState("create");
  const [newClassName, setNewClassName] = useState("");
  const [newClassPin, setNewClassPin] = useState("");
  const [importSources, setImportSources] = useState([]);
  const [importSourceId, setImportSourceId] = useState("");
  const [importClassName, setImportClassName] = useState("");
  const [importClassPin, setImportClassPin] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [editingClassId, setEditingClassId] = useState(null);
  const [editingClassName, setEditingClassName] = useState("");
  const [editingClassPin, setEditingClassPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setError("");
    try {
      const groupResult = await api.getGroup(session, groupId);
      const nextGroup = groupResult.data;
      if (nextGroup.status === "archived") {
        onNavigate({ name: "groups", status: "archived", replace: true });
        return;
      }
      setGroup(nextGroup);

      if (isStructuredGroup(nextGroup)) {
        const [classResult, kioskSettingsResult, sourcesResult] = await Promise.all([
          api.listGroupClasses(session, groupId),
          api.getGroupKioskSettings(session, groupId).catch(() => ({ data: null })),
          api.listGroupClassImportSources(session, groupId).catch(() => ({ data: [] })),
        ]);
        setClasses(classResult.data);
        setKioskReadiness(kioskSettingsResult.data?.readiness || null);
        setImportSources(Array.isArray(sourcesResult.data) ? sourcesResult.data : []);
      } else {
        const kioskSettingsResult = await api
          .getGroupKioskSettings(session, groupId)
          .catch(() => ({ data: null }));
        setKioskReadiness(kioskSettingsResult.data?.readiness || null);
        setClasses([]);
        setImportSources([]);
      }
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }

  useEffect(() => {
    load();
  }, [groupId]);

  const setupIncomplete = group?.readiness && !group.readiness.setup_complete;
  const structured = isStructuredGroup(group);
  const kioskNeedsSetup = kioskReadiness && !kioskReadiness.ready;
  const launchBlocked = setupIncomplete || kioskNeedsSetup;
  const setupSummary = setupIncompleteSummary(group?.readiness);

  async function archiveGroup() {
    if (!window.confirm(`Archive ${group.name}?`)) {
      return;
    }
    await api.archiveGroup(session, groupId);
    onNavigate({ name: "groups" });
  }

  async function addClass(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setImportNotice("");
    try {
      await api.createGroupClass(session, groupId, {
        name: newClassName.trim(),
        ...(newClassPin ? { class_pin: newClassPin } : {}),
      });
      setNewClassName("");
      setNewClassPin("");
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  function selectImportSource(sourceId) {
    setImportSourceId(sourceId);
    const source = importSources.find((item) => String(item.id) === String(sourceId));
    if (source) {
      setImportClassName(source.name || "");
    }
  }

  async function copyStandardGroupAsClass(event) {
    event.preventDefault();
    if (!importSourceId) {
      setError("Select a Standard Group to copy.");
      return;
    }
    setSaving(true);
    setError("");
    setImportNotice("");
    try {
      const result = await api.importStandardGroupAsClass(session, groupId, {
        source_group_id: Number(importSourceId),
        name: importClassName.trim() || undefined,
        ...(importClassPin ? { class_pin: importClassPin } : {}),
      });
      setImportNotice(result.data.message || "Class copied.");
      setImportSourceId("");
      setImportClassName("");
      setImportClassPin("");
      setAddClassMode("create");
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function saveClassRename(event) {
    event.preventDefault();
    if (!editingClassId) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.updateGroupClass(session, groupId, editingClassId, {
        name: editingClassName.trim(),
        ...(editingClassPin ? { class_pin: editingClassPin } : {}),
      });
      setEditingClassId(null);
      setEditingClassName("");
      setEditingClassPin("");
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function removeClass(section) {
    if (
      !window.confirm(
        `Archive ${section.name}? Participants stay attached and can return if you restore the Class.`,
      )
    ) {
      return;
    }
    setError("");
    try {
      await api.archiveGroupClass(session, groupId, section.id);
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
    }
  }

  if (!group) {
    return (
      <div className="page">
        <ErrorBanner message={error} />
        <LoadingState label="Loading Group…" />
      </div>
    );
  }

  return (
    <div className="page page-detail">
      <header className="page-header">
        <div className="page-header-copy">
          <div className="editor-title-row">
            <h2>{group.name}</h2>
            <span className="entity-kicker">{formatGroupId(group.id)}</span>
            {structured ? <span className="entity-kicker">Structured</span> : null}
            {setupIncomplete ? (
              <StatusBadge status="setup_incomplete" />
            ) : (
              <StatusBadge status="active" />
            )}
          </div>
          <p>{actionSummary(group.actions)}</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate({ name: "group-editor", groupId })}
          >
            Edit configuration
          </button>
          <button type="button" className="btn-danger-soft" onClick={archiveGroup}>
            Archive
          </button>
          <button type="button" className="btn-secondary" onClick={() => onNavigate({ name: "groups" })}>
            Back
          </button>
        </div>
      </header>
      <ErrorBanner message={error} />

      {setupIncomplete ? (
        <div className="setup-incomplete-banner">
          <div>
            <strong>Setup incomplete</strong>
            <p className="hint">
              {setupSummary ||
                (structured
                  ? "Complete Class participant setup before this Group is ready."
                  : "Complete participant setup before launching the kiosk.")}
            </p>
          </div>
          {!structured ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                document.getElementById("group-participants")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Complete participant setup
            </button>
          ) : null}
        </div>
      ) : null}

      {kioskNeedsSetup && !setupIncomplete ? (
        <div className="setup-incomplete-banner">
          <div>
            <strong>Kiosk settings need attention</strong>
            <ul className="kiosk-settings-issues compact">
              {(kioskReadiness?.issues || []).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate({ name: "kiosk-settings", groupId })}
          >
            Open Kiosk Settings
          </button>
        </div>
      ) : null}

      <div className="summary-grid">
        <article className="summary-card">
          <h3>Actions</h3>
          <p>{actionSummary(group.actions)}</p>
        </article>
        <article className="summary-card">
          <h3>Participation</h3>
          <ul className="summary-list compact">
            <li>
              <span>Email</span>
              <strong>{group.participation?.email_required ? "Required" : "Optional"}</strong>
            </li>
            <li>
              <span>PIN</span>
              <strong>{group.participation?.pin_required ? "Required" : "Optional"}</strong>
            </li>
            {structured ? (
              <li>
                <span>Class PIN</span>
                <strong>{group.require_class_pin ? "Required" : "Off"}</strong>
              </li>
            ) : null}
          </ul>
        </article>
        <article className="summary-card">
          {structured ? (
            <>
              <h3>Classes</h3>
              <p className="summary-stat">
                <strong>{group.section_count ?? classes.length}</strong> active classes
              </p>
              <p className="summary-stat">
                <strong>{group.participant_count ?? 0}</strong> participants total
              </p>
            </>
          ) : (
            <>
              <h3>People</h3>
              <p className="summary-stat">
                <strong>{group.member_count}</strong> reusable Members
              </p>
              <p className="summary-stat">
                <strong>{group.group_only_participant_count}</strong> visitors
              </p>
            </>
          )}
        </article>
      </div>

      <div className="kiosk-section-panel">
        <div className="kiosk-section-head">
          <h3>{group.name} Kiosk</h3>
          <p className="hint">
            {structured
              ? "Class cards → Participant cards. Settings, design, and live launch for this Group."
              : "Settings, design, and live launch for this Group."}
          </p>
        </div>
        <div className="kiosk-action-row">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => onNavigate({ name: "kiosk-settings", groupId })}
          >
            Kiosk Settings
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => onNavigate({ name: "kiosk-builder", groupId })}
          >
            Edit Kiosk Design
          </button>
          <button
            type="button"
            className="btn-success kiosk-action-launch"
            disabled={launchBlocked}
            title={
              setupIncomplete
                ? "Complete setup before launching."
                : kioskNeedsSetup
                  ? "Complete Kiosk Settings before launching."
                  : undefined
            }
            onClick={() => onNavigate({ name: "kiosk", groupId })}
          >
            Launch Kiosk
          </button>
        </div>
      </div>

      {structured ? (
        <SectionCard title={`Classes (${classes.length})`} id="group-classes">
          <div className="class-list">
            {classes.map((section) => (
              <article key={section.id} className="class-row">
                <div>
                  <strong>{section.name}</strong>
                  <p className="participant-row-meta">
                    {formatClassId(section.id)} · {section.participant_count} participant
                    {section.participant_count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="participant-row-actions">
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() =>
                      onNavigate({ name: "group-class", groupId, classId: section.id })
                    }
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setEditingClassId(section.id);
                      setEditingClassName(section.name);
                      setEditingClassPin(section.class_pin || "");
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-danger-soft btn-sm"
                    onClick={() => removeClass(section)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
            {classes.length === 0 ? <p className="hint">No Classes yet.</p> : null}
          </div>

          {editingClassId ? (
            <form className="panel-form card-surface panel-form-edit" onSubmit={saveClassRename}>
              <h3>Edit Class</h3>
              <Field label="Name">
                <input
                  value={editingClassName}
                  onChange={(event) => setEditingClassName(event.target.value)}
                  required
                />
              </Field>
              {group.require_class_pin ? (
                <Field label="Class PIN" hint="Leave blank to keep the current PIN.">
                  <PasswordInput
                    value={editingClassPin}
                    onChange={(event) => setEditingClassPin(event.target.value)}
                    autoComplete="off"
                    name="class-pin-edit"
                  />
                </Field>
              ) : null}
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={saving}>
                  Save
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setEditingClassId(null);
                    setEditingClassName("");
                    setEditingClassPin("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          <form
            className="add-participant-card"
            onSubmit={addClassMode === "import" ? copyStandardGroupAsClass : addClass}
          >
            <header className="add-participant-card-head">
              <div>
                <h3>Add Class</h3>
                <p className="hint">Create empty or copy participants from a Standard Group.</p>
              </div>
            </header>
            <div className="kiosk-segment-picker" role="radiogroup" aria-label="Add Class mode">
              {[
                { id: "create", label: "Create new Class" },
                { id: "import", label: "Copy from existing Group" },
              ].map((option) => (
                <label
                  key={option.id}
                  className={`kiosk-segment-option ${addClassMode === option.id ? "active" : ""}`}
                >
                  <input
                    type="radio"
                    name="add-class-mode"
                    value={option.id}
                    checked={addClassMode === option.id}
                    onChange={() => {
                      setAddClassMode(option.id);
                      setImportNotice("");
                      setError("");
                    }}
                  />
                  {option.label}
                </label>
              ))}
            </div>

            {addClassMode === "create" ? (
              <>
                <Field label="Name">
                  <input
                    value={newClassName}
                    onChange={(event) => setNewClassName(event.target.value)}
                    placeholder="Class A"
                    required
                  />
                </Field>
                {group.require_class_pin ? (
                  <Field label="Class PIN" hint="Required while Require PIN for classes is ON.">
                    <PasswordInput
                      value={newClassPin}
                      onChange={(event) => setNewClassPin(event.target.value)}
                      autoComplete="off"
                      name="class-pin-new"
                      required
                    />
                  </Field>
                ) : null}
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving || !newClassName.trim()}
                >
                  Add Class
                </button>
              </>
            ) : (
              <>
                <Field
                  label="Source Group"
                  hint="Creates a one-time copy of this Group’s current participants. Future changes to the original Group will not affect this Class."
                >
                  <select
                    value={importSourceId}
                    onChange={(event) => selectImportSource(event.target.value)}
                    required
                  >
                    <option value="">Select a Standard Group</option>
                    {importSources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name} ({source.participant_count} participant
                        {source.participant_count === 1 ? "" : "s"})
                      </option>
                    ))}
                  </select>
                </Field>
                {importSources.length === 0 ? (
                  <p className="hint">No active Standard Groups available to copy.</p>
                ) : null}
                <Field label="Class name">
                  <input
                    value={importClassName}
                    onChange={(event) => setImportClassName(event.target.value)}
                    placeholder="Fitness"
                    required
                  />
                </Field>
                {importSourceId ? (
                  <p className="hint">
                    One-time copy. Future changes to{" "}
                    {importSources.find((item) => String(item.id) === String(importSourceId))
                      ?.name || "the source Group"}{" "}
                    will not update this Class.
                  </p>
                ) : null}
                {group.require_class_pin ? (
                  <Field label="Class PIN" hint="Required while Require PIN for classes is ON.">
                    <PasswordInput
                      value={importClassPin}
                      onChange={(event) => setImportClassPin(event.target.value)}
                      autoComplete="off"
                      name="class-pin-import"
                      required
                    />
                  </Field>
                ) : null}
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving || !importSourceId || !importClassName.trim()}
                >
                  Copy as Class
                </button>
              </>
            )}
            {importNotice ? <p className="hint import-success-note">{importNotice}</p> : null}
          </form>
        </SectionCard>
      ) : (
        <GroupParticipantsSection
          session={session}
          group={group}
          groupId={groupId}
          onError={setError}
          onChanged={load}
        />
      )}
    </div>
  );
}
