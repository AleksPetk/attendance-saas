import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import { AuthLayout, ErrorBanner, Field, PasswordInput, usePasswordVisibility } from "./components.jsx";
import RegistrationLegalViewer from "./RegistrationLegalViewer.jsx";
import AuthProviderButtons, { AuthMethodDivider } from "./AuthProviderButtons.jsx";
import { REGISTRATION_LEGAL_REQUIRED_MESSAGE } from "./ownerOAuthPublicUi.js";

const LEGAL_DOCUMENTS = {
  terms: "terms-of-use",
  privacy: "privacy-policy",
};

function firstFieldError(error, name) {
  const value = error?.data?.[name];
  if (Array.isArray(value)) return value.join(" ");
  return typeof value === "string" ? value : "";
}

function RegistrationVisual() {
  const benefits = ["Set up in minutes", "Customize every Group", "Run attendance from any device"];
  const flow = ["People", "Groups", "Kiosk", "History"];

  return (
    <div className="registration-visual-content">
      <Link to="/" className="registration-brand">CheckStation</Link>
      <div className="registration-visual-copy">
        <span className="registration-eyebrow">Attendance that fits your workspace</span>
        <h2>One workspace. Your attendance, your way.</h2>
        <ul className="registration-benefits">
          {benefits.map((benefit) => (
            <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>
          ))}
        </ul>
      </div>
      <div className="registration-flow" aria-label="People connect to Groups, Kiosk, and History">
        {flow.map((step, index) => (
          <div className="registration-flow-step" key={step}>
            <span className="registration-flow-node">{step}</span>
            {index < flow.length - 1 ? <span className="registration-flow-line" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
      <div className="registration-free-copy">
        <strong>Start free. No card required.</strong>
        <span>Business features free for 7 days.</span>
      </div>
    </div>
  );
}

export default function RegisterScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const pairVisibility = usePasswordVisibility();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [legalAcknowledgement, setLegalAcknowledgement] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [legalSlug, setLegalSlug] = useState("");
  const [legalDocument, setLegalDocument] = useState(null);
  const [legalLoading, setLegalLoading] = useState(false);
  const [legalError, setLegalError] = useState("");
  const [legalReload, setLegalReload] = useState(0);

  useEffect(() => {
    if (!legalSlug) return undefined;
    let cancelled = false;
    setLegalLoading(true);
    setLegalError("");
    setLegalDocument(null);
    api.getContentDocument(legalSlug)
      .then((result) => {
        if (!cancelled) setLegalDocument(result.data);
      })
      .catch((err) => {
        if (!cancelled) setLegalError(errorMessage(err) || "This document could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLegalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [legalSlug, legalReload]);

  function openLegalDocument(slug) {
    setLegalSlug(slug);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setFieldErrors({});

    try {
      await api.csrf();
      const result = await api.registerOwner({
        email,
        password,
        password_confirm: passwordConfirm,
        first_name: firstName,
        last_name: lastName,
        legal_acknowledgement: legalAcknowledgement,
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
      const nextFieldErrors = {
        email: firstFieldError(err, "email"),
        password: firstFieldError(err, "password"),
        passwordConfirm: firstFieldError(err, "password_confirm"),
        legalAcknowledgement: firstFieldError(err, "legal_acknowledgement"),
      };
      setFieldErrors(nextFieldErrors);
      if (!Object.values(nextFieldErrors).some(Boolean)) setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AuthLayout
        variant="register"
        title="Create account"
        lead="Register as the workspace owner. We’ll email you a verification link before you can use CheckStation."
        visualContent={<RegistrationVisual />}
        footnote={
          <p>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        }
      >
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-fields">
            <Field label="Email" error={fieldErrors.email}>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </Field>
            <Field label="Password" error={fieldErrors.password}>
              <PasswordInput
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="new-password"
                visible={pairVisibility.visible}
                onVisibleChange={pairVisibility.setVisible}
              />
            </Field>
            <Field label="Confirm password" error={fieldErrors.passwordConfirm}>
              <PasswordInput
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                required
                autoComplete="new-password"
                visible={pairVisibility.visible}
                showToggle={false}
              />
            </Field>
            <Field label="First name (optional)">
              <input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
            </Field>
            <Field label="Last name (optional)">
              <input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
            </Field>
          </div>

          <div className="registration-legal-field">
            <div className="registration-legal-consent">
              <input
                type="checkbox"
                aria-describedby="registration-legal-consent-copy"
                checked={legalAcknowledgement}
                onChange={(event) => {
                  setLegalAcknowledgement(event.target.checked);
                  setFieldErrors((current) => ({ ...current, legalAcknowledgement: "" }));
                }}
                required
              />
              <span id="registration-legal-consent-copy">
                I agree to the{" "}
                <button type="button" onClick={() => openLegalDocument(LEGAL_DOCUMENTS.terms)}>Terms of Use</button>{" "}
                and acknowledge the{" "}
                <button type="button" onClick={() => openLegalDocument(LEGAL_DOCUMENTS.privacy)}>Privacy Policy</button>.
              </span>
            </div>
            {fieldErrors.legalAcknowledgement ? (
              <span className="field-error">{fieldErrors.legalAcknowledgement}</span>
            ) : null}
          </div>

          <ErrorBanner message={error} />
          <button type="submit" className="btn-primary btn-block" disabled={loading || !legalAcknowledgement}>
            {loading ? "Creating account…" : "Create account"}
          </button>
          <AuthMethodDivider />
          <AuthProviderButtons
            intent="register"
            legalAcknowledged={legalAcknowledgement}
            disabled={loading}
            onLegalRequired={() => {
              setFieldErrors((current) => ({
                ...current,
                legalAcknowledgement: REGISTRATION_LEGAL_REQUIRED_MESSAGE,
              }));
            }}
          />
          <p className="hint" style={{ textAlign: "center" }}>
            Verify your email to create your workspace and start your free Business trial.
          </p>
        </form>
      </AuthLayout>

      {legalSlug ? (
        <RegistrationLegalViewer
          document={legalDocument}
          loading={legalLoading}
          error={legalError}
          onClose={() => setLegalSlug("")}
          onRetry={() => setLegalReload((value) => value + 1)}
          onDocumentNavigate={openLegalDocument}
        />
      ) : null}
    </>
  );
}
