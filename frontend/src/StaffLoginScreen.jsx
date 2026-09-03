import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "./api.js";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import { AuthLayout, ErrorBanner, Field, PasswordInput } from "./components.jsx";

export default function StaffLoginScreen({ onSignedIn }) {
  const { t } = useTranslation(["auth", "errors"]);
  const { t: tCommon } = useTranslation("common");
  const [workspaceId, setWorkspaceId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockedAccount, setLockedAccount] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setLockedAccount(null);

    try {
      await api.csrf();
      const result = await api.loginStaff({
        workspace_id: workspaceId,
        username,
        password,
      });
      onSignedIn({ workspace: result.data });
    } catch (err) {
      if (err?.status === 403 && err?.data?.code === "plan_account_locked") {
        setLockedAccount(err.data);
      } else if (err?.status === 429 || err?.data?.code === "rate_limited") {
        setError(localizedErrorMessage(err, t));
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  if (lockedAccount) {
    return (
      <AuthLayout
        variant="staff"
        title={t("staffLogin.lockedTitle")}
        lead={t("staffLogin.lockedLead")}
        footnote={
          <p>
            {t("staffLogin.ownerPrompt")}{" "}
            <Link to="/login">{t("staffLogin.ownerLink")}</Link>
          </p>
        }
      >
        <div className="plan-account-blocked" role="alert">
          <span className="plan-locked-badge">{tCommon("planLocked")}</span>
          <p>{t("staffLogin.lockedBody")}</p>
          {lockedAccount.workspace_id || lockedAccount.username ? (
            <dl>
              {lockedAccount.workspace_id ? (
                <>
                  <dt>{t("fields.workspaceId")}</dt>
                  <dd>{lockedAccount.workspace_id}</dd>
                </>
              ) : null}
              {lockedAccount.username ? (
                <>
                  <dt>{t("fields.username")}</dt>
                  <dd>{lockedAccount.username}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
          <div className="plan-account-blocked-actions">
            <button type="button" className="btn-secondary" onClick={() => setLockedAccount(null)}>
              {tCommon("tryAgain")}
            </button>
            <Link className="btn-ghost" to="/login">
              {t("staffLogin.ownerLoginButton")}
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      variant="staff"
      title={t("staffLogin.title")}
      lead={t("staffLogin.lead")}
      footnote={
        <p>
          {t("staffLogin.ownerPrompt")}{" "}
          <Link to="/login">{t("staffLogin.ownerLink")}</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="auth-fields">
          <Field label={t("fields.workspaceId")} hint={t("staffLogin.workspaceIdHint")}>
            <input
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
          </Field>
          <Field label={t("fields.username")}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </Field>
          <Field label={t("fields.password")}>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
        </div>
        <ErrorBanner message={error} />
        <button type="submit" className="btn-primary btn-block" disabled={loading}>
          {loading ? t("signingIn") : t("enterWorkspace")}
        </button>
      </form>
    </AuthLayout>
  );
}
