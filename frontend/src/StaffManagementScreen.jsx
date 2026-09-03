import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { api } from "./api.js";
import {
  CopyButton,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingState,
  PageHeader,
  PasswordInput,
  StatusBadge,
  SuccessBanner,
} from "./components.jsx";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import { usePageTitle } from "./i18n/usePageTitle.js";
import {
  canManageStaffAccounts,
  canManageWorkspaceAdminAccounts,
} from "./workspaceSession.js";
import {
  canAccessStaffManagement,
  planLimitValue,
  planLocksFromSession,
  selectionRequired,
  usageTotalValue,
} from "./workspaceEntitlements.js";
import { memberUsageMetrics } from "./memberUsage.js";
import PlanLockSelectionPanel from "./PlanLockSelectionPanel.jsx";
import StaffGroupAccessEditor from "./StaffGroupAccessEditor.jsx";
import {
  StaffGroupAccessSummary,
  updateStaffGroupAccessSummary,
} from "./staffGroupAccess.js";
import {
  isStaffEmailRequired,
  staffEmailDuplicateMessage,
  staffEmailFieldLabel,
} from "./staffManagementEmail.js";
import {
  isStaffAccountPlanLocked,
  partitionStaffByPlanAvailability,
} from "./staffListOrdering.js";
import {
  firstTutorialStaffAccount,
  staffTutorialRequestsGroupAccess,
} from "./staffTutorial.js";
import {
  canBeginStaffDelete,
  canCancelStaffDelete,
  canPermanentlyDeleteStaffAccount,
  removeDeletedStaffAccount,
  staffAccountLifecycleAction,
  staffDeleteConfirmation,
} from "./staffDeletion.js";

