import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "./api.js";
import { AccountSettingsSection } from "./accountAccordion.js";
import {
  Badge,
  ErrorBanner,
  Field,
  LoadingState,
  PageHeader,
  PasswordInput,
  SuccessBanner,
  usePasswordVisibility,
} from "./components.jsx";
import {
  emailAccordionStatusPills,
  emailAccordionStatusSummary,
  TWO_FACTOR_STATUS_PILLS,
} from "./accountScreenUi.js";

function fieldError(error, name) {
  const value = error?.data?.[name];
  if (Array.isArray(value) && value.length) return value[0];
  if (typeof value === "string") return value;
  return "";
}

function EmailActionRow({ label, email, status, children }) {
  return (
    <div className="account-email-block">
      <div className="account-email-row">
        <div>
          <p className="account-email-label">{label}</p>
          {email ? <strong>{email}</strong> : <span className="hint">Not added</span>}
        </div>
        {status ? <Badge variant={status === "Verified" ? "live" : undefined}>{status}</Badge> : null}
      </div>
      {children}
    </div>
  );
}

export default function AccountScreen({ onAccountDeleted }) {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [emailError, setEmailError] = useState("");

  const [primaryOpen, setPrimaryOpen] = useState(false);
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [primaryPassword, setPrimaryPassword] = useState("");
  const [primaryFieldErrors, setPrimaryFieldErrors] = useState({});
  const [primarySaving, setPrimarySaving] = useState(false);

  const [backupOpen, setBackupOpen] = useState(false);
  const [backupEmail, setBackupEmail] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [backupFieldErrors, setBackupFieldErrors] = useState({});
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupRemoveOpen, setBackupRemoveOpen] = useState(false);
  const [backupRemovePassword, setBackupRemovePassword] = useState("");

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
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const newPasswordVisibility = usePasswordVisibility();
  const emailPasswordVisibility = usePasswordVisibility();

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.account();
      setAccount(result.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

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

  async function handlePrimaryChange(event) {
    event.preventDefault();
    setPrimarySaving(true);
    setEmailError("");
    setEmailSuccess("");
    setPrimaryFieldErrors({});
    try {
      await api.csrf();
      await api.requestPrimaryEmailChange({
        email: primaryEmail,
        current_password: primaryPassword,
      });
      setPrimaryEmail("");
      setPrimaryPassword("");
      setPrimaryOpen(false);
      setEmailSuccess("Verification email sent to your new login email address.");
      await loadAccount();
    } catch (err) {
      const next = {
        email: fieldError(err, "email"),
        current_password: fieldError(err, "current_password"),
      };
      if (next.email || next.current_password) {
        setPrimaryFieldErrors(next);
      } else {
        setEmailError(errorMessage(err));
      }
    } finally {
      setPrimarySaving(false);
    }
  }

  async function handleBackupRequest(event) {
    event.preventDefault();
    setBackupSaving(true);
    setEmailError("");
    setEmailSuccess("");
    setBackupFieldErrors({});
    try {
      await api.csrf();
      await api.requestBackupEmail({
        email: backupEmail,
        current_password: backupPassword,
      });
      setBackupEmail("");
      setBackupPassword("");
      setBackupOpen(false);
      setEmailSuccess("Verification email sent to your backup email address.");
      await loadAccount();
    } catch (err) {
      const next = {
        email: fieldError(err, "email"),
        current_password: fieldError(err, "current_password"),
      };
      if (next.email || next.current_password) {
        setBackupFieldErrors(next);
      } else {
        setEmailError(errorMessage(err));
      }
    } finally {
      setBackupSaving(false);
    }
  }

  async function handleBackupRemove(event) {
    event.preventDefault();
    setBackupSaving(true);
    setEmailError("");
    setEmailSuccess("");
    setBackupFieldErrors({});
    try {
      await api.csrf();
      await api.removeBackupEmail({ current_password: backupRemovePassword });
      setBackupRemovePassword("");
      setBackupRemoveOpen(false);
      setEmailSuccess("Backup email removed.");
      await loadAccount();
    } catch (err) {
      const message = fieldError(err, "current_password");
      if (message) {
        setBackupFieldErrors({ current_password: message });
      } else {
        setEmailError(errorMessage(err));
      }
    } finally {
      setBackupSaving(false);
    }
  }

  async function handleResendBackup() {
    setEmailError("");
    setEmailSuccess("");
    try {
      await api.csrf();
      await api.resendBackupEmailVerification();
      setEmailSuccess("Verification email sent.");
    } catch (err) {
      setEmailError(errorMessage(err));
    }
  }

  async function handleCancelBackup() {
    setEmailError("");
    setEmailSuccess("");
    try {
      await api.csrf();
      await api.cancelBackupEmailChange();
      setEmailSuccess("Pending backup email change cancelled.");
      await loadAccount();
    } catch (err) {
      setEmailError(errorMessage(err));
    }
  }

  async function handleResendPrimary() {
    setEmailError("");
    setEmailSuccess("");
    try {
      await api.csrf();
      await api.resendPrimaryEmailChange();
      setEmailSuccess("Verification email sent.");
    } catch (err) {
      setEmailError(errorMessage(err));
    }
  }

  async function handleCancelPrimary() {
    setEmailError("");
    setEmailSuccess("");
    try {
      await api.csrf();
      await api.cancelPrimaryEmailChange();
      setEmailSuccess("Pending login email change cancelled.");
      await loadAccount();
    } catch (err) {
      setEmailError(errorMessage(err));
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

  const backupStatus = account.backup_email_status || "none";

  return (
    <div className="page account-page">
      <PageHeader
        title="Account"
        description="Owner email, verification status, and password."
      />
      <div className="account-settings-stack">
        <AccountSettingsSection
          id="email"
          title="Email"
          description="Login and backup email settings"
          statusSummary={emailAccordionStatusSummary(account)}
          statusPills={emailAccordionStatusPills(account)}
          variant="email"
          isOpen={emailExpanded}
          onToggle={() => setEmailExpanded((open) => !open)}
        >
          <div className="account-email-section">
            <EmailActionRow
              label="Login email"
              email={account.email}
              status={account.email_verified ? "Verified" : "Unverified"}
            >
              {!account.pending_primary_email && !primaryOpen ? (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setPrimaryOpen(true)}>
                  Change email
                </button>
              ) : null}
              {primaryOpen ? (
                <form className="auth-form account-inline-form" onSubmit={handlePrimaryChange} autoComplete="off">
                  <Field label="New login email" error={primaryFieldErrors.email}>
                    <input
                      type="email"
                      value={primaryEmail}
                      onChange={(e) => setPrimaryEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="Current password" error={primaryFieldErrors.current_password}>
                    <PasswordInput
                      value={primaryPassword}
                      onChange={(e) => setPrimaryPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      visible={emailPasswordVisibility.visible}
                      onVisibleChange={emailPasswordVisibility.setVisible}
                    />
                  </Field>
                  <div className="account-inline-actions">
                    <button type="submit" className="btn-primary" disabled={primarySaving}>
                      {primarySaving ? "Sending…" : "Send verification email"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={primarySaving}
                      onClick={() => {
                        setPrimaryOpen(false);
                        setPrimaryEmail("");
                        setPrimaryPassword("");
                        setPrimaryFieldErrors({});
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </EmailActionRow>

            {account.pending_primary_email ? (
              <EmailActionRow
                label="Pending change"
                email={account.pending_primary_email}
                status="Pending verification"
              >
                <div className="account-inline-actions">
                  <button type="button" className="btn-secondary btn-sm" onClick={handleResendPrimary}>
                    Resend verification
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={handleCancelPrimary}>
                    Cancel change
                  </button>
                </div>
              </EmailActionRow>
            ) : null}

            <EmailActionRow
              label="Backup email"
              email={
                backupStatus === "pending"
                  ? account.pending_backup_email
                  : backupStatus === "verified"
                    ? account.backup_email
                    : null
              }
              status={
                backupStatus === "pending"
                  ? "Pending verification"
                  : backupStatus === "verified"
                    ? "Verified"
                    : null
              }
            >
              {backupStatus === "none" && !backupOpen ? (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setBackupOpen(true)}>
                  Add backup email
                </button>
              ) : null}
              {backupStatus === "verified" && !backupOpen && !backupRemoveOpen ? (
                <div className="account-inline-actions">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setBackupOpen(true)}>
                    Change
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setBackupRemoveOpen(true)}>
                    Remove
                  </button>
                </div>
              ) : null}
              {backupStatus === "pending" ? (
                <div className="account-inline-actions">
                  <button type="button" className="btn-secondary btn-sm" onClick={handleResendBackup}>
                    Resend verification
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={handleCancelBackup}>
                    Cancel pending change
                  </button>
                </div>
              ) : null}
              {backupOpen ? (
                <form className="auth-form account-inline-form" onSubmit={handleBackupRequest} autoComplete="off">
                  <Field label="Backup email" error={backupFieldErrors.email}>
                    <input
                      type="email"
                      value={backupEmail}
                      onChange={(e) => setBackupEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="Current password" error={backupFieldErrors.current_password}>
                    <PasswordInput
                      value={backupPassword}
                      onChange={(e) => setBackupPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      visible={emailPasswordVisibility.visible}
                      onVisibleChange={emailPasswordVisibility.setVisible}
                    />
                  </Field>
                  <div className="account-inline-actions">
                    <button type="submit" className="btn-primary" disabled={backupSaving}>
                      {backupSaving ? "Sending…" : "Send verification email"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={backupSaving}
                      onClick={() => {
                        setBackupOpen(false);
                        setBackupEmail("");
                        setBackupPassword("");
                        setBackupFieldErrors({});
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
              {backupRemoveOpen ? (
                <form className="auth-form account-inline-form" onSubmit={handleBackupRemove} autoComplete="off">
                  <Field label="Current password" error={backupFieldErrors.current_password}>
                    <PasswordInput
                      value={backupRemovePassword}
                      onChange={(e) => setBackupRemovePassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </Field>
                  <div className="account-inline-actions">
                    <button type="submit" className="btn-danger" disabled={backupSaving}>
                      {backupSaving ? "Removing…" : "Remove backup email"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={backupSaving}
                      onClick={() => {
                        setBackupRemoveOpen(false);
                        setBackupRemovePassword("");
                        setBackupFieldErrors({});
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </EmailActionRow>
          </div>
          <p className="hint">Workspace staff accounts use a separate login and are not verified here.</p>
          <ErrorBanner message={emailError} />
          <SuccessBanner message={emailSuccess} />
        </AccountSettingsSection>

        <AccountSettingsSection
          id="password"
          title="Change password"
          description="Update your account password"
          variant="password"
          isOpen={passwordExpanded}
          onToggle={() => setPasswordExpanded((open) => !open)}
        >
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
        </AccountSettingsSection>

        <AccountSettingsSection
          id="two-factor"
          title="Two-factor authentication"
          description="Add a second step when signing in to your owner account."
          statusPills={TWO_FACTOR_STATUS_PILLS}
          variant="twoFactor"
        >
          <p className="account-settings-note">
            Two-factor authentication is recommended and coming next. It is not
            available for workspace staff logins in this release.
          </p>
        </AccountSettingsSection>

        <AccountSettingsSection
          id="danger"
          title="Danger zone"
          description="Permanent account deletion is separate from logout and archiving."
          variant="danger"
        >
          {!deleteOpen ? (
            <div className="danger-zone">
              <p>
                Permanently delete your Check Station account, this workspace, and
                customer-created operational data. This cannot be undone.
              </p>
              <button type="button" className="btn-danger btn-sm" onClick={() => setDeleteOpen(true)}>
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
        </AccountSettingsSection>
      </div>
    </div>
  );
}
