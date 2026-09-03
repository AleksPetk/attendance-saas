import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "./api.js";
import { AuthLayout, ErrorBanner, LoadingState, SuccessBanner } from "./components.jsx";

export default function VerifyBackupEmailScreen() {
  const { t } = useTranslation("auth");
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
        setMessage(result.data.detail || t("verifyBackupEmail.verifiedDefault"));
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
  }, [uid, token, t]);

  if (status === "loading") {
    return (
      <AuthLayout title={t("verifyBackupEmail.loadingTitle")} lead={t("verifyBackupEmail.loadingLead")}>
        <LoadingState label={t("verifyEmail.verifying")} />
      </AuthLayout>
    );
  }

  if (status === "verified") {
    return (
      <AuthLayout
        title={t("verifyBackupEmail.verifiedTitle")}
        lead={t("verifyBackupEmail.verifiedLead")}
        footnote={
          <p>
            <Link to="/account/security">{t("verifyBackupEmail.returnToAccount")}</Link>
            {" · "}
            <Link to="/login">{t("verifyEmail.goToLogin")}</Link>
          </p>
        }
      >
        <div className="auth-status-panel">
          <SuccessBanner message={message} />
          <Link className="btn-primary btn-block" to="/account/security">
            {t("verifyBackupEmail.returnToAccount")}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const title =
    status === "expired"
      ? t("linkExpired")
      : status === "unavailable"
        ? t("verifyBackupEmail.unavailableTitle")
        : t("linkInvalid");
  const lead =
    status === "expired"
      ? t("verifyBackupEmail.expiredLead")
      : status === "unavailable"
        ? t("verifyBackupEmail.unavailableLead")
        : t("verifyBackupEmail.invalidLead");

  return (
    <AuthLayout
      title={title}
      lead={lead}
      footnote={
        <p>
          <Link to="/account/security">{t("verifyBackupEmail.returnToAccount")}</Link>
          {" · "}
          <Link to="/login">{t("verifyEmail.returnToLogin")}</Link>
        </p>
      }
    >
      <ErrorBanner message={message} />
    </AuthLayout>
  );
}
