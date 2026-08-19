import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import { AuthLayout, ErrorBanner, SuccessBanner } from "./components.jsx";

export default function CheckEmailScreen() {
  const location = useLocation();
  const email = location.state?.email || "";
  const initiallySent = location.state?.verificationEmailSent !== false;
  const [message, setMessage] = useState(location.state?.detail || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(initiallySent);

  const lead = useMemo(() => {
    if (email) {
      return `We sent a verification link to ${email}. Open that email to continue.`;
    }
    return "We sent a verification link to your email. Open that email to continue.";
  }, [email]);

  async function handleResend() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await api.csrf();
      const payload = email ? { email } : {};
      const result = await api.resendVerification(payload);
      setSent(true);
      setMessage(result.data.detail || "Verification email sent.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Check your email"
      lead={lead}
      footnote={
        <p>
          Already verified? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      <div className="auth-status-panel">
        {sent ? (
          <p>
            The link expires in 24 hours. If you do not see the email, check spam or resend
            it below.
          </p>
        ) : (
          <p>
            Your account was created, but the verification email could not be sent. Use Resend
            to try again.
          </p>
        )}
        <SuccessBanner message={message} />
        <ErrorBanner message={error} />
        <button type="button" className="btn-primary btn-block" onClick={handleResend} disabled={loading}>
          {loading ? "Sending…" : "Resend verification email"}
        </button>
        <Link className="btn-secondary btn-block" to="/login">
          Return to login
        </Link>
      </div>
    </AuthLayout>
  );
}
