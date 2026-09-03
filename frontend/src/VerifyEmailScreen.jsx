import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "./api.js";
import { AuthLayout, ErrorBanner, LoadingState, SuccessBanner } from "./components.jsx";

export default function VerifyEmailScreen({ onSignedIn }) {
  const { t } = useTranslation("auth");
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
        setMessage(result.data.detail || t("verifyEmail.verifiedDefault"));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, token]);

  if (status === "loading") {
    return (
      <AuthLayout title={t("verifyEmail.loadingTitle")} lead={t("verifyEmail.loadingLead")}>
        <LoadingState label={t("verifyEmail.verifying")} />
      </AuthLayout>
    );
  }

  if (status === "verified") {
    return (
      <AuthLayout
        title={t("verifyEmail.verifiedTitle")}
        lead={t("verifyEmail.verifiedLead")}
        footnote={
          <p>
            {t("verifyEmail.otherDevice")}{" "}
            <Link to="/login">{t("verifyEmail.goToLogin")}</Link>
          </p>
        }
      >
        <div className="auth-status-panel">
          <SuccessBanner message={message} />
          {sessionReady ? (
            <button type="button" className="btn-primary btn-block" onClick={() => navigate("/dashboard")}>
              {t("continueToCheckStation")}
            </button>
          ) : (
            <Link className="btn-primary btn-block" to="/login?verified=1">
              {t("continueToLogin")}
            </Link>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={status === "expired" ? t("verifyEmail.expiredTitle") : t("verifyEmail.invalidTitle")}
      lead={status === "expired" ? t("verifyEmail.expiredLead") : t("verifyEmail.invalidLead")}
      footnote={
        <p>
          <Link to="/check-email">{t("verifyEmail.resendLink")}</Link>
          {" · "}
          <Link to="/login">{t("verifyEmail.returnToLogin")}</Link>
        </p>
      }
    >
      <ErrorBanner message={message} />
    </AuthLayout>
  );
}
