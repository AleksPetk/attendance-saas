import { useEffect, useState } from "react";
import { api, errorMessage } from "./api.js";
import {
  Badge,
  ErrorBanner,
  Field,
  LoadingState,
  PageHeader,
  PasswordInput,
  SectionCard,
  SuccessBanner,
  usePasswordVisibility,
} from "./components.jsx";

function fieldError(error, name) {
  const value = error?.data?.[name];
  if (Array.isArray(value) && value.length) return value[0];
  if (typeof value === "string") return value;
  return "";
}

export default function AccountScreen({ onAccountDeleted }) {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteFieldErrors, setDeleteFieldErrors] = useState({});
  const [deleting, setDeleting] = useState(false);
  const newPasswordVisibility = usePasswordVisibility();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await api.account();
        if (cancelled) return;
        setAccount(result.data);
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleChangePassword(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    setFieldErrors({});
    setSuccess("");
    try {
      await api.csrf();
      await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      });
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setSuccess("Password changed.");
    } catch (err) {
      const next = {
        current_password: fieldError(err, "current_password"),
        new_password: fieldError(err, "new_password"),
        new_password_confirm: fieldError(err, "new_password_confirm"),
      };
      if (next.current_password || next.new_password || next.new_password_confirm) {
        setFieldErrors(next);
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount(event) {
    event.preventDefault();
    const confirmed = window.confirm(
      "This cannot be undone. Permanently delete your Check Station account and workspace?"
    );
    if (!confirmed) return;
    setDeleting(true);
    setDeleteError("");
    setDeleteFieldErrors({});
    try {
      await api.csrf();
      await api.deleteAccount({
        current_password: deletePassword,
        confirmation: deleteConfirmation,
      });
      if (onAccountDeleted) onAccountDeleted();
    } catch (err) {
      const next = {
        current_password: fieldError(err, "current_password"),
        confirmation: fieldError(err, "confirmation"),
      };
      if (next.current_password || next.confirmation) {
        setDeleteFieldErrors(next);
      } else {
        setDeleteError(errorMessage(err));
      }
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState label="Loading account…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorBanner message={error} />
      </div>
    );
  }

  return (
    <div className="page account-page">
      <PageHeader
        title="Account"
        description="Owner email, verification status, and password."
      />
      <SectionCard title="Email" description="This is the paying customer login for this workspace.">
        <div className="account-email-row">
          <div>
            <strong>{account.email}</strong>
            <p className="hint">Workspace staff accounts use a separate login and are not verified here.</p>
          </div>
          {account.email_verified ? (
            <Badge variant="live">Verified</Badge>
          ) : (
            <Badge>Unverified</Badge>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Change password" description="Enter your current password, then choose a new one.">
        <form className="auth-form" onSubmit={handleChangePassword} autoComplete="off">
          <Field label="Current password" error={fieldErrors.current_password}>
            <PasswordInput
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
          <Field label="New password" error={fieldErrors.new_password}>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              visible={newPasswordVisibility.visible}
              onVisibleChange={newPasswordVisibility.setVisible}
            />
          </Field>
          <Field label="Confirm new password" error={fieldErrors.new_password_confirm}>
            <PasswordInput
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              required
              autoComplete="new-password"
              visible={newPasswordVisibility.visible}
              showToggle={false}
            />
          </Field>
          <ErrorBanner message={formError} />
          <SuccessBanner message={success} />
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Update password"}
          </button>
        </form>
      </SectionCard>
      <SectionCard title="Two-factor authentication">
        <div className="coming-soon-card">
          <Badge variant="pro">Recommended</Badge>
          <p>{account.two_factor_label}</p>
        </div>
      </SectionCard>
      <SectionCard
        title="Danger zone"
        description="Permanent account deletion is separate from logout and from archiving workspace records."
      >
        {!deleteOpen ? (
          <div className="danger-zone">
            <p>
              Permanently delete your Check Station account, this workspace, and
              customer-created operational data. This cannot be undone.
            </p>
            <button type="button" className="btn-danger" onClick={() => setDeleteOpen(true)}>
              Delete account
            </button>
          </div>
        ) : (
          <form className="auth-form danger-zone-form" onSubmit={handleDeleteAccount} autoComplete="off">
            <div className="danger-zone-warning">
              <p>
                <strong>This cannot be undone.</strong> Permanent deletion removes
                your Check Station account, this workspace, and customer-created
                operational data such as Members, Groups, kiosk configuration,
                staff logins, and history.
              </p>
              <p>
                Your account and workspace data will be permanently deleted, except
                information we may be required to retain by law or for
                security/compliance purposes.
              </p>
              <p>This is not logout, archive, or subscription cancellation.</p>
            </div>
            <Field label="Current password" error={deleteFieldErrors.current_password}>
              <PasswordInput
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Field>
            <Field
              label='Type DELETE to confirm'
              error={deleteFieldErrors.confirmation}
            >
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                required
                autoComplete="off"
              />
            </Field>
            <ErrorBanner message={deleteError} />
            <div className="danger-zone-actions">
              <button type="submit" className="btn-danger" disabled={deleting}>
                {deleting ? "Deleting…" : "Permanently delete account"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={deleting}
                onClick={() => {
                  setDeleteOpen(false);
                  setDeletePassword("");
                  setDeleteConfirmation("");
                  setDeleteError("");
                  setDeleteFieldErrors({});
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </SectionCard>
    </div>
  );
}
