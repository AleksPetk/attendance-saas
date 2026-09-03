import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "./api.js";
import { AuthLayout, ErrorBanner, SuccessBanner } from "./components.jsx";

export default function CheckEmailScreen() {
  const { t } = useTranslation("auth");
  const location = useLocation();
  const email = location.state?.email || "";
  const initiallySent = location.state?.verificationEmailSent !== false;
  const [message, setMessage] = useState(location.state?.detail || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(initiallySent);

  const lead = useMemo(() => {
    if (email) {
      return t("checkEmail.leadWithEmail", { email });
    }
    return t("checkEmail.leadGeneric");
  }, [email, t]);

  async function handleResend() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await api.csrf();
      const payload = email ? { email } : {};
      const result = await api.resendVerification(payload);
      setSent(true);
      setMessage(result.data.detail || t("checkEmail.sentDefault"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={t("checkEmail.title")}
      lead={lead}
      footnote={
        <p>
          {t("checkEmail.alreadyVerified")}{" "}
          <Link to="/login">{t("signIn")}</Link>
        </p>
      }
    >
      <div className="auth-status-panel">
        {sent ? (
          <p>{t("checkEmail.expiryHint")}</p>
        ) : (
          <p>{t("checkEmail.sendFailedHint")}</p>
        )}
        <SuccessBanner message={message} />
        <ErrorBanner message={error} />
        <button type="button" className="btn-primary btn-block" onClick={handleResend} disabled={loading}>
          {loading ? t("sending") : t("resendVerification")}
        </button>
        <Link className="btn-secondary btn-block" to="/login">
          {t("returnToLogin")}
        </Link>
      </div>
    </AuthLayout>
  );
}
