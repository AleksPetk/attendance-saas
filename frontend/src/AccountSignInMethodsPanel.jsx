import { useState } from "react";
import { useTranslation } from "react-i18next";
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

function MethodRow({ name, connected, connectedLabel, notConnectedLabel, hint, action, actionDisabled, actionHint, lastMethodWarning }) {
  return (
    <div className="account-email-block">
      <div className="account-email-row">
        <div>
          <p className="account-email-label">{name}</p>
          <strong>{connected ? connectedLabel : notConnectedLabel}</strong>
          {hint ? <p className="hint">{hint}</p> : null}
        </div>
      </div>
      {actionHint ? <p className="hint">{actionHint}</p> : null}
      {action ? (
        <div className="account-inline-actions">{action}</div>
      ) : null}
      {actionDisabled && !action ? (
        <p className="hint">{lastMethodWarning}</p>
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
  const { t } = useTranslation(["account", "common"]);
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
      setSetPasswordSuccess(t("account:signInMethods.passwordCreated"));
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
          err.data.detail || t("account:signInMethods.errors.oauthReauthSetPassword"),
        );
      } else {
        setSetPasswordError(err?.data?.detail || t("account:signInMethods.errors.setPasswordFailed"));
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
          err.data.detail || t("account:signInMethods.errors.oauthReauthUnlink"),
        );
      } else if (err?.data?.code === "last_sign_in_method") {
        setUnlinkError(err.data.detail || t("account:signInMethods.errors.lastMethod"));
      } else {
        setUnlinkError(err?.data?.detail || t("account:signInMethods.errors.unlinkFailed"));
      }
    } finally {
      setUnlinkBusy(false);
    }
  }

  const reauthProvider = otherLinkedProviderForReauth(methods, unlinkProvider);

  return (
    <div className="account-email-section">
      <MethodRow
        name={t("account:signInMethods.password")}
        connected={passwordEnabled}
        connectedLabel={t("account:signInMethods.connected")}
        notConnectedLabel={t("account:signInMethods.notSet")}
        lastMethodWarning={t("account:signInMethods.lastMethodWarning")}
        action={
          passwordEnabled ? (
            <button type="button" className="btn-secondary btn-sm" onClick={onOpenChangePassword}>
              {t("account:signInMethods.changePassword")}
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
              {t("account:signInMethods.setPassword")}
            </button>
          )
        }
      />

      {setPasswordOpen && !passwordEnabled ? (
        <form className="auth-form account-inline-form" onSubmit={handleSetPassword} autoComplete="off">
          {needsOAuthReauthForSetPassword && !setPasswordReauthReady ? (
            <div className="account-inline-actions">
              <p className="hint">{t("account:signInMethods.oauthReauthSetPassword")}</p>
              {methods?.google?.linked ? (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => startOAuth("verify", "google")}
                >
                  {t("account:signInMethods.confirmWithGoogle")}
                </button>
              ) : null}
              {methods?.apple?.linked ? (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => startOAuth("verify", "apple")}
                >
                  {t("account:signInMethods.confirmWithApple")}
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {twoFactorEnabled ? (
                <>
                  <Field
                    label={setPasswordUseRecovery ? t("account:twoFactor.recoveryCode") : t("account:signInMethods.authCode")}
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
                    {setPasswordUseRecovery ? t("account:twoFactor.useAuthenticator") : t("account:twoFactor.useRecovery")}
                  </button>
                </>
              ) : null}
              <Field label={t("account:password.new")} error={setPasswordFieldErrors.new_password}>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  visible={passwordVisibility.visible}
                  onVisibleChange={passwordVisibility.setVisible}
                />
              </Field>
              <Field label={t("account:password.confirmNew")} error={setPasswordFieldErrors.new_password_confirm}>
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
                  {setPasswordBusy ? t("account:password.saving") : t("account:signInMethods.createPassword")}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={setPasswordBusy}
                  onClick={() => setSetPasswordOpen(false)}
                >
                  {t("common:cancel")}
                </button>
              </div>
            </>
          )}
        </form>
      ) : null}

      <MethodRow
        name="Google"
        connected={Boolean(methods?.google?.linked)}
        connectedLabel={t("account:signInMethods.connected")}
        notConnectedLabel={t("account:signInMethods.notConnected")}
        lastMethodWarning={t("account:signInMethods.lastMethodWarning")}
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
                {t("account:signInMethods.disconnectGoogle")}
              </button>
            )
          ) : (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => startOAuth("link", "google")}
            >
              {t("account:signInMethods.connectGoogle")}
            </button>
          )
        }
        actionDisabled={methods?.google?.linked && !methods?.can_unlink_google}
      />

      <MethodRow
        name="Apple"
        connected={Boolean(methods?.apple?.linked)}
        connectedLabel={t("account:signInMethods.connected")}
        notConnectedLabel={t("account:signInMethods.notConnected")}
        lastMethodWarning={t("account:signInMethods.lastMethodWarning")}
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
                {t("account:signInMethods.disconnectApple")}
              </button>
            )
          ) : (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => startOAuth("link", "apple")}
            >
              {t("account:signInMethods.connectApple")}
            </button>
          )
        }
        actionDisabled={methods?.apple?.linked && !methods?.can_unlink_apple}
      />

      {unlinkProvider ? (
        <form className="auth-form account-inline-form" onSubmit={handleUnlink} autoComplete="off">
          <p className="hint">
            {t("account:signInMethods.disconnectFrom", { provider: providerDisplayName(unlinkProvider) })}
          </p>
          {!passwordEnabled && reauthProvider && !oauthReauthReady ? (
            <div className="account-inline-actions">
              <p className="hint">
                {t("account:signInMethods.oauthReauthUnlink", { provider: providerDisplayName(reauthProvider) })}
              </p>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => startOAuth("verify", reauthProvider)}
              >
                {t("account:signInMethods.confirmWithProvider", { provider: providerDisplayName(reauthProvider) })}
              </button>
            </div>
          ) : (
            <>
              {passwordEnabled ? (
                <Field label={t("account:email.currentPassword")} error={unlinkFieldErrors.current_password}>
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
                    label={unlinkUseRecovery ? t("account:twoFactor.recoveryCode") : t("account:signInMethods.authCode")}
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
                    {unlinkUseRecovery ? t("account:twoFactor.useAuthenticator") : t("account:twoFactor.useRecovery")}
                  </button>
                </>
              ) : null}
              <div className="account-inline-actions">
                <button type="submit" className="btn-danger" disabled={unlinkBusy}>
                  {unlinkBusy ? t("account:signInMethods.disconnecting") : t("account:signInMethods.confirmDisconnect")}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={unlinkBusy}
                  onClick={() => setUnlinkProvider(null)}
                >
                  {t("common:cancel")}
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
