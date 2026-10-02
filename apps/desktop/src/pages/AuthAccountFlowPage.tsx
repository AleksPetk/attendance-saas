import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { AuthLayout } from "../components/AuthLayout";
import { DesktopAuthProviderButtons } from "../components/DesktopAuthProviderButtons";
import { DesktopLegalDocumentModal } from "../components/DesktopLegalDocumentModal";
import {
  builtinTrialOfferFromCatalog,
  RegistrationVisual,
  type BuiltinTrialOffer,
} from "../components/RegistrationVisual";
import { Alert, Button, Field, Input } from "../components/ui";
import { useApp } from "../lib/AppProvider";
import { LEGAL_DOCUMENTS } from "../lib/legalDocuments";

const FALLBACK_TRIAL_CATALOG = { builtin_trial_days: 7, builtin_trial_offered: false };

export function AuthAccountFlowPage() {
  const { pathname } = useLocation();
  const { api, locale, t } = useApp();
  const register = pathname === "/register";
  const recover = pathname === "/recover-account";
  const [values, setValues] = useState({ email: "", password: "", confirm: "", first: "", last: "" });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [legalSlug, setLegalSlug] = useState<string | null>(null);
  const [trialOffer, setTrialOffer] = useState<BuiltinTrialOffer>({ offered: false, days: 0 });
  const set = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!register) return undefined;
    let cancelled = false;
    void api
      .get<{ builtin_trial_offered?: boolean; builtin_trial_days?: number }>(endpoints.billingCatalog(), {
        credentials: false,
      })
      .then((catalog) => {
        if (!cancelled) setTrialOffer(builtinTrialOfferFromCatalog({ ...FALLBACK_TRIAL_CATALOG, ...catalog }));
      })
      .catch(() => {
        if (!cancelled) setTrialOffer(builtinTrialOfferFromCatalog(FALLBACK_TRIAL_CATALOG));
      });
    return () => {
      cancelled = true;
    };
  }, [api, register]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setFields({});
    try {
      if (register) {
        if (!accepted) {
          setError(t("auth.legalRequired"));
          return;
        }
        const result = await api.post<{ detail?: string }>(endpoints.register(), {
          email: values.email.trim(),
          password: values.password,
          password_confirm: values.confirm,
          first_name: values.first.trim(),
          last_name: values.last.trim(),
          legal_acknowledgement: true,
          locale,
        });
        setMessage(result.detail || t("auth.registrationVerifyHint"));
      } else {
        const result = await api.post<{ detail?: string }>(
          recover ? endpoints.recoverAccountStart() : endpoints.forgotPassword(),
          { email: values.email.trim(), locale },
        );
        setMessage(result.detail || t(recover ? "auth.recoverySent" : "auth.resetSent"));
      }
    } catch (caught) {
      if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data));
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const title = t(register ? "auth.registerTitle" : recover ? "auth.recoverTitle" : "auth.forgotTitle");
  const lead = t(register ? "auth.registerLead" : recover ? "auth.recoverLead" : "auth.forgotLead");
  const footnote = register ? (
    <>
      <span>{t("auth.alreadyAccount")} </span>
      <Link to="/sign-in">{t("auth.signIn")}</Link>
    </>
  ) : (
    <>
      <Link to="/sign-in">{t("auth.backToSignIn")}</Link>
      {" · "}
      <Link to="/email-link">{t("accountLink.open")}</Link>
    </>
  );

  return (
    <AuthLayout
      title={title}
      lead={lead}
      footnote={footnote}
      visualContent={register ? <RegistrationVisual trialOffer={trialOffer} /> : undefined}
    >
      <form className="form" onSubmit={submit}>
        <Field error={fields.email} label={t(recover ? "auth.backupEmail" : "auth.email")}>
          <Input
            autoComplete="email"
            autoFocus
            onChange={(event) => set("email", event.target.value)}
            required
            type="email"
            value={values.email}
          />
        </Field>
        {register ? (
          <>
            <div className="form-grid">
              <Field label={t("auth.firstNameOptional")}>
                <Input
                  autoComplete="given-name"
                  onChange={(event) => set("first", event.target.value)}
                  value={values.first}
                />
              </Field>
              <Field label={t("auth.lastNameOptional")}>
                <Input
                  autoComplete="family-name"
                  onChange={(event) => set("last", event.target.value)}
                  value={values.last}
                />
              </Field>
            </div>
            <Field error={fields.password} label={t("auth.password")}>
              <Input
                autoComplete="new-password"
                onChange={(event) => set("password", event.target.value)}
                required
                type="password"
                value={values.password}
              />
            </Field>
            <Field error={fields.password_confirm} label={t("auth.confirmPassword")}>
              <Input
                autoComplete="new-password"
                onChange={(event) => set("confirm", event.target.value)}
                required
                type="password"
                value={values.confirm}
              />
            </Field>
            <div className="registration-legal-field">
              <label className="check-row registration-legal-consent">
                <input
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  {t("auth.legalAgree")}{" "}
                  <button
                    type="button"
                    className="registration-legal-link"
                    onClick={() => setLegalSlug(LEGAL_DOCUMENTS.terms)}
                  >
                    {t("auth.terms")}
                  </button>{" "}
                  {t("auth.legalAcknowledge")}{" "}
                  <button
                    type="button"
                    className="registration-legal-link"
                    onClick={() => setLegalSlug(LEGAL_DOCUMENTS.privacy)}
                  >
                    {t("auth.privacy")}
                  </button>
                  .
                </span>
              </label>
            </div>
          </>
        ) : null}
        <Alert tone="success">{message}</Alert>
        <Alert>{error}</Alert>
        <Button loading={busy} type="submit">
          {t(register ? "auth.createAccount" : recover ? "auth.sendRecoveryLink" : "auth.sendResetLink")}
        </Button>
        {register ? (
          <>
            <div className="divider">{t("auth.or")}</div>
            <DesktopAuthProviderButtons
              intent="register"
              legalAcknowledgement={accepted}
              busy={busy}
              onBusyChange={setBusy}
              onError={setError}
              onGoogleResult={() => {
                setMessage("");
                /* AuthController updates authState for authenticated / 2FA. */
              }}
            />
          </>
        ) : null}
        {!register ? (
          <div className="auth-links">
            <Link to={recover ? "/forgot-password" : "/recover-account"}>
              {t(recover ? "auth.forgotPassword" : "auth.recoverAccount")}
            </Link>
          </div>
        ) : null}
      </form>
      {register ? (
        <DesktopLegalDocumentModal
          slug={legalSlug}
          onClose={() => setLegalSlug(null)}
          onOpenSlug={setLegalSlug}
        />
      ) : null}
    </AuthLayout>
  );
}
