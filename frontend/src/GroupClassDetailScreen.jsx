import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api.js";
import { ErrorBanner, Field, LoadingState, PasswordInput, StatusBadge } from "./components.jsx";
import GroupParticipantsSection from "./GroupParticipantsSection.jsx";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import { formatClassId, formatGroupId, setupIncompleteSummary } from "./groupForm.js";

export default function GroupClassDetailScreen({ session, groupId, classId, onNavigate }) {
  const { t } = useTranslation(["groups", "common", "errors"]);
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
      setPinDraft("");
    } catch (loadError) {
      setError(localizedErrorMessage(loadError, t));
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
      if (pinDraft.trim()) {
        body.class_pin = pinDraft.trim();
      }
      const updated = await api.updateGroupClass(session, groupId, classId, body);
      setSection(updated.data);
      setPinDraft("");
      setEditing(false);
      await load();
    } catch (saveError) {
      setError(localizedErrorMessage(saveError, t));
    } finally {
      setSaving(false);
    }
  }

  if (!group || !section) {
    return (
      <div className="page">
        <ErrorBanner message={error} />
        <LoadingState label={t("loadingClass")} />
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
            {t("classDetail.participantLine", {
              groupId: formatGroupId(group.id),
              groupName: group.name,
              count: section.participant_count,
            })}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-secondary" onClick={() => setEditing((open) => !open)}>
            {editing ? t("classDetail.cancelEdit") : t("classDetail.editClass")}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate({ name: "group-detail", groupId })}
          >
            {t("backToGroup")}
          </button>
        </div>
      </header>

      <ErrorBanner message={error} />

      {setupIncomplete ? (
        <div className="setup-incomplete-banner">
          <div>
            <strong>{t("classDetail.groupSetupIncomplete")}</strong>
            <p className="hint">{setupSummary || t("classDetail.completeAcrossClasses")}</p>
          </div>
        </div>
      ) : null}

      {editing ? (
        <form className="panel-form card-surface panel-form-edit" onSubmit={saveRename}>
          <h3>{t("classDetail.editClass")}</h3>
          <Field label={t("editor.nameField")}>
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              required
            />
          </Field>
          <Field
            label={t("detail.classPinLabel")}
            hint={
              section.has_class_pin
                ? t("detail.classPinKeepHint")
                : group.require_class_pin
                  ? t("classDetail.classPinRequiredHint")
                  : t("classDetail.classPinOptionalHint")
            }
          >
            <PasswordInput
              value={pinDraft}
              onChange={(event) => setPinDraft(event.target.value)}
              autoComplete="off"
              name="class-pin"
              placeholder={
                section.has_class_pin
                  ? t("detail.classPinChangePlaceholder")
                  : t("detail.classPinSetPlaceholder")
              }
              required={Boolean(group.require_class_pin) && !section.has_class_pin}
            />
          </Field>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {t("common:save")}
            </button>
          </div>
        </form>
      ) : null}

      <div className="summary-grid">
        <article className="summary-card">
          <h3>{t("classDetail.parentGroup")}</h3>
          <p>{group.name}</p>
          <p className="hint">{formatGroupId(group.id)}</p>
        </article>
        <article className="summary-card">
          <h3>{t("classDetail.people")}</h3>
          <p className="summary-stat">
            <strong>{section.participant_count}</strong> {t("classDetail.participantsCountLabel")}
          </p>
        </article>
        <article className="summary-card">
          <h3>{t("classDetail.participationRules")}</h3>
          <ul className="summary-list compact">
            <li>
              <span>{t("detail.emailLabel")}</span>
              <strong>{group.participation?.email_required ? t("detail.emailRequired") : t("detail.emailOptional")}</strong>
            </li>
            <li>
              <span>{t("detail.pinLabel")}</span>
              <strong>{group.participation?.pin_required ? t("detail.pinRequired") : t("detail.pinOptional")}</strong>
            </li>
            <li>
              <span>{t("detail.classPinLabel")}</span>
              <strong>
                {group.require_class_pin
                  ? section.has_class_pin
                    ? t("classDetail.classPinSet")
                    : t("classDetail.classPinNeeded")
                  : t("classDetail.classPinOff")}
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
