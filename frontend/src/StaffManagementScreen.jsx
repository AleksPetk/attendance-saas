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

function StaffRow({ staff, onDeactivateToggle, onResetPassword }) {
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
      <div className="person-meta" style={{ alignItems: "flex-start", flexDirection: "column" }}>
        <button type="button" className="btn-secondary btn-sm" onClick={onDeactivateToggle}>
          {staff.status === "active" ? "Deactivate" : "Reactivate"}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onResetPassword}>
          Reset password
        </button>
      </div>
    </article>
  );
}

export default function StaffManagementScreen({ session }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [staff, setStaff] = useState([]);

  const isOwner = session?.workspace?.account_kind === "owner";
  const workspaceId = session.workspace.workspace_id;

  const [createUsername, setCreateUsername] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState("staff");
  const [createPassword, setCreatePassword] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
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
  }, [isOwner]);

  async function refresh() {
    const result = await api.listWorkspaceStaff(null);
    setStaff(result.data || []);
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!isOwner) return;
    setError("");
    setCreating(true);

    try {
      await api.createWorkspaceStaff(null, {
        username: createUsername,
        email: createEmail,
        role: createRole,
        password: createPassword,
      });
      setCreateUsername("");
      setCreateEmail("");
      setCreateRole("staff");
      setCreatePassword("");
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
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

  if (!isOwner) {
    return (
      <div className="page">
        <EmptyState
          title="Owner-only"
          body="Only the paying workspace owner can manage admin and staff accounts."
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
        description="Create workspace admin and staff accounts. Share the Workspace ID so staff can sign in."
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
            <p>Admins and staff who can access this workspace.</p>
          </header>
          <div className="section-card-body">
            {staff.length ? (
              <div className="activity-list">
                {staff.map((s) => (
                  <StaffRow
                    key={s.id}
                    staff={s}
                    onDeactivateToggle={() => toggleDeactivate(s.id, s.status)}
                    onResetPassword={() => resetPassword(s.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No staff accounts yet"
                body="Create an admin or staff account for someone who needs workspace access."
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
            <Field label="Email (optional)">
              <input value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} type="email" />
            </Field>
            <Field label="Role">
              <select value={createRole} onChange={(e) => setCreateRole(e.target.value)}>
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
              </select>
            </Field>
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