export function StaffDeleteDialog({ staff, busy, onCancel, onConfirm }) {
  const confirmation = staffDeleteConfirmation(staff);
  if (!confirmation) return null;
  return (
    <ConfirmDialog
      title={confirmation.title}
      body={confirmation.body}
      confirmLabel={confirmation.confirmLabel}
      danger
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function StaffRow({
  staff,
  readOnly,
  onDeactivateToggle,
  onDelete,
  onResetPassword,
  onManageAccess,
  managingAccess,
}) {
  const { t } = useTranslation(["staff", "workspace", "common"]);
  const planLocked = isStaffAccountPlanLocked(staff);
  const lifecycleAction = staffAccountLifecycleAction(staff, planLocked);
  const roleLabel =
    staff.role === "admin" || staff.role === "staff"
      ? t(`workspace:roles.${staff.role}`)
      : staff.role;

  return (
    <article className={`person-row staff-account-row${planLocked ? " person-row-plan-locked" : ""}`}>
      <div className="person-copy staff-account-identity">
        <strong>{staff.username}</strong>
        <p className="person-subtitle">
          <span className="staff-role-badge">{roleLabel}</span>
          {" · "}
          <StatusBadge status={staff.status === "active" ? "active" : "inactive"} />
          {planLocked ? (
            <span className="plan-locked-badge">{t("common:planLocked")}</span>
          ) : null}
        </p>
        {planLocked ? (
          <p className="plan-locked-copy">{t("staff:planLock.lockedCopy")}</p>
        ) : null}
        {staff.email ? <p className="hint" style={{ marginTop: "0.35rem" }}>{staff.email}</p> : null}
      </div>
      {staff.role === "staff" ? <StaffGroupAccessSummary groups={staff.group_access} /> : <span />}
      {!readOnly ? (
        <div
          className="person-meta staff-account-actions"
          style={{ alignItems: "flex-start", flexDirection: "column" }}
          data-tutorial-target="staff-account-actions"
        >
          {staff.role === "staff" && !planLocked ? (
            <button type="button" className="btn-secondary btn-sm" onClick={onManageAccess}>
              {managingAccess ? t("staff:row.closeAccess") : t("staff:row.groupAccess")}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={onDeactivateToggle}
            disabled={lifecycleAction.disabled}
            title={planLocked && staff.status !== "active" ? t("staff:row.planLockedTitle") : undefined}
          >
            {lifecycleAction.label}
          </button>
          {canPermanentlyDeleteStaffAccount(staff) ? (
            <button type="button" className="btn-danger-soft btn-sm" onClick={onDelete}>
              {t("staff:row.delete")}
            </button>
          ) : null}
          <button type="button" className="btn-ghost btn-sm" onClick={onResetPassword}>
            {t("staff:row.resetPassword")}
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function StaffManagementScreen({ session, setSession }) {
  const { t } = useTranslation(["staff", "workspace", "common", "errors", "entitlements"]);
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [staff, setStaff] = useState([]);

  usePageTitle("pageTitles.staff");

  const canManageStaffRole = canManageStaffAccounts(session);
  const canManageStaff = canAccessStaffManagement(session, canManageStaffRole);
  const planLocksStaff = canManageStaffRole && !canManageStaff;
  const canManageAdmins = canManageWorkspaceAdminAccounts(session);
  const workspaceId = session.workspace.workspace_id;

  const [createUsername, setCreateUsername] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState("staff");
  const [createPassword, setCreatePassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [accessStaffId, setAccessStaffId] = useState(null);
  const [changeKind, setChangeKind] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const deleteInFlightRef = useRef(false);

  const effectiveCreateRole = canManageAdmins ? createRole : "staff";
  const createEmailRequired = isStaffEmailRequired(effectiveCreateRole);
  useEffect(() => {
    if (!canManageStaff) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError("");
      try {
        const result = await api.listWorkspaceStaff(null);
        if (cancelled) return;
        setStaff(result.data || []);
      } catch (e) {
        if (cancelled) return;
        setError(localizedErrorMessage(e, t));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [canManageStaff, t]);

  useEffect(() => {
    if (!staffTutorialRequestsGroupAccess(location.search) || accessStaffId) return;
    const tutorialStaff = firstTutorialStaffAccount(staff);
    if (tutorialStaff) setAccessStaffId(tutorialStaff.id);
  }, [accessStaffId, location.search, staff]);

  async function refresh() {
    const result = await api.listWorkspaceStaff(null);
    setStaff(result.data || []);
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!canManageStaff) return;
    setError("");
    setCreating(true);

    try {
      await api.createWorkspaceStaff(null, {
        username: createUsername,
        email: createEmail,
        role: canManageAdmins ? createRole : "staff",
        password: createPassword,
      });
      setCreateUsername("");
      setCreateEmail("");
      setCreateRole("staff");
      setCreatePassword("");
      await refresh();
    } catch (e) {
      const message = localizedErrorMessage(e, t);
      if (message.includes("already exists in this workspace")) {
        setError(staffEmailDuplicateMessage());
      } else {
        setError(message);
      }
    } finally {
      setCreating(false);
    }
  }

  async function toggleDeactivate(staffId, currentStatus) {
    try {
      setSuccessMessage("");
      await api.updateWorkspaceStaff(null, staffId, {
        status: currentStatus === "active" ? "inactive" : "active",
      });
      await refresh();
    } catch (e) {
      setError(localizedErrorMessage(e, t));
    }
  }

  function requestDelete(account) {
    if (!account || account.status !== "inactive") return;
    setError("");
    setSuccessMessage("");
    setPendingDelete(account);
  }

  async function confirmDelete() {
    if (!canBeginStaffDelete(pendingDelete, deleteInFlightRef.current)) return;
    deleteInFlightRef.current = true;
    setDeleting(true);
    setError("");
    const deletedAccount = pendingDelete;
    try {
      await api.deleteWorkspaceStaff(null, deletedAccount.id);
      setStaff((current) => removeDeletedStaffAccount(current, deletedAccount.id));
      setAccessStaffId((current) => (current === deletedAccount.id ? null : current));
      setPendingDelete(null);
      setSuccessMessage(t("staff:delete.success", { username: deletedAccount.username }));
    } catch (e) {
      setError(localizedErrorMessage(e, t));
    } finally {
      deleteInFlightRef.current = false;
      setDeleting(false);
    }
  }

  async function resetPassword(staffId) {
    const newPassword = window.prompt(t("staff:resetPassword.prompt"));
    if (!newPassword) return;
    try {
      await api.resetWorkspaceStaffPassword(null, staffId, { password: newPassword });
      await refresh();
    } catch (e) {
      setError(localizedErrorMessage(e, t));
    }
  }

  const adminsSelectionRequired = selectionRequired(session, "workspace_admins");
  const staffSelectionRequired = selectionRequired(session, "workspace_staff");
  const requiredKind = adminsSelectionRequired
    ? "workspace_admins"
    : staffSelectionRequired
      ? "workspace_staff"
      : null;
  const activeSelectionKind = requiredKind || changeKind;
  const planLocks = planLocksFromSession(session);

  function canChangeKind(kind) {
    const locked = Number(planLocks?.locked_counts?.[kind] || 0);
    const total = usageTotalValue(session, kind);
    const limit = planLimitValue(session, kind);
    return locked > 0 || (typeof total === "number" && typeof limit === "number" && total > limit);
  }

  async function saveAvailability(selectedIds) {
    await api.putPlanLockSelection(session, {
      kind: activeSelectionKind,
      selected_ids: selectedIds,
    });
    const result = await api.loadWorkspace(session);
    if (typeof setSession === "function") {
      setSession({ workspace: result.data });
    }
    if (canManageStaff) {
      await refresh();
    }
    setChangeKind(null);
  }

  if (activeSelectionKind && canManageAdmins) {
    const admins = activeSelectionKind === "workspace_admins";
    return (
      <div className="page">
        <PageHeader
          title={t("staff:management.title")}
          description={t("staff:management.resolveDescription")}
        />
        <PlanLockSelectionPanel
          kind={activeSelectionKind}
          title={
            admins
              ? t("staff:planLock.chooseAdminsTitle")
              : t("staff:planLock.chooseStaffTitle")
          }
          description={
            admins
              ? t("staff:planLock.chooseAdminsDescription")
              : t("staff:planLock.chooseStaffDescription")
          }
          onSave={saveAvailability}
          onCancel={!requiredKind ? () => setChangeKind(null) : undefined}
        />
      </div>
    );
  }

  if (planLocksStaff) {
    return (
      <div className="page">
        <EmptyState
          title={t("staff:empty.lockedTitle")}
          body={t("staff:empty.lockedBody")}
        />
      </div>
    );
  }

  if (!canManageStaff) {
    return (
      <div className="page">
        <EmptyState
          title={t("staff:empty.notAvailableTitle")}
          body={t("staff:empty.notAvailableBody")}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState label={t("staff:loading")} />
      </div>
    );
  }

  const {
    availableAdmins,
    availableStaff,
    lockedAdmins,
    lockedStaff,
  } = partitionStaffByPlanAvailability(staff);
  const adminLimit = planLimitValue(session, "workspace_admins");
  const staffLimit = planLimitValue(session, "workspace_staff");
  const adminUsage = memberUsageMetrics(
    usageTotalValue(session, "workspace_admins"),
    adminLimit,
  );
  const staffUsage = memberUsageMetrics(
    usageTotalValue(session, "workspace_staff"),
    staffLimit,
  );
  const hasLockedAccounts = lockedAdmins.length > 0 || lockedStaff.length > 0;
  const lockedAccountCount = lockedAdmins.length + lockedStaff.length;

  function renderAccountRows(accounts) {
    return accounts.map((s) => (
      <div key={s.id}>
        <StaffRow
          staff={s}
          readOnly={!canManageAdmins && s.role === "admin"}
          managingAccess={accessStaffId === s.id}
          onManageAccess={() =>
            setAccessStaffId((current) => (current === s.id ? null : s.id))
          }
          onDeactivateToggle={() => toggleDeactivate(s.id, s.status)}
          onDelete={() => requestDelete(s)}
          onResetPassword={() => resetPassword(s.id)}
        />
        {accessStaffId === s.id && s.role === "staff" && !isStaffAccountPlanLocked(s) ? (
          <StaffGroupAccessEditor
            staff={s}
            onClose={() => setAccessStaffId(null)}
            onSaved={(savedItems) => {
              setStaff((current) =>
                updateStaffGroupAccessSummary(current, s.id, savedItems),
              );
            }}
            onError={setError}
          />
        ) : null}
      </div>
    ));
  }

  return (
    <div className="page staff-management-page" data-tutorial-target="staff-overview">
      <PageHeader
        title={t("staff:management.title")}
        description={
          canManageAdmins
            ? t("staff:management.descriptionOwner")
            : t("staff:management.descriptionAdmin")
        }
      />
      {adminUsage || staffUsage ? (
        <div className="groups-usage staff-usage" aria-label={t("staff:usage.label")} aria-live="polite">
          {[
            { key: "admins", label: t("staff:usage.admins"), usage: adminUsage },
            { key: "staff", label: t("staff:usage.staff"), usage: staffUsage },
          ].map((item) =>
            item.usage ? (
              <section className={`groups-usage-item is-${item.key}`} key={item.key}>
                <div className="groups-usage-copy">
                  <strong>{item.label}</strong>
                  <span>
                    {t("staff:usage.summary", {
                      count: item.usage.count,
                      remaining: item.usage.remaining,
                    })}
                  </span>
                </div>
                <div
                  className="groups-usage-progress"
                  role="progressbar"
                  aria-label={t("staff:usage.progressLabel", { type: item.label })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.usage.percentage}
                  aria-valuetext={t("staff:usage.progressValue", {
                    type: item.label,
                    count: item.usage.count,
                    limit: item.usage.limit,
                  })}
                >
                  <span style={{ width: `${item.usage.percentage}%` }} />
                </div>
              </section>
            ) : null,
          )}
        </div>
      ) : null}
      {canManageAdmins &&
      (canChangeKind("workspace_admins") || canChangeKind("workspace_staff")) ? (
        <div className="plan-lock-change-row">
          {canChangeKind("workspace_admins") ? (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setChangeKind("workspace_admins")}
            >
              {t("staff:planLock.changeAdmins")}
            </button>
          ) : null}
          {canChangeKind("workspace_staff") ? (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setChangeKind("workspace_staff")}
            >
              {t("staff:planLock.changeStaff")}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="workspace-id-card" data-tutorial-target="staff-workspace-id">
        <h3>{t("staff:workspaceId.title")}</h3>
        <div className="workspace-id-value">
          <span className="workspace-id-code">{workspaceId}</span>
          <CopyButton value={workspaceId} label={t("staff:workspaceId.copyLabel")} />
        </div>
        <p className="hint">{t("staff:workspaceId.hint")}</p>
      </div>

      <ErrorBanner message={error} />
      <SuccessBanner message={successMessage} />

      <div className="staff-grid">
        <section className="section-card">
          <header className="section-card-header">
            <h2>{t("staff:sections.existingAccounts")}</h2>
            <p>
              {canManageAdmins
                ? t("staff:sections.existingAccountsOwner")
                : t("staff:sections.existingAccountsAdmin")}
            </p>
          </header>
          <div className="section-card-body">
            {staff.length ? (
              <div className="staff-plan-sections">
                {canManageAdmins && availableAdmins.length > 0 ? (
                  <section className="staff-plan-section" aria-label={t("staff:sections.availableAdmins")}>
                    <header className="groups-plan-section-heading">
                      <h3>{t("staff:sections.availableAdmins")}</h3>
                      <p>
                        {typeof adminLimit === "number"
                          ? t("entitlements:usageOf", {
                              usage: availableAdmins.length,
                              limit: adminLimit,
                            })
                          : String(availableAdmins.length)}
                      </p>
                    </header>
                    <div className="activity-list">{renderAccountRows(availableAdmins)}</div>
                  </section>
                ) : null}
                {availableStaff.length > 0 ? (
                  <section className="staff-plan-section" aria-label={t("staff:sections.availableStaff")}>
                    <header className="groups-plan-section-heading">
                      <h3>{t("staff:sections.availableStaff")}</h3>
                      <p>
                        {typeof staffLimit === "number"
                          ? t("entitlements:usageOf", {
                              usage: availableStaff.length,
                              limit: staffLimit,
                            })
                          : String(availableStaff.length)}
                      </p>
                    </header>
                    <div className="activity-list">{renderAccountRows(availableStaff)}</div>
                  </section>
                ) : null}
                {hasLockedAccounts ? (
                  <section
                    className="staff-plan-section is-locked"
                    aria-label={t("staff:planLock.lockedSection")}
                  >
                    <header className="groups-plan-section-heading">
                      <h3>{t("staff:planLock.lockedSection")}</h3>
                      <p>{t("staff:sections.accountCount", { count: lockedAccountCount })}</p>
                    </header>
                    {canManageAdmins && lockedAdmins.length > 0 ? (
                      <div className="staff-locked-role-block">
                        <p className="staff-locked-role-label">
                          {t("staff:planLock.lockedAdminAccounts")}
                        </p>
                        <div className="activity-list">{renderAccountRows(lockedAdmins)}</div>
                      </div>
                    ) : null}
                    {lockedStaff.length > 0 ? (
                      <div className="staff-locked-role-block">
                        <p className="staff-locked-role-label">
                          {t("staff:planLock.lockedStaffAccounts")}
                        </p>
                        <div className="activity-list">{renderAccountRows(lockedStaff)}</div>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            ) : (
              <EmptyState
                title={t("staff:empty.noAccountsTitle")}
                body={
                  canManageAdmins
                    ? t("staff:empty.noAccountsBodyOwner")
                    : t("staff:empty.noAccountsBodyAdmin")
                }
              />
            )}
          </div>
        </section>

        <section
          className="card-surface"
          style={{ padding: "var(--space-5)" }}
          data-tutorial-target="staff-create-account"
        >
          <h3 style={{ marginBottom: "var(--space-4)" }}>{t("staff:create.title")}</h3>
          <form onSubmit={handleCreate} className="auth-form">
            <Field label={t("staff:create.usernameLabel")} hint={t("staff:create.usernameHint")}>
              <input
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                required
              />
            </Field>
            <Field
              label={staffEmailFieldLabel(effectiveCreateRole)}
              hint={createEmailRequired ? t("staff:create.adminEmailHint") : undefined}
            >
              <input
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                type="email"
                required={createEmailRequired}
              />
            </Field>
            <div data-tutorial-target="staff-role-selection">
              {canManageAdmins ? (
                <Field label={t("staff:create.roleLabel")}>
                  <select value={createRole} onChange={(e) => setCreateRole(e.target.value)}>
                    <option value="admin">{t("workspace:roles.admin")}</option>
                    <option value="staff">{t("workspace:roles.staff")}</option>
                  </select>
                </Field>
              ) : (
                <Field label={t("staff:create.roleLabel")}>
                  <input value={t("workspace:roles.staff")} readOnly disabled />
                </Field>
              )}
            </div>
            <Field label={t("staff:create.passwordLabel")}>
              <PasswordInput
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </Field>
            <button type="submit" className="btn-primary btn-block" disabled={creating}>
              {creating ? t("staff:create.submitting") : t("staff:create.submit")}
            </button>
          </form>
        </section>
      </div>
      <StaffDeleteDialog
        staff={pendingDelete}
        busy={deleting}
        onCancel={() => {
          if (canCancelStaffDelete(deleteInFlightRef.current)) setPendingDelete(null);
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
