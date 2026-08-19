import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import { AuthLayout, ErrorBanner, Field, PasswordInput, SuccessBanner } from "./components.jsx";

export default function OwnerLoginScreen({ onSignedIn }) {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState(() => {
    if (searchParams.get("verified") === "1") return "Email verified. Sign in to continue.";
    if (searchParams.get("reset") === "1") return "Password updated. Sign in with your new password.";
    if (searchParams.get("deleted") === "1") {
      return "Your Check Station account and workspace have been permanently deleted.";
    }
    return "";
  });
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNeedsVerification(false);
    setResendMessage("");

    try {
      await api.csrf();
      const result = await api.loginOwner({ email, password });
      onSignedIn({ workspace: result.data });
    } catch (err) {
      if (err?.data?.code === "email_not_verified") {
        setNeedsVerification(true);
        setError(errorMessage(err));
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
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
      title="Customer login"
      lead="Sign in as the paying workspace owner with your email and password."
      footnote={
        <p>
          Staff member? <Link to="/staff-login">Staff login</Link>
          {" · "}
          New here? <Link to="/register">Create account</Link>
        </p>
      }
    >
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
            <button type="button" className="btn-secondary btn-block" onClick={handleResend} disabled={resendLoading || !email}>
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
      </form>
    </AuthLayout>
  );
}
