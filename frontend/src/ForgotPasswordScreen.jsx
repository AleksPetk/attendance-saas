import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "./api.js";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import { AuthLayout, ErrorBanner, Field, SuccessBanner } from "./components.jsx";
import { useLanguage } from "./i18n/LanguageProvider.jsx";

export default function ForgotPasswordScreen() {
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
      const result = await api.forgotPassword({ email, locale });
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
      title={t("forgotPassword.title")}
      lead={t("forgotPassword.lead")}
      footnote={
        <p>
          {t("forgotPassword.remembered")}{" "}
          <Link to="/login">{t("forgotPassword.backToLogin")}</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <Field label={t("fields.email")}>
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
          {loading ? t("sending") : t("sendResetLink")}
        </button>
      </form>
    </AuthLayout>
  );
}
