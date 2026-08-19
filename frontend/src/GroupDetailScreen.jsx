import { useEffect, useState } from "react";
import { api, errorMessage } from "./api.js";
import { CodeBadge, ErrorBanner, Field, LoadingState, PhotoThumb, SectionCard, StatusBadge, kioskThemeLabel } from "./components.jsx";
import { actionSummary } from "./GroupsScreen.jsx";

const EMPTY_OVERRIDES = {
  override_name: "",
  override_email: "",
  override_check_in_identifier: "",
  override_pin: "",
  override_photo: null,
};

export default function GroupDetailScreen({ session, groupId, onNavigate }) {
  const [group, setGroup] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [available, setAvailable] = useState([]);
  const [error, setError] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [overrides, setOverrides] = useState(EMPTY_OVERRIDES);
  const [participant, setParticipant] = useState({
    name: "",
    email: "",
    check_in_identifier: "",
    pin: "",
    photo: null,
  });
  const [saving, setSaving] = useState(false);
  const [editingMembershipId, setEditingMembershipId] = useState(null);
  const [editingParticipantId, setEditingParticipantId] = useState(null);

  async function load() {
    setError("");
    try {
      const [groupResult, membershipResult, participantResult, availableResult] =
        await Promise.all([
          api.getGroup(session, groupId),
          api.listMemberships(session, groupId),
          api.listParticipants(session, groupId),
          api.listAvailableMembers(session, groupId),
        ]);
      setGroup(groupResult.data);
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

  async function addMember(event) {
    event.preventDefault();
    if (!selectedMember) {
      return;
    }
    setSaving(true);
    setError("");
    const data = new FormData();
    data.append("member_id", selectedMember.id);
    if (overrides.override_name) {
      data.append("override_name", overrides.override_name);
    }
    if (overrides.override_email) {
      data.append("override_email", overrides.override_email);
    }
    if (overrides.override_check_in_identifier) {
      data.append("override_check_in_identifier", overrides.override_check_in_identifier);
    }
    if (overrides.override_pin) {
      data.append("override_pin", overrides.override_pin);
    }
    if (overrides.override_photo) {
      data.append("override_photo", overrides.override_photo);
    }
    try {
      await api.createMembership(session, groupId, data);
      setSelectedMemberId("");
      setOverrides(EMPTY_OVERRIDES);
      await load();
    } catch (saveError) {
      setError(formatRequirementError(saveError, "This Group requires additional information before the Member can be added."));
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
    if (participant.check_in_identifier) {
      data.append("check_in_identifier", participant.check_in_identifier);
    }
    if (participant.pin) {
      data.append("pin", participant.pin);
    }
    if (participant.photo) {
      data.append("photo", participant.photo);
    }
    try {
      await api.createParticipant(session, groupId, data);
      setParticipant({ name: "", email: "", check_in_identifier: "", pin: "", photo: null });
      await load();
    } catch (saveError) {
      setError(formatRequirementError(saveError, "This Group requires additional information for a Group-only Participant."));
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
          <h2>{group.name}</h2>
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

      <div className="summary-grid">
        <article className="summary-card">
          <h3>Requirements</h3>
          <ul className="summary-list">
            {Object.entries(group.requirements).map(([key, value]) => (
              <li key={key}>
                <span>{labelFor(key)}</span>
                <strong>{value}</strong>
              </li>
            ))}
          </ul>
        </article>
        <article className="summary-card">
          <h3>People</h3>
          <p className="summary-stat">
            <strong>{group.member_count}</strong> reusable Members
          </p>
          <p className="summary-stat">
            <strong>{group.group_only_participant_count}</strong> Group-only Participants
          </p>
        </article>
        <article className="summary-card">
          <h3>After-action email</h3>
          <ul className="summary-list compact">
            <li>
              <span>Check-in</span>
              <strong>{group.notifications.check_in.send_email ? "On" : "Off"}</strong>
            </li>
            <li>
              <span>Check-out</span>
              <strong>{group.notifications.check_out.send_email ? "On" : "Off"}</strong>
            </li>
            <li>
              <span>Break</span>
              <strong>{group.notifications.break.send_email ? "On" : "Off"}</strong>
            </li>
          </ul>
        </article>

        <article className="summary-card summary-card-kiosk">
          <h3>Kiosk</h3>
          {group.kiosk?.kiosk_enabled ? (
            <>
              <ul className="summary-list compact">
                <li>
                  <span>Mode</span>
                  <strong>{group.kiosk.kiosk_mode === "member_list" ? "Member list" : "Input"}</strong>
                </li>
                <li>
                  <span>Theme</span>
                  <strong>{kioskThemeLabel(group.kiosk.kiosk_theme)}</strong>
                </li>
                <li>
                  <span>PIN</span>
                  <strong>{group.requirements.pin === "required" ? "Required" : "Not required"}</strong>
                </li>
              </ul>
            </>
          ) : (
            <p className="hint" style={{ marginTop: "0.5rem" }}>
              Kiosk is disabled for this Group.
            </p>
          )}
        </article>
      </div>

      {group.kiosk?.kiosk_enabled ? (
        <div className="kiosk-launch-panel">
          <div>
            <h3 style={{ marginBottom: "0.25rem" }}>Launch kiosk</h3>
            <p className="hint">Open the participant-facing check-in screen for this Group.</p>
          </div>
          <button
            type="button"
            className="btn-success"
            onClick={() => onNavigate({ name: "kiosk", groupId })}
          >
            Launch Kiosk
          </button>
        </div>
      ) : null}

      <SectionCard title="Reusable Members in this Group">
        {memberships.length === 0 ? <p className="hint">No Members in this Group yet.</p> : null}
        <div className="list">
          {memberships.map((membership) => (
            <article key={membership.id} className="person-row">
              <div className="person-main static">
                <PhotoThumb
                  url={membership.effective.photo_url}
                  name={membership.effective.name}
                />
                <div className="person-copy">
                  <strong>{membership.effective.name}</strong>
                  <p className="person-subtitle">
                    <CodeBadge>{membership.member.internal_code}</CodeBadge>
                    {membership.effective.email ? <span>{membership.effective.email}</span> : null}
                    {membership.effective.check_in_identifier ? (
                      <span>{membership.effective.check_in_identifier}</span>
                    ) : null}
                  </p>
                  {membership.overrides.email ? (
                    <p className="override-note">Group email override: {membership.overrides.email}</p>
                  ) : null}
                </div>
              </div>
              <div className="person-meta">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    setEditingMembershipId(
                      editingMembershipId === membership.id ? null : membership.id
                    )
                  }
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-danger-soft btn-sm"
                  onClick={() => removeMembership(membership)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
        {editingMembershipId ? (
          <MembershipEditForm
            session={session}
            groupId={groupId}
            membership={memberships.find((item) => item.id === editingMembershipId)}
            onCancel={() => setEditingMembershipId(null)}
            onSaved={async () => {
              setEditingMembershipId(null);
              await load();
            }}
            onError={setError}
          />
        ) : null}
        <form className="panel-form card-surface" onSubmit={addMember}>
          <h3>Add existing Member</h3>
          <Field label="Member">
            <select
              value={selectedMemberId}
              onChange={(event) => {
                setSelectedMemberId(event.target.value);
                setOverrides(EMPTY_OVERRIDES);
              }}
              required
            >
              <option value="">Select an active Member</option>
              {available.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {member.missing_required_fields.length
                    ? ` — missing ${member.missing_required_fields.join(", ")}`
                    : ""}
                </option>
              ))}
            </select>
          </Field>
          {selectedMember?.missing_required_fields?.length ? (
            <div className="missing-box">
              <p>
                {selectedMember.field_messages[selectedMember.missing_required_fields[0]] ||
                  "This Group requires additional information for every participant."}
              </p>
              <p className="hint">
                Enter Group-specific values below. They will not change the reusable Member record.
              </p>
              {selectedMember.missing_required_fields.includes("email") ? (
                <Field label="Group-specific email">
                  <input
                    type="email"
                    value={overrides.override_email}
                    onChange={(event) =>
                      setOverrides((current) => ({ ...current, override_email: event.target.value }))
                    }
                    required
                  />
                </Field>
              ) : null}
              {selectedMember.missing_required_fields.includes("check_in_identifier") ? (
                <Field label="Group-specific member identifier">
                  <input
                    value={overrides.override_check_in_identifier}
                    onChange={(event) =>
                      setOverrides((current) => ({
                        ...current,
                        override_check_in_identifier: event.target.value,
                      }))
                    }
                    required
                  />
                </Field>
              ) : null}
              {selectedMember.missing_required_fields.includes("pin") ? (
                <Field label="Group-specific PIN">
                  <input
                    type="password"
                    value={overrides.override_pin}
                    onChange={(event) =>
                      setOverrides((current) => ({ ...current, override_pin: event.target.value }))
                    }
                    required
                  />
                </Field>
              ) : null}
              {selectedMember.missing_required_fields.includes("photo") ? (
                <Field label="Group-specific photo">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      setOverrides((current) => ({
                        ...current,
                        override_photo: event.target.files[0] || null,
                      }))
                    }
                    required
                  />
                </Field>
              ) : null}
            </div>
          ) : null}
          <button type="submit" className="btn-primary" disabled={saving || !selectedMemberId}>
            Add to Group
          </button>
        </form>
      </SectionCard>

      <SectionCard
        title="Group-only Participants"
        description="These people exist only in this Group. They never appear in the Members directory."
      >
        {participants.length === 0 ? <p className="hint">No Group-only Participants yet.</p> : null}
        <div className="list">
          {participants.map((record) => (
            <article key={record.id} className="person-row">
              <div className="person-main static">
                <PhotoThumb url={record.photo_url} name={record.name} />
                <div>
                  <strong>{record.name}</strong>
                  <p>
                    Group-only
                    {record.email ? ` · ${record.email}` : ""}
                    {record.check_in_identifier ? ` · ${record.check_in_identifier}` : ""}
                  </p>
                </div>
              </div>
              <div className="person-meta">
                <StatusBadge status="group-only" />
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    setEditingParticipantId(editingParticipantId === record.id ? null : record.id)
                  }
                >
                  Edit
                </button>
                <button type="button" className="btn-danger-soft btn-sm" onClick={() => removeParticipant(record)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
        {editingParticipantId ? (
          <ParticipantEditForm
            session={session}
            groupId={groupId}
            participant={participants.find((item) => item.id === editingParticipantId)}
            onCancel={() => setEditingParticipantId(null)}
            onSaved={async () => {
              setEditingParticipantId(null);
              await load();
            }}
            onError={setError}
          />
        ) : null}
        <form className="panel-form card-surface" onSubmit={addParticipant}>
          <h3>Add Group-only Participant</h3>
          <Field label="Name">
            <input
              value={participant.name}
              onChange={(event) => setParticipant((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </Field>
          <div className="form-grid">
            <Field label="Email" hint={hintFor(group, "email")}>
              <input
                type="email"
                value={participant.email}
                onChange={(event) =>
                  setParticipant((current) => ({ ...current, email: event.target.value }))
                }
                required={group.requirements.email === "required"}
              />
            </Field>
            <Field label="Member identifier" hint={hintFor(group, "check_in_identifier")}>
              <input
                value={participant.check_in_identifier}
                onChange={(event) =>
                  setParticipant((current) => ({
                    ...current,
                    check_in_identifier: event.target.value,
                  }))
                }
                required={group.requirements.check_in_identifier === "required"}
              />
            </Field>
            <Field label="PIN" hint={hintFor(group, "pin")}>
              <input
                type="password"
                value={participant.pin}
                onChange={(event) =>
                  setParticipant((current) => ({ ...current, pin: event.target.value }))
                }
                required={group.requirements.pin === "required"}
              />
            </Field>
            <Field label="Photo" hint={hintFor(group, "photo")}>
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setParticipant((current) => ({
                    ...current,
                    photo: event.target.files[0] || null,
                  }))
                }
                required={group.requirements.photo === "required"}
              />
            </Field>
          </div>
          <button type="submit" className="btn-primary" disabled={saving}>
            Add Group-only Participant
          </button>
        </form>
      </SectionCard>
    </div>
  );
}

function labelFor(key) {
  return {
    name: "Name",
    email: "Email",
    photo: "Photo",
    check_in_identifier: "Member identifier",
    pin: "PIN",
  }[key] || key;
}

function hintFor(group, field) {
  return group.requirements[field] === "required" ? "Required for this Group" : "Optional";
}

function formatRequirementError(error, fallback) {
  if (error?.data?.detail) {
    return error.data.detail;
  }
  if (error?.data?.missing_fields) {
    return `${fallback} Missing: ${error.data.missing_fields.join(", ")}.`;
  }
  return errorMessage(error);
}

function MembershipEditForm({ session, groupId, membership, onCancel, onSaved, onError }) {
  const [values, setValues] = useState({
    override_name: membership?.overrides.name || "",
    override_email: membership?.overrides.email || "",
    override_check_in_identifier: membership?.overrides.check_in_identifier || "",
    override_pin: "",
    override_photo: null,
  });
  if (!membership) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData();
    data.append("override_name", values.override_name);
    data.append("override_email", values.override_email);
    data.append("override_check_in_identifier", values.override_check_in_identifier);
    if (values.override_pin) {
      data.append("override_pin", values.override_pin);
    }
    if (values.override_photo) {
      data.append("override_photo", values.override_photo);
    }
    try {
      await api.updateMembership(session, groupId, membership.id, data);
      await onSaved();
    } catch (saveError) {
      onError(formatRequirementError(saveError, "Could not save Group-specific values."));
    }
  }

  return (
    <form className="panel-form card-surface panel-form-edit" onSubmit={handleSubmit}>
      <h3>Edit Group-specific values for {membership.member.name}</h3>
      <p className="hint">
        These values apply only in this Group. The reusable Member record stays unchanged.
      </p>
      <div className="form-grid">
        <Field label="Display name override">
          <input
            value={values.override_name}
            onChange={(event) => setValues((current) => ({ ...current, override_name: event.target.value }))}
          />
        </Field>
        <Field label="Email override">
          <input
            type="email"
            value={values.override_email}
            onChange={(event) => setValues((current) => ({ ...current, override_email: event.target.value }))}
          />
        </Field>
        <Field label="Member identifier override">
          <input
            value={values.override_check_in_identifier}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                override_check_in_identifier: event.target.value,
              }))
            }
          />
        </Field>
        <Field label="PIN override" hint={membership.overrides.has_pin ? "A Group PIN is set" : "Optional"}>
          <input
            type="password"
            value={values.override_pin}
            onChange={(event) => setValues((current) => ({ ...current, override_pin: event.target.value }))}
          />
        </Field>
        <Field label="Photo override">
          <input
            type="file"
            accept="image/*"
            onChange={(event) =>
              setValues((current) => ({ ...current, override_photo: event.target.files[0] || null }))
            }
          />
        </Field>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary">Save overrides</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ParticipantEditForm({ session, groupId, participant, onCancel, onSaved, onError }) {
  const [values, setValues] = useState({
    name: participant?.name || "",
    email: participant?.email || "",
    check_in_identifier: participant?.check_in_identifier || "",
    pin: "",
    photo: null,
  });
  if (!participant) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData();
    data.append("name", values.name);
    data.append("email", values.email);
    data.append("check_in_identifier", values.check_in_identifier);
    if (values.pin) {
      data.append("pin", values.pin);
    }
    if (values.photo) {
      data.append("photo", values.photo);
    }
    try {
      await api.updateParticipant(session, groupId, participant.id, data);
      await onSaved();
    } catch (saveError) {
      onError(formatRequirementError(saveError, "Could not save this Group-only Participant."));
    }
  }

  return (
    <form className="panel-form card-surface panel-form-edit" onSubmit={handleSubmit}>
      <h3>Edit {participant.name}</h3>
      <div className="form-grid">
        <Field label="Name">
          <input
            value={values.name}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            required
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={values.email}
            onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
          />
        </Field>
        <Field label="Member identifier">
          <input
            value={values.check_in_identifier}
            onChange={(event) =>
              setValues((current) => ({ ...current, check_in_identifier: event.target.value }))
            }
          />
        </Field>
        <Field label="PIN" hint={participant.has_pin ? "A PIN is set" : "Optional"}>
          <input
            type="password"
            value={values.pin}
            onChange={(event) => setValues((current) => ({ ...current, pin: event.target.value }))}
          />
        </Field>
        <Field label="Photo">
          <input
            type="file"
            accept="image/*"
            onChange={(event) =>
              setValues((current) => ({ ...current, photo: event.target.files[0] || null }))
            }
          />
        </Field>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary">Save participant</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
