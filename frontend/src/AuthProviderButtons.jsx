import { api } from "./api.js";
import { oauthPublicStartUrl, providerButtonLabel } from "./ownerOAuthPublicUi.js";

export default function AuthProviderButtons({
  intent,
  legalAcknowledged = false,
  onLegalRequired,
  disabled = false,
}) {
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
        className="btn-oauth btn-oauth-google"
        onClick={() => start("google")}
        disabled={disabled}
      >
        {providerButtonLabel("google")}
      </button>
      <button
        type="button"
        className="btn-oauth btn-oauth-apple"
        onClick={() => start("apple")}
        disabled={disabled}
      >
        {providerButtonLabel("apple")}
      </button>
    </div>
  );
}

export function AuthMethodDivider() {
  return (
    <div className="auth-method-divider" role="presentation">
      <span>or</span>
    </div>
  );
}
