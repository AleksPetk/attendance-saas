import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, errorMessage } from "./api.js";
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
  usageLimitCaption,
} from "./workspaceEntitlements.js";
import PlanLockSelectionPanel from "./PlanLockSelectionPanel.jsx";
import StaffGroupAccessEditor from "./StaffGroupAccessEditor.jsx";
import {
  StaffGroupAccessSummary,
  updateStaffGroupAccessSummary,
} from "./staffGroupAccess.js";
import {
  STAFF_EMAIL_DUPLICATE_MESSAGE,
  isStaffEmailRequired,
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
  const planLocked = isStaffAccountPlanLocked(staff);
  const lifecycleAction = staffAccountLifecycleAction(staff, planLocked);
  return (
    <article className={`person-row staff-account-row${planLocked ? " person-row-plan-locked" : ""}`}>
      <div className="person-copy staff-account-identity">
        <strong>{staff.username}</strong>
        <p className="person-subtitle">
          <span className="staff-role-badge">{staff.role}</span>
          {" · "}
          <StatusBadge status={staff.status === "active" ? "active" : "inactive"} />
          {planLocked ? <span className="plan-locked-badge">Plan locked</span> : null}
        </p>
        {planLocked ? <p className="plan-locked-copy">Locked by current plan</p> : null}
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
              {managingAccess ? "Close access" : "Group access"}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={onDeactivateToggle}
            disabled={lifecycleAction.disabled}
            title={
              planLocked && staff.status !== "active"
                ? "Locked by current plan"
                : undefined
            }
          >
            {lifecycleAction.label}
          </button>
          {canPermanentlyDeleteStaffAccount(staff) ? (
            <button type="button" className="btn-danger-soft btn-sm" onClick={onDelete}>
              Delete
            </button>
          ) : null}
          <button type="button" className="btn-ghost btn-sm" onClick={onResetPassword}>
            Reset password
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function StaffManagementScreen({ session, setSession }) {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [staff, setStaff] = useState([]);

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
        setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [canManageStaff]);

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
      const message = errorMessage(e);
      if (message.includes("already exists in this workspace")) {
        setError(STAFF_EMAIL_DUPLICATE_MESSAGE);
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
      setError(errorMessage(e));
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
      setSuccessMessage(`${deletedAccount.username} was permanently deleted.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      deleteInFlightRef.current = false;
      setDeleting(false);
    }
  }

  async function resetPassword(staffId) {
    const newPassword = window.prompt("Enter new password for this staff account:");
    if (!newPassword) return;
    try {
      await api.resetWorkspaceStaffPassword(null, staffId, { password: newPassword });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
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
          title="Staff management"
          description="Resolve account availability for the current plan."
        />
        <PlanLockSelectionPanel
          kind={activeSelectionKind}
          title={admins ? "Choose available Admins" : "Choose available Staff"}
          description={`Select the ${admins ? "Admin" : "Staff"} accounts that can access this workspace.`}
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
          title="Staff management is locked"
          body="The Basic plan does not include Workspace Admin or Staff accounts. Upgrade to Plus or Business to unlock the Staff page."
        />
      </div>
    );
  }

  if (!canManageStaff) {
    return (
      <div className="page">
        <EmptyState
          title="Not available"
          body="Only the workspace owner or an admin can manage staff accounts."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState label="Loading staff accounts…" />
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
  const hasLockedAccounts = lockedAdmins.length > 0 || lockedStaff.length > 0;

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
    <div className="page" data-tutorial-target="staff-overview">
      <PageHeader
        title="Staff management"
        description={
          canManageAdmins
            ? "Create workspace admin and staff accounts. Share the Workspace ID so staff can sign in."
            : "Create and manage staff accounts. Admin accounts can only be managed by the workspace owner."
        }
      />
      {usageLimitCaption(session, "workspace_staff", "Staff") ||
      usageLimitCaption(session, "workspace_admins", "Admins") ? (
        <p className="plan-usage-hint" aria-live="polite">
          {[
            usageLimitCaption(session, "workspace_admins", "Admins"),
            usageLimitCaption(session, "workspace_staff", "Staff"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
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
              Change available Admins
            </button>
          ) : null}
          {canChangeKind("workspace_staff") ? (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setChangeKind("workspace_staff")}
            >
              Change available Staff
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="workspace-id-card" data-tutorial-target="staff-workspace-id">
        <h3>Workspace ID</h3>
        <div className="workspace-id-value">
          <span className="workspace-id-code">{workspaceId}</span>
          <CopyButton value={workspaceId} label="Copy ID" />
        </div>
        <p className="hint">
          Staff use this ID with their username and password to sign in at the staff login page.
        </p>
      </div>

      <ErrorBanner message={error} />
      <SuccessBanner message={successMessage} />

      <div className="staff-grid">
        <section className="section-card">
          <header className="section-card-header">
            <h2>Existing accounts</h2>
            <p>
              {canManageAdmins
                ? "Admins and staff who can access this workspace."
                : "Staff accounts you can manage in this workspace."}
            </p>
          </header>
          <div className="section-card-body">
            {staff.length ? (
              <div className="staff-plan-sections">
                {canManageAdmins && availableAdmins.length > 0 ? (
                  <section className="staff-plan-section" aria-label="Available Admins">
                    <header className="groups-plan-section-heading">
                      <h3>Available Admins</h3>
                      <p>
                        {typeof adminLimit === "number"
                          ? `${availableAdmins.length} of ${adminLimit}`
                          : String(availableAdmins.length)}
                      </p>
                    </header>
                    <div className="activity-list">{renderAccountRows(availableAdmins)}</div>
                  </section>
                ) : null}
                {availableStaff.length > 0 ? (
                  <section className="staff-plan-section" aria-label="Available Staff">
                    <header className="groups-plan-section-heading">
                      <h3>Available Staff</h3>
                      <p>
                        {typeof staffLimit === "number"
                          ? `${availableStaff.length} of ${staffLimit}`
                          : String(availableStaff.length)}
                      </p>
                    </header>
                    <div className="activity-list">{renderAccountRows(availableStaff)}</div>
                  </section>
                ) : null}
                {hasLockedAccounts ? (
                  <section className="staff-plan-section is-locked" aria-label="Locked by current plan">
                    <header className="groups-plan-section-heading">
                      <h3>Locked by current plan</h3>
                      <p>
                        {lockedAdmins.length + lockedStaff.length} account
                        {lockedAdmins.length + lockedStaff.length === 1 ? "" : "s"}
                      </p>
                    </header>
                    {canManageAdmins && lockedAdmins.length > 0 ? (
                      <div className="staff-locked-role-block">
                        <p className="staff-locked-role-label">Admin accounts</p>
                        <div className="activity-list">{renderAccountRows(lockedAdmins)}</div>
                      </div>
                    ) : null}
                    {lockedStaff.length > 0 ? (
                      <div className="staff-locked-role-block">
                        <p className="staff-locked-role-label">Staff accounts</p>
                        <div className="activity-list">{renderAccountRows(lockedStaff)}</div>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            ) : (
              <EmptyState
                title="No staff accounts yet"
                body={
                  canManageAdmins
                    ? "Create an admin or staff account for someone who needs workspace access."
                    : "Create a staff account for someone who needs workspace access."
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
          <h3 style={{ marginBottom: "var(--space-4)" }}>Create account</h3>
          <form onSubmit={handleCreate} className="auth-form">
            <Field label="Username" hint="Unique within this workspace">
              <input
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                required
              />
            </Field>
            <Field
              label={staffEmailFieldLabel(effectiveCreateRole)}
              hint={createEmailRequired ? "Required for admin accounts" : undefined}
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
                <Field label="Role">
                  <select value={createRole} onChange={(e) => setCreateRole(e.target.value)}>
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                  </select>
                </Field>
              ) : (
                <Field label="Role">
                  <input value="Staff" readOnly disabled />
                </Field>
              )}
            </div>
            <Field label="Password">
              <PasswordInput
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </Field>
            <button type="submit" className="btn-primary btn-block" disabled={creating}>
              {creating ? "Creating…" : "Create account"}
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
