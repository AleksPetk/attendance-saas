import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "./api.js";
import { builtinTrialOfferFromCatalog } from "./builtinTrialOffer.js";
import { AuthLayout, ErrorBanner, Field, PasswordInput, usePasswordVisibility } from "./components.jsx";
import PromoHostLink from "./PromoHostLink.jsx";
import RegistrationLegalViewer from "./RegistrationLegalViewer.jsx";
import AuthProviderButtons, { AuthMethodDivider } from "./AuthProviderButtons.jsx";
import { REGISTRATION_LEGAL_REQUIRED_MESSAGE_KEY } from "./ownerOAuthPublicUi.js";
import { WorkspaceLanguageMenu } from "./i18n/LanguageSwitcher.jsx";
import { useLanguage } from "./i18n/LanguageProvider.jsx";

const LEGAL_DOCUMENTS = {
  terms: "terms-of-use",
  privacy: "privacy-policy",
};

const FALLBACK_TRIAL_CATALOG = {
  builtin_trial_days: 7,
  builtin_trial_offered: true,
};

function firstFieldError(error, name) {
  const value = error?.data?.[name];
  if (Array.isArray(value)) return value.join(" ");
  return typeof value === "string" ? value : "";
}

function RegistrationVisual({ trialOffer }) {
  const { t } = useTranslation("auth");
  const benefits = [
    { key: "setup", label: t("register.visual.benefits.setup") },
    { key: "groups", label: t("register.visual.benefits.groups") },
    { key: "devices", label: t("register.visual.benefits.devices") },
  ];
  const flow = [
    { key: "members", label: t("register.visual.flow.members") },
    { key: "groups", label: t("register.visual.flow.groups") },
    { key: "kiosk", label: t("register.visual.flow.kiosk") },
    { key: "history", label: t("register.visual.flow.history") },
  ];
  const days = trialOffer?.days || FALLBACK_TRIAL_CATALOG.builtin_trial_days;

  return (
    <div className="registration-visual-content">
      <PromoHostLink to="/" className="registration-brand">CheckStation</PromoHostLink>
      <div className="registration-visual-copy">
        <span className="registration-eyebrow">{t("register.visual.eyebrow")}</span>
        <h2>{t("register.visual.headline")}</h2>
        <ul className="registration-benefits">
          {benefits.map((benefit) => (
            <li key={benefit.key}><span aria-hidden="true">✓</span>{benefit.label}</li>
          ))}
        </ul>
      </div>
      <div className="registration-flow" aria-label={t("register.visual.flowAriaLabel")}>
        {flow.map((step, index) => (
          <div className="registration-flow-step" key={step.key}>
            <span className="registration-flow-node">{step.label}</span>
            {index < flow.length - 1 ? <span className="registration-flow-line" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
      {trialOffer?.offered ? (
        <div className="registration-free-copy">
          <strong>{t("register.visual.trialHeadline")}</strong>
          <span>{t("register.visual.trialBody", { days })}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function RegisterScreen() {
  const { t } = useTranslation("auth");
  const { locale } = useLanguage();
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
  const [trialCatalog, setTrialCatalog] = useState(FALLBACK_TRIAL_CATALOG);
  const trialOffer = builtinTrialOfferFromCatalog(trialCatalog);

  useEffect(() => {
    let cancelled = false;
    async function loadTrialCatalog() {
      try {
        const result = await api.getBillingCatalog();
        if (!cancelled && result?.data) {
          setTrialCatalog({
            ...FALLBACK_TRIAL_CATALOG,
            ...result.data,
          });
        }
      } catch {
        /* keep fallback */
      }
    }
    loadTrialCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

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
        if (!cancelled) setLegalError(errorMessage(err) || t("register.documentLoadError"));
      })
      .finally(() => {
        if (!cancelled) setLegalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [legalSlug, legalReload, t]);

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
        locale,
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
        title={t("register.title")}
        headerAction={<WorkspaceLanguageMenu />}
        visualContent={<RegistrationVisual trialOffer={trialOffer} />}
        footnote={
          <p>
            {t("register.alreadyHave")}{" "}
            <Link to="/login">{t("signIn")}</Link>
          </p>
        }
      >
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-fields">
            <Field label={t("fields.email")} error={fieldErrors.email}>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </Field>
            <Field label={t("fields.password")} error={fieldErrors.password}>
              <PasswordInput
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="new-password"
                visible={pairVisibility.visible}
                onVisibleChange={pairVisibility.setVisible}
              />
            </Field>
            <Field label={t("fields.confirmPassword")} error={fieldErrors.passwordConfirm}>
              <PasswordInput
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                required
                autoComplete="new-password"
                visible={pairVisibility.visible}
                showToggle={false}
              />
            </Field>
            <Field label={t("fields.firstNameOptional")}>
              <input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
            </Field>
            <Field label={t("fields.lastNameOptional")}>
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
                {t("register.legalAgree")}{" "}
                <button type="button" onClick={() => openLegalDocument(LEGAL_DOCUMENTS.terms)}>{t("register.termsOfUse")}</button>{" "}
                {t("register.legalAcknowledge")}{" "}
                <button type="button" onClick={() => openLegalDocument(LEGAL_DOCUMENTS.privacy)}>{t("register.privacyPolicy")}</button>
              </span>
            </div>
            {fieldErrors.legalAcknowledgement ? (
              <span className="field-error">{fieldErrors.legalAcknowledgement}</span>
            ) : null}
          </div>

          <ErrorBanner message={error} />
          <button type="submit" className="btn-primary btn-block" disabled={loading || !legalAcknowledgement}>
            {loading ? t("creatingAccount") : t("createAccount")}
          </button>
          <AuthMethodDivider />
          <AuthProviderButtons
            intent="register"
            legalAcknowledged={legalAcknowledgement}
            disabled={loading}
            onLegalRequired={() => {
              setFieldErrors((current) => ({
                ...current,
                legalAcknowledgement: t(REGISTRATION_LEGAL_REQUIRED_MESSAGE_KEY),
              }));
            }}
          />
          <p className="hint" style={{ textAlign: "center" }}>
            {t("register.verifyHint")}
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
