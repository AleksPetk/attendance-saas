import { useState } from "react";
import { api } from "./api.js";
import {
  ErrorBanner,
  Field,
  PasswordInput,
  SuccessBanner,
  usePasswordVisibility,
} from "./components.jsx";
import {
  oauthStartUrl,
  otherLinkedProviderForReauth,
  providerDisplayName,
} from "./signInMethodsUi.js";

function fieldError(error, name) {
  const value = error?.data?.[name];
  if (Array.isArray(value) && value.length) return value[0];
  if (typeof value === "string") return value;
  return "";
}

function MethodRow({ name, connected, hint, action, actionDisabled, actionHint }) {
  return (
    <div className="account-email-block">
      <div className="account-email-row">
        <div>
          <p className="account-email-label">{name}</p>
          <strong>{connected ? "Connected" : "Not connected"}</strong>
          {hint ? <p className="hint">{hint}</p> : null}
        </div>
      </div>
      {actionHint ? <p className="hint">{actionHint}</p> : null}
      {action ? (
        <div className="account-inline-actions">{action}</div>
      ) : null}
      {actionDisabled && !action ? (
        <p className="hint">At least one sign-in method must remain on your account.</p>
      ) : null}
    </div>
  );
}

export default function AccountSignInMethodsPanel({
  account,
  twoFactorEnabled,
  oauthReauthReady,
  onOpenChangePassword,
  onRefreshAccount,
}) {
  const methods = account?.sign_in_methods;
  const passwordEnabled = Boolean(methods?.password?.enabled);

  const [setPasswordOpen, setSetPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [setPasswordBusy, setSetPasswordBusy] = useState(false);
  const [setPasswordError, setSetPasswordError] = useState("");
  const [setPasswordFieldErrors, setSetPasswordFieldErrors] = useState({});
  const [setPasswordSuccess, setSetPasswordSuccess] = useState("");
  const [setPasswordCode, setSetPasswordCode] = useState("");
  const [setPasswordRecoveryCode, setSetPasswordRecoveryCode] = useState("");
  const [setPasswordUseRecovery, setSetPasswordUseRecovery] = useState(false);

  const [unlinkProvider, setUnlinkProvider] = useState(null);
  const [unlinkPassword, setUnlinkPassword] = useState("");
  const [unlinkCode, setUnlinkCode] = useState("");
  const [unlinkRecoveryCode, setUnlinkRecoveryCode] = useState("");
  const [unlinkUseRecovery, setUnlinkUseRecovery] = useState(false);
  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const [unlinkError, setUnlinkError] = useState("");
  const [unlinkFieldErrors, setUnlinkFieldErrors] = useState({});

  const passwordVisibility = usePasswordVisibility();

  const needsOAuthReauthForSetPassword =
    !passwordEnabled && !twoFactorEnabled && (methods?.google?.linked || methods?.apple?.linked);
  const setPasswordReauthReady = !needsOAuthReauthForSetPassword || oauthReauthReady;

  function startOAuth(intent, provider) {
    window.location.assign(oauthStartUrl(api.baseUrl, provider, intent));
  }

  async function handleSetPassword(event) {
    event.preventDefault();
    setSetPasswordBusy(true);
    setSetPasswordError("");
    setSetPasswordFieldErrors({});
    setSetPasswordSuccess("");
    try {
      await api.csrf();
      const payload = {
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      };
      if (twoFactorEnabled) {
        if (setPasswordUseRecovery) {
          payload.recovery_code = setPasswordRecoveryCode;
        } else {
          payload.code = setPasswordCode;
        }
      }
      const result = await api.setPassword(payload);
      setNewPassword("");
      setNewPasswordConfirm("");
      setSetPasswordCode("");
      setSetPasswordRecoveryCode("");
      setSetPasswordOpen(false);
      setSetPasswordSuccess("CheckStation password created.");
      if (onRefreshAccount) {
        await onRefreshAccount(result.data);
      }
    } catch (err) {
      const next = {
        new_password: fieldError(err, "new_password"),
        new_password_confirm: fieldError(err, "new_password_confirm"),
        code: fieldError(err, "code"),
        recovery_code: fieldError(err, "recovery_code"),
      };
      if (Object.values(next).some(Boolean)) {
        setSetPasswordFieldErrors(next);
      } else if (err?.data?.code === "oauth_reauth_required") {
        setSetPasswordError(
          err.data.detail ||
            "Confirm your identity with a linked sign-in provider before setting a password.",
        );
      } else {
        setSetPasswordError(err?.data?.detail || "Could not set password.");
      }
    } finally {
      setSetPasswordBusy(false);
    }
  }

  async function handleUnlink(event) {
    event.preventDefault();
    if (!unlinkProvider) return;
    setUnlinkBusy(true);
    setUnlinkError("");
    setUnlinkFieldErrors({});
    try {
      await api.csrf();
      const payload = {};
      if (passwordEnabled) {
        payload.current_password = unlinkPassword;
      }
      if (twoFactorEnabled) {
        if (unlinkUseRecovery) {
          payload.recovery_code = unlinkRecoveryCode;
        } else {
          payload.code = unlinkCode;
        }
      }
      const unlinkApi =
        unlinkProvider === "google" ? api.unlinkGoogle : api.unlinkApple;
      const result = await unlinkApi(payload);
      setUnlinkProvider(null);
      setUnlinkPassword("");
      setUnlinkCode("");
      setUnlinkRecoveryCode("");
      if (onRefreshAccount) {
        await onRefreshAccount(result.data);
      }
    } catch (err) {
      const next = {
        current_password: fieldError(err, "current_password"),
        code: fieldError(err, "code"),
        recovery_code: fieldError(err, "recovery_code"),
      };
      if (Object.values(next).some(Boolean)) {
        setUnlinkFieldErrors(next);
      } else if (err?.data?.code === "oauth_reauth_required") {
        setUnlinkError(
          err.data.detail ||
            "Confirm your identity with another linked sign-in provider before disconnecting.",
        );
      } else if (err?.data?.code === "last_sign_in_method") {
        setUnlinkError(err.data.detail || "At least one sign-in method must remain.");
      } else {
        setUnlinkError(err?.data?.detail || "Could not disconnect sign-in method.");
      }
    } finally {
      setUnlinkBusy(false);
    }
  }

  const reauthProvider = otherLinkedProviderForReauth(methods, unlinkProvider);

  return (
    <div className="account-email-section">
      <MethodRow
        name="Password"
        connected={passwordEnabled}
        action={
          passwordEnabled ? (
            <button type="button" className="btn-secondary btn-sm" onClick={onOpenChangePassword}>
              Change password
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                setSetPasswordOpen((open) => !open);
                setSetPasswordError("");
                setSetPasswordSuccess("");
              }}
            >
              Set password
            </button>
          )
        }
      />

      {setPasswordOpen && !passwordEnabled ? (
        <form className="auth-form account-inline-form" onSubmit={handleSetPassword} autoComplete="off">
          {needsOAuthReauthForSetPassword && !setPasswordReauthReady ? (
            <div className="account-inline-actions">
              <p className="hint">
                Confirm your identity with a linked provider before creating a CheckStation password.
              </p>
              {methods?.google?.linked ? (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => startOAuth("verify", "google")}
                >
                  Confirm with Google
                </button>
              ) : null}
              {methods?.apple?.linked ? (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => startOAuth("verify", "apple")}
                >
                  Confirm with Apple
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {twoFactorEnabled ? (
                <>
                  <Field
                    label={setPasswordUseRecovery ? "Recovery code" : "Authentication code"}
                    error={
                      setPasswordFieldErrors.code || setPasswordFieldErrors.recovery_code
                    }
                  >
                    {setPasswordUseRecovery ? (
                      <input
                        type="text"
                        value={setPasswordRecoveryCode}
                        onChange={(e) => setSetPasswordRecoveryCode(e.target.value)}
                        required
                        autoComplete="off"
                      />
                    ) : (
                      <input
                        type="text"
                        inputMode="numeric"
                        value={setPasswordCode}
                        onChange={(e) => setSetPasswordCode(e.target.value)}
                        required
                        autoComplete="one-time-code"
                      />
                    )}
                  </Field>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => setSetPasswordUseRecovery((value) => !value)}
                  >
                    {setPasswordUseRecovery ? "Use authenticator code" : "Use a recovery code"}
                  </button>
                </>
              ) : null}
              <Field label="New password" error={setPasswordFieldErrors.new_password}>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  visible={passwordVisibility.visible}
                  onVisibleChange={passwordVisibility.setVisible}
                />
              </Field>
              <Field label="Confirm new password" error={setPasswordFieldErrors.new_password_confirm}>
                <PasswordInput
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  visible={passwordVisibility.visible}
                  showToggle={false}
                />
              </Field>
              <div className="account-inline-actions">
                <button type="submit" className="btn-primary" disabled={setPasswordBusy}>
                  {setPasswordBusy ? "Saving…" : "Create password"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={setPasswordBusy}
                  onClick={() => setSetPasswordOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </form>
      ) : null}

      <MethodRow
        name="Google"
        connected={Boolean(methods?.google?.linked)}
        hint={methods?.google?.provider_email || null}
        action={
          methods?.google?.linked ? (
            unlinkProvider === "google" ? null : (
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={!methods?.can_unlink_google}
                onClick={() => {
                  setUnlinkProvider("google");
                  setUnlinkError("");
                  setUnlinkFieldErrors({});
                }}
              >
                Disconnect Google
              </button>
            )
          ) : (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => startOAuth("link", "google")}
            >
              Connect Google
            </button>
          )
        }
        actionDisabled={methods?.google?.linked && !methods?.can_unlink_google}
      />

      <MethodRow
        name="Apple"
        connected={Boolean(methods?.apple?.linked)}
        hint={methods?.apple?.provider_email || null}
        action={
          methods?.apple?.linked ? (
            unlinkProvider === "apple" ? null : (
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={!methods?.can_unlink_apple}
                onClick={() => {
                  setUnlinkProvider("apple");
                  setUnlinkError("");
                  setUnlinkFieldErrors({});
                }}
              >
                Disconnect Apple
              </button>
            )
          ) : (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => startOAuth("link", "apple")}
            >
              Connect Apple
            </button>
          )
        }
        actionDisabled={methods?.apple?.linked && !methods?.can_unlink_apple}
      />

      {unlinkProvider ? (
        <form className="auth-form account-inline-form" onSubmit={handleUnlink} autoComplete="off">
          <p className="hint">
            Disconnect {providerDisplayName(unlinkProvider)} from your CheckStation account.
          </p>
          {!passwordEnabled && reauthProvider && !oauthReauthReady ? (
            <div className="account-inline-actions">
              <p className="hint">
                Confirm your identity with {providerDisplayName(reauthProvider)} before disconnecting.
              </p>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => startOAuth("verify", reauthProvider)}
              >
                Confirm with {providerDisplayName(reauthProvider)}
              </button>
            </div>
          ) : (
            <>
              {passwordEnabled ? (
                <Field label="Current password" error={unlinkFieldErrors.current_password}>
                  <PasswordInput
                    value={unlinkPassword}
                    onChange={(e) => setUnlinkPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </Field>
              ) : null}
              {twoFactorEnabled ? (
                <>
                  <Field
                    label={unlinkUseRecovery ? "Recovery code" : "Authentication code"}
                    error={unlinkFieldErrors.code || unlinkFieldErrors.recovery_code}
                  >
                    {unlinkUseRecovery ? (
                      <input
                        type="text"
                        value={unlinkRecoveryCode}
                        onChange={(e) => setUnlinkRecoveryCode(e.target.value)}
                        required
                        autoComplete="off"
                      />
                    ) : (
                      <input
                        type="text"
                        inputMode="numeric"
                        value={unlinkCode}
                        onChange={(e) => setUnlinkCode(e.target.value)}
                        required
                        autoComplete="one-time-code"
                      />
                    )}
                  </Field>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => setUnlinkUseRecovery((value) => !value)}
                  >
                    {unlinkUseRecovery ? "Use authenticator code" : "Use a recovery code"}
                  </button>
                </>
              ) : null}
              <div className="account-inline-actions">
                <button type="submit" className="btn-danger" disabled={unlinkBusy}>
                  {unlinkBusy ? "Disconnecting…" : "Confirm disconnect"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={unlinkBusy}
                  onClick={() => setUnlinkProvider(null)}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </form>
      ) : null}

      <ErrorBanner message={setPasswordError || unlinkError} />
      <SuccessBanner message={setPasswordSuccess} />
    </div>
  );
}
