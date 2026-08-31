import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import { AuthLayout, ErrorBanner, LoadingState, SuccessBanner } from "./components.jsx";

export default function VerifyEmailScreen({ onSignedIn }) {
  const { uid, token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        await api.csrf();
        const result = await api.verifyEmail({ uid, token });
        if (cancelled) return;
        setStatus("verified");
        setMessage(result.data.detail || "Email verified.");
        try {
          const workspace = await api.loadWorkspace(null);
          if (cancelled) return;
          if (workspace.data) {
            setSessionReady(true);
            onSignedIn?.({ workspace: workspace.data });
          }
        } catch {
          setSessionReady(false);
        }
      } catch (err) {
        if (cancelled) return;
        const code = err?.data?.code;
        if (code === "token_expired") {
          setStatus("expired");
        } else {
          setStatus("invalid");
        }
        setMessage(errorMessage(err));
      }
    }
    run();
    return () => {
      cancelled = true;
    };
    // Session callback is intentionally omitted so a parent re-render cannot
    // replay a one-time verification token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, token]);

  if (status === "loading") {
    return (
      <AuthLayout title="Verifying email" lead="Please wait while we confirm your CheckStation email.">
        <LoadingState label="Verifying…" />
      </AuthLayout>
    );
  }

  if (status === "verified") {
    return (
      <AuthLayout
        title="Email verified"
        lead="Your CheckStation email is confirmed."
        footnote={
          <p>
            Need to sign in on another device? <Link to="/login">Go to login</Link>
          </p>
        }
      >
        <div className="auth-status-panel">
          <SuccessBanner message={message} />
          {sessionReady ? (
            <button type="button" className="btn-primary btn-block" onClick={() => navigate("/dashboard")}>
              Continue to CheckStation
            </button>
          ) : (
            <Link className="btn-primary btn-block" to="/login?verified=1">
              Continue to login
            </Link>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={status === "expired" ? "Link expired" : "Link invalid"}
      lead={
        status === "expired"
          ? "This verification link has expired. Request a new one."
          : "This verification link is invalid or has already been used."
      }
      footnote={
        <p>
          <Link to="/check-email">Resend verification email</Link>
          {" · "}
          <Link to="/login">Return to login</Link>
        </p>
      }
    >
      <ErrorBanner message={message} />
    </AuthLayout>
  );
}
