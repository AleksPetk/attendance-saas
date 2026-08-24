import { useEffect, useState } from "react";
import { api, errorMessage } from "./api.js";
import {
  CopyButton,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingState,
  PageHeader,
  PasswordInput,
  StatusBadge,
} from "./components.jsx";
import {
  canManageStaffAccounts,
  canManageWorkspaceAdminAccounts,
} from "./workspaceSession.js";
import StaffGroupAccessEditor from "./StaffGroupAccessEditor.jsx";
import {
  STAFF_EMAIL_DUPLICATE_MESSAGE,
  isStaffEmailRequired,
  staffEmailFieldLabel,
} from "./staffManagementEmail.js";

function StaffRow({ staff, readOnly, onDeactivateToggle, onResetPassword, onManageAccess, managingAccess }) {
  return (
    <article className="person-row">
      <div className="person-copy" style={{ flex: 1 }}>
        <strong>{staff.username}</strong>
        <p className="person-subtitle">
          <span className="staff-role-badge">{staff.role}</span>
          {" · "}
          <StatusBadge status={staff.status === "active" ? "active" : "inactive"} />
        </p>
        {staff.email ? <p className="hint" style={{ marginTop: "0.35rem" }}>{staff.email}</p> : null}
      </div>
      {!readOnly ? (
        <div className="person-meta" style={{ alignItems: "flex-start", flexDirection: "column" }}>
          {staff.role === "staff" ? (
            <button type="button" className="btn-secondary btn-sm" onClick={onManageAccess}>
              {managingAccess ? "Close access" : "Group access"}
            </button>
          ) : null}
          <button type="button" className="btn-secondary btn-sm" onClick={onDeactivateToggle}>
            {staff.status === "active" ? "Deactivate" : "Reactivate"}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={onResetPassword}>
            Reset password
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function StaffManagementScreen({ session }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [staff, setStaff] = useState([]);

  const canManageStaff = canManageStaffAccounts(session);
  const canManageAdmins = canManageWorkspaceAdminAccounts(session);
  const workspaceId = session.workspace.workspace_id;

  const [createUsername, setCreateUsername] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState("staff");
  const [createPassword, setCreatePassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [accessStaffId, setAccessStaffId] = useState(null);

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
      await api.updateWorkspaceStaff(null, staffId, {
        status: currentStatus === "active" ? "inactive" : "active",
      });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
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

  return (
    <div className="page">
      <PageHeader
        title="Staff management"
        description={
          canManageAdmins
            ? "Create workspace admin and staff accounts. Share the Workspace ID so staff can sign in."
            : "Create and manage staff accounts. Admin accounts can only be managed by the workspace owner."
        }
      />

      <div className="workspace-id-card">
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
              <div className="activity-list">
                {staff.map((s) => (
                  <div key={s.id}>
                    <StaffRow
                      staff={s}
                      readOnly={!canManageAdmins && s.role === "admin"}
                      managingAccess={accessStaffId === s.id}
                      onManageAccess={() =>
                        setAccessStaffId((current) => (current === s.id ? null : s.id))
                      }
                      onDeactivateToggle={() => toggleDeactivate(s.id, s.status)}
                      onResetPassword={() => resetPassword(s.id)}
                    />
                    {accessStaffId === s.id && s.role === "staff" ? (
                      <StaffGroupAccessEditor
                        staff={s}
                        onClose={() => setAccessStaffId(null)}
                        onSaved={refresh}
                        onError={setError}
                      />
                    ) : null}
                  </div>
                ))}
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

        <section className="card-surface" style={{ padding: "var(--space-5)" }}>
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
    </div>
  );
}
