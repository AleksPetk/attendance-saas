import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, errorMessage, fieldError } from "./api.js";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import { useLanguage } from "./i18n/LanguageProvider.jsx";
import { AuthLayout, ErrorBanner, Field, PasswordInput, SuccessBanner } from "./components.jsx";

function RecoverStart() {
  const { t } = useTranslation(["auth", "errors"]);
  const { locale } = useLanguage();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await api.csrf();
      const result = await api.recoverAccountStart({ email, locale });
      setMessage(result.data.detail);
    } catch (err) {
      if (err?.status === 429 || err?.data?.code === "rate_limited") {
        setError(localizedErrorMessage(err, t));
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={t("recoverAccount.title")}
      lead={t("recoverAccount.lead")}
      footnote={(
        <p>
          <Link to="/login">{t("recoverAccount.backToLogin")}</Link>
          {" · "}
          <Link to="/forgot-password">{t("recoverAccount.forgotPasswordInstead")}</Link>
        </p>
      )}
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <Field label={t("recoverAccount.backupEmail")}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </Field>
        <SuccessBanner message={message} />
        <ErrorBanner message={error} />
        <button type="submit" className="btn-primary btn-block" disabled={loading}>
          {loading ? t("sending") : t("recoverAccount.sendLink")}
        </button>
      </form>
    </AuthLayout>
  );
}

function RecoverConfirm() {
  const { t } = useTranslation(["auth", "errors"]);
  const { uid, token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        await api.csrf();
        await api.recoverAccountConfirm({ uid, token });
        if (!cancelled) {
          navigate("/recover-account/continue", { replace: true });
        }
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err));
          setLoading(false);
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, token, uid]);

  if (loading && !error) {
    return (
      <AuthLayout title={t("recoverAccount.confirmingTitle")} lead={t("recoverAccount.confirmingLead")}>
        <p>{t("recoverAccount.confirming")}</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("recoverAccount.unavailableTitle")}
      lead={error || t("recoverAccount.invalidLead")}
      footnote={<Link to="/recover-account">{t("recoverAccount.tryAgain")}</Link>}
    />
  );
}

