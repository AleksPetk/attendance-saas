import { useTranslation } from "react-i18next";
import { api } from "./api.js";
import { oauthPublicStartUrl, providerButtonLabel } from "./ownerOAuthPublicUi.js";
import googleG from "./assets/auth/google-g.png";
import appleSignIn from "./assets/auth/apple-sign-in.png";

export default function AuthProviderButtons({
  intent,
  legalAcknowledged = false,
  onLegalRequired,
  disabled = false,
}) {
  const { t } = useTranslation("auth");

  function start(provider) {
    if (disabled) return;
    if (intent === "register" && !legalAcknowledged) {
      onLegalRequired?.();
      return;
    }
    window.location.assign(
      oauthPublicStartUrl(api.baseUrl, provider, intent, {
        legalAcknowledgement: intent === "register" && legalAcknowledged,
      }),
    );
  }

  return (
    <div className="auth-provider-buttons">
      <button
        type="button"
        className="btn-oauth btn-oauth-google has-provider-icon"
        onClick={() => start("google")}
        disabled={disabled}
      >
        <span className="auth-provider-icon-frame auth-provider-icon-frame-google" aria-hidden="true">
          <img
            className="auth-provider-icon auth-provider-icon-google"
            src={googleG}
            alt=""
            width="43"
            height="44"
            aria-hidden="true"
          />
        </span>
        <span>{providerButtonLabel(t, "google")}</span>
      </button>
      <button
        type="button"
        className="btn-oauth btn-oauth-apple has-provider-icon"
        onClick={() => start("apple")}
        disabled={disabled}
      >
        <span className="auth-provider-icon-frame auth-provider-icon-frame-apple" aria-hidden="true">
          <img
            className="auth-provider-icon auth-provider-icon-apple"
            src={appleSignIn}
            alt=""
            width="60"
            height="60"
            aria-hidden="true"
          />
        </span>
        <span>{providerButtonLabel(t, "apple")}</span>
      </button>
    </div>
  );
}

export function AuthMethodDivider() {
  const { t } = useTranslation("auth");
  return (
    <div className="auth-method-divider" role="presentation">
      <span>{t("methodDivider")}</span>
    </div>
  );
}
