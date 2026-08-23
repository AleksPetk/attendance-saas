import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, errorMessage } from "./api.js";
import { ErrorBanner, Field, LoadingState, SectionCard, StatusBadge } from "./components.jsx";
import { revealParticipantEditPanel } from "./groupParticipantEdit.js";
import { actionSummary } from "./GroupsScreen.jsx";
import { formatGroupId, setupIncompleteSummary } from "./groupForm.js";

const EMPTY_PARTICIPATION = {
  participation_email: "",
  participation_pin: "",
};

export default function GroupDetailScreen({ session, groupId, onNavigate }) {
  const [group, setGroup] = useState(null);
  const [kioskReadiness, setKioskReadiness] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [available, setAvailable] = useState([]);
  const [error, setError] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [participation, setParticipation] = useState(EMPTY_PARTICIPATION);
  const [participant, setParticipant] = useState({ name: "", email: "", pin: "" });
  const [saving, setSaving] = useState(false);
  const [editingMembershipId, setEditingMembershipId] = useState(null);
  const [editingParticipantId, setEditingParticipantId] = useState(null);
  const editPanelRef = useRef(null);
  const editFocusRef = useRef(null);

  function beginEditMembership(membershipId) {
    setEditingParticipantId(null);
    setEditingMembershipId(membershipId);
  }

  function beginEditParticipant(participantId) {
    setEditingMembershipId(null);
    setEditingParticipantId(participantId);
  }

  useLayoutEffect(() => {
    if (!editingMembershipId && !editingParticipantId) {
      return;
    }
    revealParticipantEditPanel(editPanelRef.current, editFocusRef.current);
  }, [editingMembershipId, editingParticipantId]);

  async function load() {
    setError("");
    try {
      const [groupResult, membershipResult, participantResult, availableResult, kioskSettingsResult] =
        await Promise.all([
          api.getGroup(session, groupId),
          api.listMemberships(session, groupId),
          api.listParticipants(session, groupId),
          api.listAvailableMembers(session, groupId),
          api.getGroupKioskSettings(session, groupId).catch(() => ({ data: null })),
        ]);
      const nextGroup = groupResult.data;
      if (nextGroup.status === "archived") {
        onNavigate({ name: "groups", status: "archived", replace: true });
        return;
      }
      setGroup(nextGroup);
      setKioskReadiness(kioskSettingsResult.data?.readiness || null);
      setMemberships(membershipResult.data);
      setParticipants(participantResult.data);
      setAvailable(availableResult.data);
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }

  useEffect(() => {
    load();
  }, [groupId]);

  const selectedMember = available.find((member) => String(member.id) === String(selectedMemberId));
  const setupIncomplete = group?.readiness && !group.readiness.setup_complete;
  const kioskNeedsSetup = kioskReadiness && !kioskReadiness.ready;
  const launchBlocked = setupIncomplete || kioskNeedsSetup;
  const setupSummary = setupIncompleteSummary(group?.readiness);
  const participantCount = memberships.length + participants.length;

  useEffect(() => {
    if (!selectedMember) {
      setParticipation(EMPTY_PARTICIPATION);
      return;
    }
    setParticipation({
      participation_email: selectedMember.suggested_participation_email || "",
      participation_pin: "",
    });
  }, [selectedMemberId, selectedMember?.suggested_participation_email]);

  async function addMember(event) {
    event.preventDefault();
    if (!selectedMember) {
      return;
    }
    setSaving(true);
    setError("");
    const data = new FormData();
    data.append("member_id", selectedMember.id);
    if (participation.participation_email) {
      data.append("participation_email", participation.participation_email);
    }
    if (participation.participation_pin) {
      data.append("participation_pin", participation.participation_pin);
    }
    try {
      await api.createMembership(session, groupId, data);
      setSelectedMemberId("");
      setParticipation(EMPTY_PARTICIPATION);
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function addParticipant(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const data = new FormData();
    data.append("name", participant.name);
    if (participant.email) {
      data.append("email", participant.email);
    }
    if (participant.pin) {
      data.append("participation_pin", participant.pin);
    }
    try {
      await api.createParticipant(session, groupId, data);
      setParticipant({ name: "", email: "", pin: "" });
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function removeMembership(membership) {
    if (!window.confirm(`Remove ${membership.effective.name} from this Group? The reusable Member will be kept.`)) {
      return;
    }
    await api.removeMembership(session, groupId, membership.id);
    await load();
  }

  async function removeParticipant(record) {
    if (!window.confirm(`Remove ${record.name} from this Group?`)) {
      return;
    }
    await api.removeParticipant(session, groupId, record.id);
    await load();
  }

  async function archiveGroup() {
    if (!window.confirm(`Archive ${group.name}?`)) {
      return;
    }
    await api.archiveGroup(session, groupId);
    onNavigate({ name: "groups" });
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
              {setupSummary || "Complete participant setup before launching the kiosk."}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              document.getElementById("group-participants")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Complete participant setup
          </button>
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
          </ul>
        </article>
        <article className="summary-card">
          <h3>People</h3>
          <p className="summary-stat">
            <strong>{group.member_count}</strong> reusable Members
          </p>
          <p className="summary-stat">
            <strong>{group.group_only_participant_count}</strong> visitors
          </p>
        </article>
      </div>

      <div className="kiosk-section-panel">
        <div className="kiosk-section-head">
          <h3>{group.name} Kiosk</h3>
          <p className="hint">Settings, design, and live launch for this Group.</p>
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
                ? "Complete participant setup before launching."
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

      <SectionCard title={`Participants (${participantCount})`} id="group-participants">
        <div className="participant-list-scroll">
          <div className="participant-table">
            {memberships.map((membership) => (
              <ParticipantRow
                key={`m-${membership.id}`}
                name={membership.effective.name}
                code={membership.group_participant_code}
                kind="Member"
                email={membership.participation?.email}
                pin={membership.participation?.pin}
                incomplete={!membership.participation?.complete}
                onEdit={() => beginEditMembership(membership.id)}
                onRemove={() => removeMembership(membership)}
              />
            ))}
            {participants.map((record) => (
              <ParticipantRow
                key={`p-${record.id}`}
                name={record.name}
                code={record.group_participant_code}
                kind="Visitor"
                email={record.participation?.email || record.email}
                pin={record.participation?.pin}
                incomplete={!record.participation?.complete}
                onEdit={() => beginEditParticipant(record.id)}
                onRemove={() => removeParticipant(record)}
              />
            ))}
            {participantCount === 0 ? <p className="hint">No participants yet.</p> : null}
          </div>
        </div>

        {editingMembershipId || editingParticipantId ? (
          <div ref={editPanelRef} className="participant-edit-panel">
            {editingMembershipId ? (
              <MembershipEditForm
                key={`membership-${editingMembershipId}`}
                session={session}
                groupId={groupId}
                group={group}
                membership={memberships.find((item) => item.id === editingMembershipId)}
                firstFieldRef={editFocusRef}
                onCancel={() => setEditingMembershipId(null)}
                onSaved={async () => {
                  setEditingMembershipId(null);
                  await load();
                }}
                onError={setError}
              />
            ) : null}
            {editingParticipantId ? (
              <ParticipantEditForm
                key={`participant-${editingParticipantId}`}
                session={session}
                groupId={groupId}
                group={group}
                participant={participants.find((item) => item.id === editingParticipantId)}
                firstFieldRef={editFocusRef}
                onCancel={() => setEditingParticipantId(null)}
                onSaved={async () => {
                  setEditingParticipantId(null);
                  await load();
                }}
                onError={setError}
              />
            ) : null}
          </div>
        ) : null}

        <div className="participant-add-grid">
          <form className="add-participant-card add-participant-card-member" onSubmit={addMember}>
            <header className="add-participant-card-head">
              <span className="add-participant-icon" aria-hidden="true">
                ◉
              </span>
              <div>
                <h3>Add existing Member</h3>
                <p className="hint">Add someone already saved in Members.</p>
              </div>
            </header>
            <Field label="Member">
              <select
                value={selectedMemberId}
                onChange={(event) => setSelectedMemberId(event.target.value)}
                required
              >
                <option value="">Select an active Member</option>
                {available.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </Field>
            {group.participation?.email_required ? (
              <Field
                label="Group email"
                hint="Prefilled from Member profile when available. Does not change the Member record."
              >
                <input
                  type="email"
                  value={participation.participation_email}
                  onChange={(event) =>
                    setParticipation((current) => ({
                      ...current,
                      participation_email: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
            ) : null}
            {group.participation?.pin_required ? (
              <Field label="Group PIN" hint="Attendance check-in code for this Group.">
                <input
                  value={participation.participation_pin}
                  onChange={(event) =>
                    setParticipation((current) => ({
                      ...current,
                      participation_pin: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
            ) : null}
            <button type="submit" className="btn-primary" disabled={saving || !selectedMemberId}>
              Add to Group
            </button>
          </form>

          <form className="add-participant-card add-participant-card-visitor" onSubmit={addParticipant}>
            <header className="add-participant-card-head">
              <span className="add-participant-icon add-participant-icon-visitor" aria-hidden="true">
                ◎
              </span>
              <div>
                <h3>Add Visitor</h3>
                <p className="hint">Someone who exists only in this Group.</p>
              </div>
            </header>
            <Field label="Name">
              <input
                value={participant.name}
                onChange={(event) => setParticipant((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </Field>
            <Field
              label="Group email"
              hint={group.participation?.email_required ? "Required for this Group" : "Optional"}
            >
              <input
                type="email"
                value={participant.email}
                onChange={(event) =>
                  setParticipant((current) => ({ ...current, email: event.target.value }))
                }
                required={group.participation?.email_required}
              />
            </Field>
            <Field
              label="Group PIN"
              hint={group.participation?.pin_required ? "Required for this Group" : "Optional"}
            >
              <input
                value={participant.pin}
                onChange={(event) => setParticipant((current) => ({ ...current, pin: event.target.value }))}
                required={group.participation?.pin_required}
              />
            </Field>
            <button type="submit" className="btn-primary" disabled={saving}>
              Add visitor
            </button>
          </form>
        </div>
      </SectionCard>
    </div>
  );
}

function ParticipantRow({ name, code, kind, email, pin, incomplete, onEdit, onRemove }) {
  return (
    <article className={`participant-row-compact${incomplete ? " incomplete" : ""}`}>
      <div>
        <strong>{name}</strong>
        <p className="participant-row-meta">
          {code} · {kind}
          {incomplete ? " · Needs setup" : ""}
        </p>
      </div>
      <div className="participant-row-meta">{email || "—"}</div>
      <div className="participant-row-meta">{pin || "—"}</div>
      <div className="participant-row-actions">
        <button type="button" className="btn-secondary btn-sm" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="btn-danger-soft btn-sm" onClick={onRemove}>
          Remove
        </button>
      </div>
    </article>
  );
}

function MembershipEditForm({
  session,
  groupId,
  group,
  membership,
  firstFieldRef,
  onCancel,
  onSaved,
  onError,
}) {
  const [values, setValues] = useState({
    participation_email: membership?.participation?.email || "",
    participation_pin: membership?.participation?.pin || "",
  });
  if (!membership) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData();
    data.append("participation_email", values.participation_email);
    if (values.participation_pin && values.participation_pin !== membership.participation?.pin) {
      data.append("participation_pin", values.participation_pin);
    }
    try {
      await api.updateMembership(session, groupId, membership.id, data);
      await onSaved();
    } catch (saveError) {
      onError(errorMessage(saveError));
    }
  }

  return (
    <form className="panel-form card-surface panel-form-edit" onSubmit={handleSubmit}>
      <h3 id="participant-edit-heading">Edit participation for {membership.member.name}</h3>
      <p className="hint">Code {membership.group_participant_code}. Member profile stays unchanged.</p>
      <div className="form-grid">
        <Field label="Group email">
          <input
            ref={firstFieldRef}
            type="email"
            value={values.participation_email}
            onChange={(event) =>
              setValues((current) => ({ ...current, participation_email: event.target.value }))
            }
            required={group.participation?.email_required}
          />
        </Field>
        <Field label="Group PIN" hint="Visible to workspace managers only.">
          <input
            value={values.participation_pin}
            onChange={(event) =>
              setValues((current) => ({ ...current, participation_pin: event.target.value }))
            }
            required={group.participation?.pin_required && !membership.participation?.has_pin}
          />
        </Field>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary">
          Save
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ParticipantEditForm({
  session,
  groupId,
  group,
  participant,
  firstFieldRef,
  onCancel,
  onSaved,
  onError,
}) {
  const [values, setValues] = useState({
    name: participant?.name || "",
    email: participant?.participation?.email || participant?.email || "",
    participation_pin: participant?.participation?.pin || "",
  });
  if (!participant) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData();
    data.append("name", values.name);
    data.append("email", values.email);
    if (values.participation_pin && values.participation_pin !== participant.participation?.pin) {
      data.append("participation_pin", values.participation_pin);
    }
    try {
      await api.updateParticipant(session, groupId, participant.id, data);
      await onSaved();
    } catch (saveError) {
      onError(errorMessage(saveError));
    }
  }

  return (
    <form className="panel-form card-surface panel-form-edit" onSubmit={handleSubmit}>
      <h3 id="participant-edit-heading">Edit {participant.name}</h3>
      <p className="hint">Code {participant.group_participant_code}</p>
      <div className="form-grid">
        <Field label="Name">
          <input
            ref={firstFieldRef}
            value={values.name}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            required
          />
        </Field>
        <Field label="Group email">
          <input
            type="email"
            value={values.email}
            onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
            required={group.participation?.email_required}
          />
        </Field>
        <Field label="Group PIN">
          <input
            value={values.participation_pin}
            onChange={(event) =>
              setValues((current) => ({ ...current, participation_pin: event.target.value }))
            }
            required={group.participation?.pin_required && !participant.participation?.has_pin}
          />
        </Field>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary">
          Save participant
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
