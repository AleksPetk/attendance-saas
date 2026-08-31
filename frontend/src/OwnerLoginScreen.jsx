import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import AuthProviderButtons, { AuthMethodDivider } from "./AuthProviderButtons.jsx";
import { AuthLayout, ErrorBanner, Field, PasswordInput, SuccessBanner } from "./components.jsx";

export default function OwnerLoginScreen({ onSignedIn }) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => location.state?.oauthError || "");
  const [info, setInfo] = useState(() => {
    if (searchParams.get("verified") === "1") return "Email verified. Sign in to continue.";
    if (searchParams.get("reset") === "1") return "Password updated. Sign in with your new password.";
    if (searchParams.get("deleted") === "1") {
      return "Your CheckStation account and workspace have been permanently deleted.";
    }
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
      setTwoFactorError(errorMessage(err) || "Authentication failed.");
    }
  }

  async function handleResend() {
    setResendLoading(true);
    setResendMessage("");
    try {
      await api.csrf();
      const result = await api.resendVerification({ email });
      setResendMessage(result.data.detail || "If that email needs verification, we sent a new link.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <AuthLayout
      title={needsTwoFactor ? "Two-factor authentication" : "Customer login"}
      lead={
        needsTwoFactor
          ? "Enter the 6-digit code from your authenticator app."
          : "Sign in as the paying workspace owner with your email and password."
      }
      footnote={
        <p>
          Staff member? <Link to="/staff-login">Staff login</Link>
          {" · "}
          New here? <Link to="/register">Create account</Link>
        </p>
      }
    >
      {!needsTwoFactor ? (
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-fields">
            <Field label="Email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                autoComplete="email"
              />
            </Field>
            <Field label="Password">
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
                {resendLoading ? "Sending…" : "Resend verification email"}
              </button>
            </div>
          ) : null}
          <button type="submit" className="btn-primary btn-block" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p className="hint" style={{ textAlign: "center" }}>
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
          <AuthMethodDivider />
          <AuthProviderButtons intent="login" />
        </form>
      ) : (
        <form onSubmit={handleTwoFactorVerify} className="auth-form">
          <ErrorBanner message={twoFactorError} />
          <div className="auth-fields">
            <Field label="Two-factor authentication">
              <input
                value={useRecoveryCode ? twoFactorRecoveryCode : twoFactorCode}
                onChange={(e) => (useRecoveryCode ? setTwoFactorRecoveryCode(e.target.value) : setTwoFactorCode(e.target.value))}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder={useRecoveryCode ? "e.g. ABCD-EFGH" : "6-digit code"}
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
              {useRecoveryCode ? "Use an authenticator code" : "Use a recovery code"}
            </button>
            <button type="submit" className="btn-primary btn-block">
              Verify
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
