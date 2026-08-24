import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import { AuthLayout, ErrorBanner, LoadingState, SuccessBanner } from "./components.jsx";

export default function VerifyBackupEmailScreen() {
  const { uid, token } = useParams();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        await api.csrf();
        const result = await api.verifyBackupEmail({ uid, token });
        if (cancelled) return;
        setStatus("verified");
        setMessage(result.data.detail || "Backup email verified.");
      } catch (err) {
        if (cancelled) return;
        const code = err?.data?.code;
        if (code === "token_expired") {
          setStatus("expired");
        } else if (code === "email_unavailable") {
          setStatus("unavailable");
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
  }, [uid, token]);

  if (status === "loading") {
    return (
      <AuthLayout title="Verifying backup email" lead="Please wait while we confirm your backup email.">
        <LoadingState label="Verifying…" />
      </AuthLayout>
    );
  }

  if (status === "verified") {
    return (
      <AuthLayout
        title="Backup email verified"
        lead="Your Check Station backup email is confirmed."
        footnote={
          <p>
            <Link to="/account">Return to account</Link>
            {" · "}
            <Link to="/login">Go to login</Link>
          </p>
        }
      >
        <div className="auth-status-panel">
          <SuccessBanner message={message} />
          <Link className="btn-primary btn-block" to="/account">
            Return to account
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const title =
    status === "expired"
      ? "Link expired"
      : status === "unavailable"
        ? "Email unavailable"
        : "Link invalid";
  const lead =
    status === "expired"
      ? "This backup email verification link has expired. Request a new one from your account page."
      : status === "unavailable"
        ? "This email address is no longer available for your account."
        : "This backup email verification link is invalid or has already been used.";

  return (
    <AuthLayout
      title={title}
      lead={lead}
      footnote={
        <p>
          <Link to="/account">Return to account</Link>
          {" · "}
          <Link to="/login">Return to login</Link>
        </p>
      }
    >
      <ErrorBanner message={message} />
    </AuthLayout>
  );
}
