import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "./api.js";
import { AuthLayout, ErrorBanner, Field, PasswordInput, usePasswordVisibility } from "./components.jsx";

function fieldError(error, name) {
  const value = error?.data?.[name];
  if (Array.isArray(value) && value.length) return value[0];
  if (typeof value === "string") return value;
  return "";
}

export default function ResetPasswordScreen() {
  const { t } = useTranslation("auth");
  const { uid, token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const pairVisibility = usePasswordVisibility();
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setPasswordError("");
    try {
      await api.csrf();
      await api.resetPassword({
        uid,
        token,
        password,
        password_confirm: passwordConfirm,
      });
      setPassword("");
      setPasswordConfirm("");
      navigate("/login?reset=1", { replace: true });
    } catch (err) {
      const nextPasswordError = fieldError(err, "password") || fieldError(err, "password_confirm");
      if (nextPasswordError) {
        setPasswordError(nextPasswordError);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={t("resetPassword.title")}
      lead={t("resetPassword.lead")}
      footnote={
        <p>
          <Link to="/forgot-password">{t("resetPassword.requestNew")}</Link>
          {" · "}
          <Link to="/login">{t("resetPassword.backToLogin")}</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="auth-fields">
          <Field label={t("fields.newPassword")} error={passwordError}>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              visible={pairVisibility.visible}
              onVisibleChange={pairVisibility.setVisible}
            />
          </Field>
          <Field label={t("fields.confirmNewPassword")}>
            <PasswordInput
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              autoComplete="new-password"
              visible={pairVisibility.visible}
              showToggle={false}
            />
          </Field>
        </div>
        <ErrorBanner message={error} />
        <button type="submit" className="btn-primary btn-block" disabled={loading}>
          {loading ? t("updating") : t("updatePassword")}
        </button>
      </form>
    </AuthLayout>
  );
}
