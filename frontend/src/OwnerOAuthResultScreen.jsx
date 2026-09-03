import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "./api.js";
import { AuthLayout, ErrorBanner, LoadingState } from "./components.jsx";
import {
  OAUTH_PUBLIC_RESULT_ACTION,
  oauthPublicResultAction,
  oauthPublicResultMessage,
  providerButtonLabel,
} from "./ownerOAuthPublicUi.js";

export default function OwnerOAuthResultScreen({ provider, onSignedIn }) {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resultCode = (searchParams.get("code") || "").trim();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!resultCode) {
      setError(t("oauth.incomplete"));
      return undefined;
    }

    const action = oauthPublicResultAction(resultCode);
    if (action === OAUTH_PUBLIC_RESULT_ACTION.TWO_FACTOR) {
      navigate("/login?two_factor=1", { replace: true });
      return undefined;
    }
    if (action !== OAUTH_PUBLIC_RESULT_ACTION.ENTER_WORKSPACE) {
      return undefined;
    }

    let cancelled = false;
    async function enterWorkspace() {
      setLoading(true);
      setError("");
      try {
        await api.csrf();
        const result = await api.loadWorkspace(null);
        if (cancelled) return;
        onSignedIn({ workspace: result.data });
        navigate("/dashboard", { replace: true });
      } catch {
        if (cancelled) return;
        setError(t("oauth.sessionLoadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    enterWorkspace();
    return () => {
      cancelled = true;
    };
  }, [resultCode, navigate, onSignedIn, t]);

  if (loading) {
    return (
      <div className="page">
        <LoadingState label={t("oauth.signingIn")} />
      </div>
    );
  }

  const action = oauthPublicResultAction(resultCode);
  if (
    action === OAUTH_PUBLIC_RESULT_ACTION.ENTER_WORKSPACE ||
    action === OAUTH_PUBLIC_RESULT_ACTION.TWO_FACTOR
  ) {
    if (error) {
      return (
        <AuthLayout title={t("oauth.signInTitle")} lead={t("oauth.signInFailedLead")}>
          <ErrorBanner message={error} />
          <div className="auth-provider-buttons auth-provider-buttons-single">
            <Link to="/login" className="btn-primary btn-block">
              {t("backToSignIn")}
            </Link>
          </div>
        </AuthLayout>
      );
    }
    return (
      <div className="page">
        <LoadingState label={t("oauth.signingIn")} />
      </div>
    );
  }

  const message = oauthPublicResultMessage(t, provider, resultCode);
  const providerName = provider === "apple" ? "Apple" : "Google";

  return (
    <AuthLayout
      title={t("oauth.providerTitle", { provider: providerName })}
      lead={t("oauth.providerFailedLead")}
      footnote={
        <p>
          <Link to="/login">{t("backToSignIn")}</Link>
          {" · "}
          <Link to="/register">{t("oauth.createAccount")}</Link>
        </p>
      }
    >
      <ErrorBanner message={message || error || t("oauth.incomplete")} />
      <div className="auth-provider-buttons auth-provider-buttons-single">
        {action === OAUTH_PUBLIC_RESULT_ACTION.SHOW_ERROR_WITH_REGISTER ? (
          <Link to="/register" className="btn-primary btn-block">
            {t("oauth.createAccount")}
          </Link>
        ) : null}
        {action === OAUTH_PUBLIC_RESULT_ACTION.SHOW_ERROR_WITH_LOGIN ? (
          <Link to="/login" className="btn-primary btn-block">
            {t("signIn")}
          </Link>
        ) : null}
        {action === OAUTH_PUBLIC_RESULT_ACTION.SHOW_ERROR ? (
          <>
            <Link to="/login" className="btn-primary btn-block">
              {t("tryAgain")}
            </Link>
            <p className="hint" style={{ textAlign: "center" }}>
              {t("oauth.useProviderHint", { provider: providerButtonLabel(t, provider).toLowerCase() })}
            </p>
          </>
        ) : null}
      </div>
    </AuthLayout>
  );
}
