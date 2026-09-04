import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "./api.js";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import AuthProviderButtons, { AuthMethodDivider } from "./AuthProviderButtons.jsx";
import { AuthLayout, ErrorBanner, Field, PasswordInput, SuccessBanner } from "./components.jsx";
import { WorkspaceLanguageMenu } from "./i18n/LanguageSwitcher.jsx";

export default function OwnerLoginScreen({ onSignedIn }) {
  const { t } = useTranslation(["auth", "errors"]);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => location.state?.oauthError || "");
  const [info, setInfo] = useState(() => {
    if (searchParams.get("verified") === "1") return t("ownerLogin.verifiedInfo");
    if (searchParams.get("reset") === "1") return t("ownerLogin.resetInfo");
    if (searchParams.get("deleted") === "1") return t("ownerLogin.deletedInfo");
    return "";
  });
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [needsTwoFactor, setNeedsTwoFactor] = useState(
    () => searchParams.get("two_factor") === "1",
  );
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorRecoveryCode, setTwoFactorRecoveryCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  useEffect(() => {
    if (searchParams.get("two_factor") === "1") {
      setNeedsTwoFactor(true);
    }
  }, [searchParams]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNeedsVerification(false);
    setNeedsTwoFactor(false);
    setTwoFactorError("");
    setTwoFactorCode("");
    setTwoFactorRecoveryCode("");
    setResendMessage("");

    try {
      await api.csrf();
      const result = await api.loginOwner({ email, password });
      onSignedIn({ workspace: result.data });
    } catch (err) {
      if (err?.data?.code === "email_not_verified") {
        setNeedsVerification(true);
        setError(errorMessage(err));
      } else if (err?.data?.code === "two_factor_required") {
        setNeedsTwoFactor(true);
      } else if (err?.status === 429 || err?.data?.code === "rate_limited") {
        setError(localizedErrorMessage(err, t));
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleTwoFactorVerify(event) {
    event.preventDefault();
    setTwoFactorError("");
    const payload = useRecoveryCode
      ? { recovery_code: twoFactorRecoveryCode }
      : { code: twoFactorCode };
    try {
      await api.csrf();
      const result = await api.owner2faChallenge(payload);
      onSignedIn({ workspace: result.data });
    } catch (err) {
      setTwoFactorError(errorMessage(err) || t("ownerLogin.authFailed"));
    }
  }

  async function handleResend() {
    setResendLoading(true);
    setResendMessage("");
    try {
      await api.csrf();
      const result = await api.resendVerification({ email });
      setResendMessage(result.data.detail || t("ownerLogin.resendDefault"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <AuthLayout
      title={needsTwoFactor ? t("ownerLogin.title2fa") : t("ownerLogin.title")}
      lead={needsTwoFactor ? t("ownerLogin.lead2fa") : undefined}
      headerAction={<WorkspaceLanguageMenu />}
      footnote={
        <p>
          {t("ownerLogin.staffPrompt")}{" "}
          <Link to="/staff-login">{t("ownerLogin.staffLink")}</Link>
          {" · "}
          {t("ownerLogin.newHere")}{" "}
          <Link to="/register">{t("ownerLogin.createAccountLink")}</Link>
        </p>
      }
    >
      {!needsTwoFactor ? (
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-fields">
            <Field label={t("fields.email")}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                autoComplete="email"
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
          <SuccessBanner message={info} />
          <ErrorBanner message={error} />
          {needsVerification ? (
            <div className="auth-status-panel">
              <SuccessBanner message={resendMessage} />
              <button
                type="button"
                className="btn-secondary btn-block"
                onClick={handleResend}
                disabled={resendLoading || !email}
              >
                {resendLoading ? t("sending") : t("resendVerification")}
              </button>
            </div>
          ) : null}
          <button type="submit" className="btn-primary btn-block" disabled={loading}>
            {loading ? t("signingIn") : t("signIn")}
          </button>
          <p className="hint" style={{ textAlign: "center" }}>
            <Link to="/forgot-password">{t("ownerLogin.forgotPassword")}</Link>
            <br />
            <Link to="/recover-account">{t("ownerLogin.recoverAccount")}</Link>
          </p>
          <AuthMethodDivider />
          <AuthProviderButtons intent="login" />
        </form>
      ) : (
        <form onSubmit={handleTwoFactorVerify} className="auth-form">
          <ErrorBanner message={twoFactorError} />
          <div className="auth-fields">
            <Field label={t("fields.twoFactor")}>
              <input
                value={useRecoveryCode ? twoFactorRecoveryCode : twoFactorCode}
                onChange={(e) => (useRecoveryCode ? setTwoFactorRecoveryCode(e.target.value) : setTwoFactorCode(e.target.value))}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder={useRecoveryCode ? t("placeholders.recoveryCode") : t("placeholders.authenticatorCode")}
              />
            </Field>
          </div>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <button
              type="button"
              className="btn-secondary btn-block"
              onClick={() => {
                setUseRecoveryCode((v) => !v);
                setTwoFactorCode("");
                setTwoFactorRecoveryCode("");
              }}
            >
              {useRecoveryCode ? t("ownerLogin.useAuthenticator") : t("ownerLogin.useRecovery")}
            </button>
            <button type="submit" className="btn-primary btn-block">
              {t("verify")}
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
