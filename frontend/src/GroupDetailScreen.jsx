import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api.js";
import { ErrorBanner, Field, LoadingState, PasswordInput, SectionCard, StatusBadge } from "./components.jsx";
import GroupParticipantsSection from "./GroupParticipantsSection.jsx";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import { usePageTitle } from "./i18n/usePageTitle.js";
import { canLaunchKiosk, canManageGroupConfiguration } from "./workspaceSession.js";
import {
  actionSummary,
  formatClassId,
  formatGroupId,
  isStructuredGroup,
  setupIncompleteSummary,
} from "./groupForm.js";

export default function GroupDetailScreen({ session, groupId, onNavigate }) {
  const { t } = useTranslation(["groups", "common", "errors"]);
  const canConfigure = canManageGroupConfiguration(session);
  const canLaunch = canLaunchKiosk(session);
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
  const [planAccessDenied, setPlanAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  usePageTitle("pageTitles.groups", { ns: "workspace" });

  async function load() {
    setError("");
    setPlanAccessDenied(false);
    setLoading(true);
    try {
      const groupResult = await api.getGroup(session, groupId);
      const nextGroup = groupResult.data;
      if (nextGroup.status === "archived") {
        onNavigate({ name: "groups", status: "archived", replace: true });
        return;
      }
      setGroup(nextGroup);

      if (isStructuredGroup(nextGroup)) {
        const classResult = await api.listGroupClasses(session, groupId);
        setClasses(classResult.data);
        if (canConfigure) {
          const [kioskSettingsResult, sourcesResult] = await Promise.all([
            api.getGroupKioskSettings(session, groupId).catch(() => ({ data: null })),
            api.listGroupClassImportSources(session, groupId).catch(() => ({ data: [] })),
          ]);
          setKioskReadiness(kioskSettingsResult.data?.readiness || null);
          setImportSources(Array.isArray(sourcesResult.data) ? sourcesResult.data : []);
        } else {
          setKioskReadiness(null);
          setImportSources([]);
        }
      } else if (canConfigure) {
        const kioskSettingsResult = await api
          .getGroupKioskSettings(session, groupId)
          .catch(() => ({ data: null }));
        setKioskReadiness(kioskSettingsResult.data?.readiness || null);
        setClasses([]);
        setImportSources([]);
      } else {
        setKioskReadiness(null);
        setClasses([]);
        setImportSources([]);
      }
    } catch (loadError) {
      if (loadError?.status === 403 && loadError?.data?.code === "plan_resource_locked") {
        setPlanAccessDenied(true);
        setGroup(null);
      } else {
        setError(localizedErrorMessage(loadError, t));
      }
    } finally {
      setLoading(false);
    }
  }

  async function refreshGroupAfterParticipantChange() {
    const groupResult = await api.getGroup(session, groupId);
    setGroup(groupResult.data);
  }

  useEffect(() => {
    load();
  }, [groupId]);

  if (loading) {
    return (
      <div className="page">
        <LoadingState label={t("loadingOne")} />
      </div>
    );
  }

  if (planAccessDenied) {
    return (
      <div className="page">
        <div className="plan-locked-banner plan-locked-page" role="alert">
          <span className="plan-locked-badge">{t("planLocked")}</span>
          <strong>{t("detail.planLockedPageTitle")}</strong>
          <p className="hint">{t("detail.planLockedPageHint")}</p>
          <button type="button" className="btn-secondary" onClick={() => onNavigate({ name: "groups" })}>
            {t("backToGroups")}
          </button>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="page">
        <ErrorBanner message={error || t("notFound")} />
        <button type="button" className="btn-secondary" onClick={() => onNavigate({ name: "groups" })}>
          {t("backToGroups")}
        </button>
      </div>
    );
  }

  const setupIncomplete = group?.readiness && !group.readiness.setup_complete;
  const planLocked = Boolean(group?.is_plan_locked || group?.plan_unlocked === false);
  const canConfigureUnlocked = canConfigure && !planLocked;
  const canLaunchUnlocked = canLaunch && !planLocked;
  const structured = isStructuredGroup(group);
  const kioskNeedsSetup = kioskReadiness && !kioskReadiness.ready;
  const launchBlocked = setupIncomplete || (canConfigure && kioskNeedsSetup);
  const setupSummary = setupIncompleteSummary(group?.readiness);

  async function archiveGroup() {
    if (!window.confirm(t("confirmArchive", { name: group.name }))) {
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
      setError(localizedErrorMessage(saveError, t));
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
      setError(t("detail.selectStandardGroupError"));
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
      setImportNotice(result.data.message || t("detail.classCopied"));
      setImportSourceId("");
      setImportClassName("");
      setImportClassPin("");
      setAddClassMode("create");
      await load();
    } catch (saveError) {
      setError(localizedErrorMessage(saveError, t));
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
      setError(localizedErrorMessage(saveError, t));
    } finally {
      setSaving(false);
    }
  }

  async function removeClass(section) {
    if (!window.confirm(t("detail.confirmArchiveClass", { name: section.name }))) {
      return;
    }
    setError("");
    try {
      await api.archiveGroupClass(session, groupId, section.id);
      await load();
    } catch (saveError) {
      setError(localizedErrorMessage(saveError, t));
    }
  }

  const requiredLabel = t("detail.emailRequired");
  const optionalLabel = t("detail.emailOptional");

  return (
    <div className="page page-detail">
      <header className="page-header">
        <div className="page-header-copy">
          <div className="editor-title-row">
            <h2>{group.name}</h2>
            <span className="entity-kicker">{formatGroupId(group.id)}</span>
            {structured ? <span className="entity-kicker">{t("structuredLabel")}</span> : null}
            {setupIncomplete ? (
              <StatusBadge status="setup_incomplete" />
            ) : (
              <StatusBadge status="active" />
            )}
          </div>
          <p>{actionSummary(group.actions)}</p>
        </div>
        <div className="header-actions">
          {canConfigureUnlocked ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onNavigate({ name: "group-editor", groupId })}
              >
                {t("editConfiguration")}
              </button>
              <button type="button" className="btn-danger-soft" onClick={archiveGroup}>
                {t("archive")}
              </button>
            </>
          ) : null}
          <button type="button" className="btn-secondary" onClick={() => onNavigate({ name: "groups" })}>
            {t("common:back")}
          </button>
        </div>
      </header>
      <ErrorBanner message={error} />

      {setupIncomplete ? (
        <div className="setup-incomplete-banner">
          <div>
            <strong>{t("detail.setupIncomplete")}</strong>
            <p className="hint">
              {setupSummary ||
                (structured
                  ? t("detail.setupIncompleteStructured")
                  : t("detail.setupIncompleteStandard"))}
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
              {t("detail.completeParticipantSetup")}
            </button>
          ) : null}
        </div>
      ) : null}

      {canConfigureUnlocked && kioskNeedsSetup && !setupIncomplete && !planLocked ? (
        <div className="setup-incomplete-banner">
          <div>
            <strong>{t("detail.kioskNeedsAttention")}</strong>
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
            {t("detail.openKioskSettings")}
          </button>
        </div>
      ) : null}

      <div className="summary-grid">
        <article className="summary-card">
          <h3>{t("detail.summaryActions")}</h3>
          <p>{actionSummary(group.actions)}</p>
        </article>
        <article className="summary-card">
          <h3>{t("detail.summaryParticipation")}</h3>
          <ul className="summary-list compact">
            <li>
              <span>{t("detail.emailLabel")}</span>
              <strong>{group.participation?.email_required ? requiredLabel : optionalLabel}</strong>
            </li>
            <li>
              <span>{t("detail.pinLabel")}</span>
              <strong>{group.participation?.pin_required ? t("detail.pinRequired") : t("detail.pinOptional")}</strong>
            </li>
            {structured ? (
              <li>
                <span>{t("detail.classPinLabel")}</span>
                <strong>{group.require_class_pin ? t("detail.classPinRequired") : t("detail.classPinOff")}</strong>
              </li>
            ) : null}
          </ul>
        </article>
        <article className="summary-card">
          {structured ? (
            <>
              <h3>{t("detail.summaryClasses")}</h3>
              <p className="summary-stat">
                <strong>{group.section_count ?? classes.length}</strong> {t("detail.activeClassesLabel")}
              </p>
              <p className="summary-stat">
                <strong>{group.participant_count ?? 0}</strong> {t("detail.participantsTotalLabel")}
              </p>
            </>
          ) : (
            <>
              <h3>{t("detail.summaryPeople")}</h3>
              <p className="summary-stat">
                <strong>{group.member_count}</strong> {t("detail.reusableMembersLabel")}
              </p>
              <p className="summary-stat">
                <strong>{group.group_only_participant_count}</strong> {t("detail.visitorsLabel")}
              </p>
            </>
          )}
        </article>
      </div>

      <div className="kiosk-section-panel" data-tutorial-target="group-kiosk-actions">
        <div className="kiosk-section-head">
          <h3>{t("detail.kioskTitle", { name: group.name })}</h3>
          <p className="hint">
            {structured ? t("detail.kioskHintStructured") : t("detail.kioskHintStandard")}
          </p>
        </div>
        <div className="kiosk-action-row">
          {canConfigureUnlocked ? (
            <>
              <button
                type="button"
                className="btn-secondary btn-sm"
                data-tutorial-target="kiosk-settings-action"
                onClick={() => onNavigate({ name: "kiosk-settings", groupId })}
              >
                {t("detail.kioskSettings")}
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                data-tutorial-target="kiosk-design-action"
                onClick={() => onNavigate({ name: "kiosk-builder", groupId })}
              >
                {t("detail.editKioskDesign")}
              </button>
            </>
          ) : null}
          {canLaunchUnlocked ? (
            <button
              type="button"
              className="btn-success kiosk-action-launch"
              data-tutorial-target="kiosk-launch-action"
              disabled={launchBlocked}
              title={
                setupIncomplete
                  ? t("detail.launchBlockedSetup")
                  : kioskNeedsSetup
                    ? t("detail.launchBlockedKiosk")
                    : undefined
              }
              onClick={() => onNavigate({ name: "kiosk", groupId })}
            >
              {t("detail.launchKiosk")}
            </button>
          ) : null}
        </div>
      </div>

      {structured ? (
        <SectionCard title={t("detail.classesTitle", { count: classes.length })} id="group-classes">
          <div className="class-list">
            {classes.map((section) => (
              <article key={section.id} className="class-row">
                <div>
                  <strong>{section.name}</strong>
                  <p className="participant-row-meta">
                    {formatClassId(section.id)} · {t("participants.count", { count: section.participant_count })}
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
                    {t("detail.open")}
                  </button>
                  {canConfigureUnlocked ? (
                    <>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => {
                          setEditingClassId(section.id);
                          setEditingClassName(section.name);
                          setEditingClassPin("");
                        }}
                      >
                        {t("common:edit")}
                      </button>
                      <button
                        type="button"
                        className="btn-danger-soft btn-sm"
                        onClick={() => removeClass(section)}
                      >
                        {t("detail.remove")}
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
            {classes.length === 0 ? <p className="hint">{t("detail.noClasses")}</p> : null}
          </div>

          {canConfigureUnlocked && editingClassId ? (
            <form className="panel-form card-surface panel-form-edit" onSubmit={saveClassRename}>
              <h3>{t("detail.editClass")}</h3>
              <Field label={t("editor.nameField")}>
                <input
                  value={editingClassName}
                  onChange={(event) => setEditingClassName(event.target.value)}
                  required
                />
              </Field>
              {group.require_class_pin ? (
                <Field
                  label={t("detail.classPinLabel")}
                  hint={
                    classes.find((item) => item.id === editingClassId)?.has_class_pin
                      ? t("detail.classPinKeepHint")
                      : t("detail.classPinRequiredHint")
                  }
                >
                  <PasswordInput
                    value={editingClassPin}
                    onChange={(event) => setEditingClassPin(event.target.value)}
                    autoComplete="off"
                    name="class-pin-edit"
                    placeholder={
                      classes.find((item) => item.id === editingClassId)?.has_class_pin
                        ? t("detail.classPinChangePlaceholder")
                        : t("detail.classPinSetPlaceholder")
                    }
                    required={
                      Boolean(group.require_class_pin) &&
                      !classes.find((item) => item.id === editingClassId)?.has_class_pin
                    }
                  />
                </Field>
              ) : null}
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {t("common:save")}
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
                  {t("common:cancel")}
                </button>
              </div>
            </form>
          ) : null}

          {canConfigureUnlocked ? (
          <form
            className="add-participant-card"
            onSubmit={addClassMode === "import" ? copyStandardGroupAsClass : addClass}
          >
            <header className="add-participant-card-head">
              <div>
                <h3>{t("detail.addClass")}</h3>
                <p className="hint">{t("detail.addClassHint")}</p>
              </div>
            </header>
            <div className="kiosk-segment-picker" role="radiogroup" aria-label={t("detail.addClassModeAria")}>
              {[
                { id: "create", label: t("detail.createNewClass") },
                { id: "import", label: t("detail.copyFromGroup") },
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
                <Field label={t("editor.nameField")}>
                  <input
                    value={newClassName}
                    onChange={(event) => setNewClassName(event.target.value)}
                    placeholder={t("detail.classPinPlaceholder")}
                    required
                  />
                </Field>
                {group.require_class_pin ? (
                  <Field label={t("editor.requireClassPin")} hint={t("detail.classPinRequiredHint")}>
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
                  {t("detail.submitAddClass")}
                </button>
              </>
            ) : (
              <>
                <Field label={t("detail.sourceGroup")} hint={t("detail.sourceGroupHint")}>
                  <select
                    value={importSourceId}
                    onChange={(event) => selectImportSource(event.target.value)}
                    required
                  >
                    <option value="">{t("detail.selectStandardGroup")}</option>
                    {importSources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name} ({t("participants.count", { count: source.participant_count })})
                      </option>
                    ))}
                  </select>
                </Field>
                {importSources.length === 0 ? (
                  <p className="hint">{t("detail.noStandardGroupsToCopy")}</p>
                ) : null}
                <Field label={t("detail.className")}>
                  <input
                    value={importClassName}
                    onChange={(event) => setImportClassName(event.target.value)}
                    placeholder={t("detail.classNamePlaceholder")}
                    required
                  />
                </Field>
                {importSourceId ? (
                  <p className="hint">
                    {t("detail.oneTimeCopyHint", {
                      sourceName:
                        importSources.find((item) => String(item.id) === String(importSourceId))
                          ?.name || t("detail.sourceGroupFallback"),
                    })}
                  </p>
                ) : null}
                {group.require_class_pin ? (
                  <Field label={t("editor.requireClassPin")} hint={t("detail.classPinRequiredHint")}>
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
                  {t("detail.copyAsClass")}
                </button>
              </>
            )}
            {importNotice ? <p className="hint import-success-note">{importNotice}</p> : null}
          </form>
          ) : null}
        </SectionCard>
      ) : (
        <GroupParticipantsSection
          session={session}
          group={group}
          groupId={groupId}
          onError={setError}
          onChanged={refreshGroupAfterParticipantChange}
          operationsDisabled={planLocked}
        />
      )}
    </div>
  );
}