function RecoverContinue() {
  const { t } = useTranslation(["auth", "errors"]);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  async function refreshStatus() {
    const result = await api.recoverAccountStatus();
    setStage(result.data.stage || "none");
    return result.data;
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        await api.csrf();
        await refreshStatus();
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleTwoFactor(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.csrf();
      await api.recoverAccountTwoFactor(
        useRecovery ? { recovery_code: recoveryCode } : { code },
      );
      await refreshStatus();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCredentials(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setFieldErrors({});
    setBusy(true);
    try {
      await api.csrf();
      const result = await api.recoverAccountComplete({
        email,
        password,
        password_confirm: passwordConfirm,
      });
      setMessage(result.data.detail);
      setStage(result.data.stage || "awaiting_primary_verification");
    } catch (err) {
      const next = {};
      const emailErr = fieldError(err, "email");
      const passwordErr = fieldError(err, "password");
      const confirmErr = fieldError(err, "password_confirm");
      if (emailErr) next.email = emailErr;
      if (passwordErr) next.password = passwordErr;
      if (confirmErr) next.password_confirm = confirmErr;
      setFieldErrors(next);
      setError(Object.keys(next).length ? "" : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <AuthLayout title={t("recoverAccount.continueTitle")} lead={t("recoverAccount.continueLead")}>
        <p>{t("recoverAccount.loading")}</p>
      </AuthLayout>
    );
  }

  if (stage === "awaiting_two_factor") {
    return (
      <AuthLayout
        title={t("recoverAccount.twoFactorTitle")}
        lead={t("recoverAccount.twoFactorLead")}
        footnote={<Link to="/login">{t("recoverAccount.backToLogin")}</Link>}
      >
        <form onSubmit={handleTwoFactor} className="auth-form">
          <ErrorBanner message={error} />
          <Field label={t("fields.twoFactor")}>
            <input
              value={useRecovery ? recoveryCode : code}
              onChange={(e) => (useRecovery ? setRecoveryCode(e.target.value) : setCode(e.target.value))}
              required
              autoComplete="one-time-code"
              placeholder={useRecovery ? t("placeholders.recoveryCode") : t("placeholders.authenticatorCode")}
            />
          </Field>
          <button
            type="button"
            className="btn-secondary btn-block"
            onClick={() => {
              setUseRecovery((v) => !v);
              setCode("");
              setRecoveryCode("");
            }}
          >
            {useRecovery ? t("ownerLogin.useAuthenticator") : t("ownerLogin.useRecovery")}
          </button>
          <button type="submit" className="btn-primary btn-block" disabled={busy}>
            {t("verify")}
          </button>
        </form>
      </AuthLayout>
    );
  }

  if (stage === "awaiting_primary_verification") {
    return (
      <AuthLayout
        title={t("recoverAccount.checkNewEmailTitle")}
        lead={t("recoverAccount.checkNewEmailLead")}
        footnote={<Link to="/login">{t("recoverAccount.backToLogin")}</Link>}
      >
        <SuccessBanner message={message || t("recoverAccount.checkNewEmailDefault")} />
      </AuthLayout>
    );
  }

  if (stage === "awaiting_credentials") {
    return (
      <AuthLayout
        title={t("recoverAccount.credentialsTitle")}
        lead={t("recoverAccount.credentialsLead")}
        footnote={<Link to="/login">{t("recoverAccount.backToLogin")}</Link>}
      >
        <form onSubmit={handleCredentials} className="auth-form">
          <ErrorBanner message={error} />
          <SuccessBanner message={message} />
          <Field label={t("recoverAccount.newLoginEmail")} error={fieldErrors.email}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>
          <Field label={t("fields.newPassword")} error={fieldErrors.password}>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </Field>
          <Field label={t("fields.confirmNewPassword")} error={fieldErrors.password_confirm}>
            <PasswordInput
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </Field>
          <button type="submit" className="btn-primary btn-block" disabled={busy}>
            {busy ? t("updating") : t("recoverAccount.continue")}
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("recoverAccount.sessionMissingTitle")}
      lead={t("recoverAccount.sessionMissingLead")}
      footnote={<Link to="/recover-account">{t("recoverAccount.tryAgain")}</Link>}
    />
  );
}

function RecoverVerifyPrimary() {
  const { t } = useTranslation(["auth", "errors"]);
  const { uid, token } = useParams();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        await api.csrf();
        const result = await api.recoverAccountVerifyPrimary({ uid, token });
        if (!cancelled) {
          setDone(true);
          setDetail(result.data.detail);
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [token, uid]);

  if (done) {
    return (
      <AuthLayout
        title={t("recoverAccount.completeTitle")}
        lead={detail || t("recoverAccount.completeLead")}
      >
        <Link className="btn-primary btn-block" to="/login">
          {t("recoverAccount.backToSignIn")}
        </Link>
      </AuthLayout>
    );
  }

  if (error) {
    return (
      <AuthLayout
        title={t("recoverAccount.unavailableTitle")}
        lead={error}
        footnote={<Link to="/recover-account">{t("recoverAccount.tryAgain")}</Link>}
      />
    );
  }

  return (
    <AuthLayout title={t("recoverAccount.verifyingTitle")} lead={t("recoverAccount.verifyingLead")}>
      <p>{t("recoverAccount.confirming")}</p>
    </AuthLayout>
  );
}

export default function RecoverAccountScreen({ mode = "start" }) {
  if (mode === "confirm") return <RecoverConfirm />;
  if (mode === "continue") return <RecoverContinue />;
  if (mode === "verify-primary") return <RecoverVerifyPrimary />;
  return <RecoverStart />;
}
