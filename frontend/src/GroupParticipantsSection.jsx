import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api.js";
import { Field, SectionCard } from "./components.jsx";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import { revealParticipantEditPanel } from "./groupParticipantEdit.js";
import {
  compactEmailSlots,
  emailSlotsFromList,
  MAX_PARTICIPATION_EMAILS,
  participationEmailsForEdit,
  participationEmailsForNewMember,
} from "./groupParticipantEmails.js";
import i18n from "./i18n/index.js";

const EMPTY_PARTICIPATION = {
  participation_emails: [""],
  participation_pin: "",
};

function appendParticipationEmails(data, emails) {
  const cleaned = compactEmailSlots(emails);
  data.append("participation_emails", JSON.stringify(cleaned));
}

function formatParticipantEmails(emails, fallback = "") {
  const list = Array.isArray(emails) && emails.length ? emails : fallback ? [fallback] : [];
  if (!list.length) {
    return i18n.t("members:form.emptyValue");
  }
  return list.join(", ");
}

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
  operationsDisabled = false,
}) {
  const { t } = useTranslation(["groups", "common", "errors"]);
  const [memberships, setMemberships] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [available, setAvailable] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [participation, setParticipation] = useState(EMPTY_PARTICIPATION);
  const [participant, setParticipant] = useState({ name: "", emails: [""], pin: "" });
  const [addingMember, setAddingMember] = useState(false);
  const [addingVisitor, setAddingVisitor] = useState(false);
  const [addSuccessKind, setAddSuccessKind] = useState(null);
  const [editingMembershipId, setEditingMembershipId] = useState(null);
  const [editingParticipantId, setEditingParticipantId] = useState(null);
  const addingMemberRef = useRef(false);
  const addingVisitorRef = useRef(false);
  const addSuccessTimerRef = useRef(null);
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
    load().catch((loadError) => onError?.(localizedErrorMessage(loadError, t)));
  }, [groupId, classId]);

  useEffect(
    () => () => {
      if (addSuccessTimerRef.current) {
        window.clearTimeout(addSuccessTimerRef.current);
      }
    },
    [],
  );

  const selectedMember = available.find((member) => String(member.id) === String(selectedMemberId));
  const participantCount = memberships.length + participants.length;
  const scopeLabel = classId ? t("participants.scopeClass") : t("participants.scopeGroup");

  useEffect(() => {
    if (!selectedMember) {
      setParticipation(EMPTY_PARTICIPATION);
      return;
    }
    setParticipation({
      participation_emails: participationEmailsForNewMember(selectedMember),
      participation_pin: "",
    });
  }, [selectedMemberId, selectedMember]);

  async function refresh() {
    await load();
    if (onChanged) {
      await onChanged();
    }
  }

  function clearAddSuccess() {
    if (addSuccessTimerRef.current) {
      window.clearTimeout(addSuccessTimerRef.current);
      addSuccessTimerRef.current = null;
    }
    setAddSuccessKind(null);
  }

  function showAddSuccess(kind) {
    if (addSuccessTimerRef.current) {
      window.clearTimeout(addSuccessTimerRef.current);
    }
    setAddSuccessKind(kind);
    addSuccessTimerRef.current = window.setTimeout(() => {
      setAddSuccessKind(null);
      addSuccessTimerRef.current = null;
    }, 1800);
  }

  async function addMember(event) {
    event.preventDefault();
    if (!selectedMember || addingMemberRef.current) {
      return;
    }
    addingMemberRef.current = true;
    setAddingMember(true);
    clearAddSuccess();
    onError?.("");
    const data = new FormData();
    data.append("member_id", selectedMember.id);
    const cleanedEmails = compactEmailSlots(participation.participation_emails);
    if (cleanedEmails.length) {
      appendParticipationEmails(data, cleanedEmails);
    }
    if (participation.participation_pin) {
      data.append("participation_pin", participation.participation_pin);
    }
    try {
      await api.createMembership(session, groupId, data, classId);
      setSelectedMemberId("");
      setParticipation(EMPTY_PARTICIPATION);
      await refresh();
      showAddSuccess("member");
    } catch (saveError) {
      onError?.(localizedErrorMessage(saveError, t));
    } finally {
      addingMemberRef.current = false;
      setAddingMember(false);
    }
  }

  async function addParticipant(event) {
    event.preventDefault();
    if (addingVisitorRef.current) {
      return;
    }
    addingVisitorRef.current = true;
    setAddingVisitor(true);
    clearAddSuccess();
    onError?.("");
    const data = new FormData();
    data.append("name", participant.name);
    appendParticipationEmails(data, participant.emails);
    if (participant.pin) {
      data.append("participation_pin", participant.pin);
    }
    try {
      await api.createParticipant(session, groupId, data, classId);
      setParticipant({ name: "", emails: [""], pin: "" });
      await refresh();
      showAddSuccess("visitor");
    } catch (saveError) {
      onError?.(localizedErrorMessage(saveError, t));
    } finally {
      addingVisitorRef.current = false;
      setAddingVisitor(false);
    }
  }

  async function removeMembership(membership) {
    if (
      !window.confirm(
        t("participants.confirmRemoveMember", {
          name: membership.effective.name,
          scope: scopeLabel,
        }),
      )
    ) {
      return;
    }
    await api.removeMembership(session, groupId, membership.id, classId);
    await refresh();
  }

  async function removeParticipant(record) {
    if (
      !window.confirm(
        t("participants.confirmRemoveParticipant", { name: record.name, scope: scopeLabel }),
      )
    ) {
      return;
    }
    await api.removeParticipant(session, groupId, record.id, classId);
    await refresh();
  }

  return (
    <SectionCard title={t("participants.title", { count: participantCount })} id="group-participants">
      <div className="participant-list-scroll">
        <div className="participant-table">
          {memberships.map((membership) => (
            <ParticipantRow
              key={`m-${membership.id}`}
              name={membership.effective.name}
              code={membership.group_participant_code}
              kind={t("participants.kindMember")}
              email={formatParticipantEmails(
                membership.participation?.emails || membership.participation_emails,
                membership.participation?.email,
              )}
              pin={
                membership.participation?.has_pin
                  ? t("participants.pinIsSet")
                  : ""
              }
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
              kind={t("participants.kindVisitor")}
              email={formatParticipantEmails(
                record.participation?.emails || record.participation_emails,
                record.participation?.email || record.email,
              )}
              pin={record.participation?.has_pin ? t("participants.pinIsSet") : ""}
              incomplete={!record.participation?.complete}
              onEdit={() => beginEditParticipant(record.id)}
              onRemove={() => removeParticipant(record)}
            />
          ))}
          {participantCount === 0 ? <p className="hint">{t("participants.none")}</p> : null}
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
        {operationsDisabled ? (
          <p className="plan-locked-copy">{t("participants.planLocked")}</p>
        ) : (
          <>
        <form className="add-participant-card add-participant-card-member" onSubmit={addMember}>
          <header className="add-participant-card-head">
            <span className="add-participant-icon" aria-hidden="true">
              ◉
            </span>
            <div>
              <h3>{t("participants.addExistingMember")}</h3>
              <p className="hint">{t("participants.addExistingMemberHint")}</p>
            </div>
          </header>
          <Field label={t("participants.memberField")}>
            <select
              value={selectedMemberId}
              onChange={(event) => setSelectedMemberId(event.target.value)}
              required
            >
              <option value="">{t("participants.selectMember")}</option>
              {available.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </Field>
          <ParticipationEmailsEditor
            emails={participation.participation_emails}
            required={group.participation?.email_required}
            hint={
              group.participation?.email_required
                ? t("participants.emailPrefilledHint")
                : t("participants.emailOptionalHint")
            }
            onChange={(next) =>
              setParticipation((current) => ({
                ...current,
                participation_emails: next,
              }))
            }
          />
          {group.participation?.pin_required ? (
            <Field label={t("participants.groupPinField")} hint={t("participants.groupPinHint")}>
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
          <div className="participant-add-submit">
            <button
              type="submit"
              className="btn-primary"
              disabled={addingMember || !selectedMemberId}
            >
              {addingMember
                ? t("participants.adding")
                : t("participants.addToScope", { scope: scopeLabel })}
            </button>
            <span
              className={`participant-add-success${addSuccessKind === "member" ? " is-visible" : ""}`}
              role="status"
              aria-live="polite"
            >
              {addSuccessKind === "member" ? t("participants.added") : ""}
            </span>
          </div>
        </form>

        <form className="add-participant-card add-participant-card-visitor" onSubmit={addParticipant}>
          <header className="add-participant-card-head">
            <span className="add-participant-icon add-participant-icon-visitor" aria-hidden="true">
              ◎
            </span>
            <div>
              <h3>{t("participants.addVisitor")}</h3>
              <p className="hint">{t("participants.addVisitorHint", { scope: scopeLabel })}</p>
            </div>
          </header>
          <Field label={t("editor.nameField")}>
            <input
              value={participant.name}
              onChange={(event) => setParticipant((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </Field>
          <ParticipationEmailsEditor
            emails={participant.emails}
            required={group.participation?.email_required}
            hint={
              group.participation?.email_required
                ? t("participants.emailRequiredForGroup")
                : t("common:optional")
            }
            onChange={(next) => setParticipant((current) => ({ ...current, emails: next }))}
          />
          <Field
            label={t("participants.groupPinField")}
            hint={
              group.participation?.pin_required
                ? t("participants.pinRequiredForGroup")
                : t("common:optional")
            }
          >
            <input
              value={participant.pin}
              onChange={(event) => setParticipant((current) => ({ ...current, pin: event.target.value }))}
              required={group.participation?.pin_required}
            />
          </Field>
          <div className="participant-add-submit">
            <button type="submit" className="btn-primary" disabled={addingVisitor}>
              {addingVisitor ? t("participants.adding") : t("participants.addVisitorButton")}
            </button>
            <span
              className={`participant-add-success${addSuccessKind === "visitor" ? " is-visible" : ""}`}
              role="status"
              aria-live="polite"
            >
              {addSuccessKind === "visitor" ? t("participants.added") : ""}
            </span>
          </div>
        </form>
          </>
        )}
      </div>
    </SectionCard>
  );
}

function ParticipationEmailsEditor({ emails, onChange, required = false, hint = "", firstFieldRef = null }) {
  const { t } = useTranslation(["groups", "common"]);
  const slots = emailSlotsFromList(emails);
  const numbered = slots.length > 1;

  function updateSlot(index, value) {
    const next = [...slots];
    next[index] = value;
    onChange(next);
  }

  function addSlot() {
    if (slots.length >= MAX_PARTICIPATION_EMAILS) {
      return;
    }
    onChange([...slots, ""]);
  }

  function removeSlot(index) {
    if (slots.length <= 1) {
      onChange([""]);
      return;
    }
    const next = slots.filter((_, slotIndex) => slotIndex !== index);
    onChange(next.length ? next : [""]);
  }

  return (
    <div className="participation-emails-editor">
      {slots.map((email, index) => (
        <Field
          key={`participation-email-${index}`}
          label={
            numbered
              ? t("participants.groupEmailNumbered", { number: index + 1 })
              : t("participants.groupEmail")
          }
          hint={index === 0 ? hint : undefined}
        >
          <div className="forward-email-input-row">
            <input
              ref={index === 0 ? firstFieldRef : undefined}
              type="email"
              value={email}
              onChange={(event) => updateSlot(index, event.target.value)}
              placeholder="email@example.com"
              autoComplete="off"
              required={required && index === 0}
            />
            {numbered && index > 0 ? (
              <button type="button" className="btn-text" onClick={() => removeSlot(index)}>
                {t("common:remove")}
              </button>
            ) : null}
          </div>
        </Field>
      ))}
      {slots.length < MAX_PARTICIPATION_EMAILS ? (
        <button type="button" className="btn-secondary btn-sm" onClick={addSlot}>
          {t("participants.addAnotherEmail")}
        </button>
      ) : null}
      <p className="hint participation-emails-helper">{t("participants.notificationsHint")}</p>
    </div>
  );
}

function ParticipantRow({ name, code, kind, email, pin, incomplete, onEdit, onRemove }) {
  const { t } = useTranslation(["groups", "common"]);
  const emptyValue = t("members:form.emptyValue");
  return (
    <article className={`participant-row-compact${incomplete ? " incomplete" : ""}`}>
      <div>
        <strong>{name}</strong>
        <p className="participant-row-meta">
          {code} · {kind}
          {incomplete ? ` · ${t("participants.needsSetup")}` : ""}
        </p>
      </div>
      <div className="participant-row-meta">{email || emptyValue}</div>
      <div className="participant-row-meta">{pin || emptyValue}</div>
      <div className="participant-row-actions">
        <button type="button" className="btn-secondary btn-sm" onClick={onEdit}>
          {t("common:edit")}
        </button>
        <button type="button" className="btn-danger-soft btn-sm" onClick={onRemove}>
          {t("detail.remove")}
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
  const { t } = useTranslation(["groups", "common", "errors"]);
  const [values, setValues] = useState({
    participation_emails: participationEmailsForEdit(
      membership?.participation?.emails || membership?.participation_emails,
      membership?.participation?.email || "",
    ),
    participation_pin: "",
  });
  if (!membership) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData();
    appendParticipationEmails(data, values.participation_emails);
    if (values.participation_pin) {
      data.append("participation_pin", values.participation_pin);
    }
    try {
      await api.updateMembership(session, groupId, membership.id, data, classId);
      await onSaved();
    } catch (saveError) {
      onError?.(localizedErrorMessage(saveError, t));
    }
  }

  return (
    <form className="panel-form card-surface panel-form-edit" onSubmit={handleSubmit}>
      <h3 id="participant-edit-heading">
        {t("participants.editParticipationFor", { name: membership.member.name })}
      </h3>
      <p className="hint">
        {t("participants.codeHintMember", { code: membership.group_participant_code })}
      </p>
      <div className="form-grid">
        <ParticipationEmailsEditor
          emails={values.participation_emails}
          required={group.participation?.email_required}
          firstFieldRef={firstFieldRef}
          onChange={(next) =>
            setValues((current) => ({ ...current, participation_emails: next }))
          }
        />
        <Field
          label={t("participants.groupPinField")}
          hint={
            membership.participation?.has_pin
              ? t("participants.groupPinKeepHint")
              : t("participants.groupPinManagersHint")
          }
        >
          <input
            value={values.participation_pin}
            onChange={(event) =>
              setValues((current) => ({ ...current, participation_pin: event.target.value }))
            }
            placeholder={
              membership.participation?.has_pin
                ? t("participants.pinChangePlaceholder")
                : t("participants.pinSetPlaceholder")
            }
            autoComplete="off"
            required={group.participation?.pin_required && !membership.participation?.has_pin}
          />
        </Field>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary">
          {t("common:save")}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {t("common:cancel")}
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
  const { t } = useTranslation(["groups", "common", "errors"]);
  const [values, setValues] = useState({
    name: participant?.name || "",
    emails: participationEmailsForEdit(
      participant?.participation?.emails || participant?.participation_emails,
      participant?.participation?.email || participant?.email || "",
    ),
    participation_pin: "",
  });
  if (!participant) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData();
    data.append("name", values.name);
    appendParticipationEmails(data, values.emails);
    if (values.participation_pin) {
      data.append("participation_pin", values.participation_pin);
    }
    try {
      await api.updateParticipant(session, groupId, participant.id, data, classId);
      await onSaved();
    } catch (saveError) {
      onError?.(localizedErrorMessage(saveError, t));
    }
  }

  return (
    <form className="panel-form card-surface panel-form-edit" onSubmit={handleSubmit}>
      <h3 id="participant-edit-heading">{t("participants.editParticipant", { name: participant.name })}</h3>
      <p className="hint">{t("participants.codeHint", { code: participant.group_participant_code })}</p>
      <div className="form-grid">
        <Field label={t("editor.nameField")}>
          <input
            ref={firstFieldRef}
            value={values.name}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            required
          />
        </Field>
        <ParticipationEmailsEditor
          emails={values.emails}
          required={group.participation?.email_required}
          onChange={(next) => setValues((current) => ({ ...current, emails: next }))}
        />
        <Field
          label={t("participants.groupPinField")}
          hint={
            participant.participation?.has_pin
              ? t("participants.groupPinKeepHint")
              : t("participants.groupPinManagersHint")
          }
        >
          <input
            value={values.participation_pin}
            onChange={(event) =>
              setValues((current) => ({ ...current, participation_pin: event.target.value }))
            }
            placeholder={
              participant.participation?.has_pin
                ? t("participants.pinChangePlaceholder")
                : t("participants.pinSetPlaceholder")
            }
            autoComplete="off"
            required={group.participation?.pin_required && !participant.participation?.has_pin}
          />
        </Field>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary">
          {t("participants.saveParticipant")}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {t("common:cancel")}
        </button>
      </div>
    </form>
  );
}
