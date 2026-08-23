import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, errorMessage } from "./api.js";
import { Field, SectionCard } from "./components.jsx";
import { revealParticipantEditPanel } from "./groupParticipantEdit.js";

const EMPTY_PARTICIPATION = {
  participation_email: "",
  participation_pin: "",
};

/**
 * Shared participant list + add/edit for Standard Groups and Classes.
 * Pass classId for Structured Group Class context.
 */
export default function GroupParticipantsSection({
  session,
  group,
  groupId,
  classId = null,
  onError,
  onChanged,
}) {
  const [memberships, setMemberships] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [available, setAvailable] = useState([]);
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
    const [membershipResult, participantResult, availableResult] = await Promise.all([
      api.listMemberships(session, groupId, classId),
      api.listParticipants(session, groupId, classId),
      api.listAvailableMembers(session, groupId, classId),
    ]);
    setMemberships(membershipResult.data);
    setParticipants(participantResult.data);
    setAvailable(availableResult.data);
  }

  useEffect(() => {
    load().catch((loadError) => onError?.(errorMessage(loadError)));
  }, [groupId, classId]);

  const selectedMember = available.find((member) => String(member.id) === String(selectedMemberId));
  const participantCount = memberships.length + participants.length;
  const scopeLabel = classId ? "Class" : "Group";

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

  async function refresh() {
    await load();
    if (onChanged) {
      await onChanged();
    }
  }

  async function addMember(event) {
    event.preventDefault();
    if (!selectedMember) {
      return;
    }
    setSaving(true);
    onError?.("");
    const data = new FormData();
    data.append("member_id", selectedMember.id);
    if (participation.participation_email) {
      data.append("participation_email", participation.participation_email);
    }
    if (participation.participation_pin) {
      data.append("participation_pin", participation.participation_pin);
    }
    try {
      await api.createMembership(session, groupId, data, classId);
      setSelectedMemberId("");
      setParticipation(EMPTY_PARTICIPATION);
      await refresh();
    } catch (saveError) {
      onError?.(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function addParticipant(event) {
    event.preventDefault();
    setSaving(true);
    onError?.("");
    const data = new FormData();
    data.append("name", participant.name);
    if (participant.email) {
      data.append("email", participant.email);
    }
    if (participant.pin) {
      data.append("participation_pin", participant.pin);
    }
    try {
      await api.createParticipant(session, groupId, data, classId);
      setParticipant({ name: "", email: "", pin: "" });
      await refresh();
    } catch (saveError) {
      onError?.(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function removeMembership(membership) {
    if (
      !window.confirm(
        `Remove ${membership.effective.name} from this ${scopeLabel}? The reusable Member will be kept.`,
      )
    ) {
      return;
    }
    await api.removeMembership(session, groupId, membership.id, classId);
    await refresh();
  }

  async function removeParticipant(record) {
    if (!window.confirm(`Remove ${record.name} from this ${scopeLabel}?`)) {
      return;
    }
    await api.removeParticipant(session, groupId, record.id, classId);
    await refresh();
  }

  return (
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
              classId={classId}
              group={group}
              membership={memberships.find((item) => item.id === editingMembershipId)}
              firstFieldRef={editFocusRef}
              onCancel={() => setEditingMembershipId(null)}
              onSaved={async () => {
                setEditingMembershipId(null);
                await refresh();
              }}
              onError={onError}
            />
          ) : null}
          {editingParticipantId ? (
            <ParticipantEditForm
              key={`participant-${editingParticipantId}`}
              session={session}
              groupId={groupId}
              classId={classId}
              group={group}
              participant={participants.find((item) => item.id === editingParticipantId)}
              firstFieldRef={editFocusRef}
              onCancel={() => setEditingParticipantId(null)}
              onSaved={async () => {
                setEditingParticipantId(null);
                await refresh();
              }}
              onError={onError}
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
            Add to {scopeLabel}
          </button>
        </form>

        <form className="add-participant-card add-participant-card-visitor" onSubmit={addParticipant}>
          <header className="add-participant-card-head">
            <span className="add-participant-icon add-participant-icon-visitor" aria-hidden="true">
              ◎
            </span>
            <div>
              <h3>Add Visitor</h3>
              <p className="hint">Someone who exists only in this {scopeLabel}.</p>
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
  classId,
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
      await api.updateMembership(session, groupId, membership.id, data, classId);
      await onSaved();
    } catch (saveError) {
      onError?.(errorMessage(saveError));
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
  classId,
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
      await api.updateParticipant(session, groupId, participant.id, data, classId);
      await onSaved();
    } catch (saveError) {
      onError?.(errorMessage(saveError));
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
