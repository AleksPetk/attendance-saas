import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import { AuthLayout, ErrorBanner, Field, PasswordInput, usePasswordVisibility } from "./components.jsx";

export default function RegisterScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const pairVisibility = usePasswordVisibility();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.csrf();
      const result = await api.registerOwner({
        email,
        password,
        password_confirm: passwordConfirm,
        first_name: firstName,
        last_name: lastName,
      });
      navigate("/check-email", {
        replace: true,
        state: {
          email: result.data.email || email,
          verificationEmailSent: Boolean(result.data.verification_email_sent),
          detail: result.data.detail,
        },
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create account"
      lead="Register as the workspace owner. We’ll email you a verification link before you can use Check Station."
      footnote={
        <p>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="auth-fields">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              visible={pairVisibility.visible}
              onVisibleChange={pairVisibility.setVisible}
            />
          </Field>
          <Field label="Confirm password">
            <PasswordInput
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              autoComplete="new-password"
              visible={pairVisibility.visible}
              showToggle={false}
            />
          </Field>
          <div className="password-requirements">
            <strong>Password requirements</strong>
            <ul>
              <li>Must match confirmation field</li>
              <li>Follow any server-side validation shown below</li>
            </ul>
          </div>
          <Field label="First name (optional)">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
          </Field>
          <Field label="Last name (optional)">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
          </Field>
        </div>
        <ErrorBanner message={error} />
        <button type="submit" className="btn-primary btn-block" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>
        <p className="hint" style={{ textAlign: "center" }}>
          Your workspace is created automatically. Email verification is required before sign-in.
        </p>
      </form>
    </AuthLayout>
  );
}
