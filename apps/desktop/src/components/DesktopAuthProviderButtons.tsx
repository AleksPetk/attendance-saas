import googleG from "../assets/auth/google-g.png";
import appleSignIn from "../assets/auth/apple-sign-in.png";
import { useApp } from "../lib/AppProvider";
import {
  desktopAppleAuthMode,
  resolveDesktopDistribution,
} from "../lib/desktopDistribution";

export type DesktopGoogleAuthIntent = "login" | "register";

type Props = {
  footnote?: boolean;
  intent?: DesktopGoogleAuthIntent;
  /** Register flow must pass legal acknowledgement before Google/Apple register. */
  legalAcknowledgement?: boolean;
  busy?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onError?: (message: string) => void;
  onGoogleResult?: (result: { kind: "authenticated" | "two_factor_required" }) => void;
  onAppleResult?: (result: { kind: "authenticated" | "two_factor_required" }) => void;
};

function appleResultMessage(
  t: (key: string, vars?: Record<string, string | number>) => string,
  resultCode: string,
): string {
  switch (resultCode) {
    case "no_account":
      return t("auth.appleNoAccount");
    case "existing_account_connect_required":
      return t("auth.appleExistingAccount");
    case "email_not_verified":
      return t("auth.appleEmailNotVerified");
    case "email_missing":
      return t("auth.appleEmailMissing");
    case "legal_acknowledgement_required":
      return t("auth.legalRequired");
    case "oauth_not_configured":
      return t("auth.appleUnavailable");
    default:
      return t("auth.appleFailed");
  }
}

/**
 * OAuth provider buttons matching Browser Workspace / Desktop Login.
 * Google: system-browser PKCE → AuthController.completeGoogleNative.
 * Apple DIRECT: system-browser web OAuth → desktop handoff → session.
 * Apple MAS: ASAuthorization → AuthController.completeAppleNative.
 */
export function DesktopAuthProviderButtons({
  footnote = true,
  intent = "login",
  legalAcknowledgement = false,
  busy = false,
  onBusyChange,
  onError,
  onGoogleResult,
  onAppleResult,
}: Props) {
  const { auth, t } = useApp();
  const distribution = resolveDesktopDistribution();
  const appleMode = desktopAppleAuthMode(distribution);
  const appleEnabled = appleMode === "web_compatible" || appleMode === "native";

  async function onGoogleClick() {
    if (busy) return;
    if (intent === "register" && !legalAcknowledgement) {
      onError?.(t("auth.legalRequired"));
      return;
    }

    const bridge = window.checkstationDesktop;
    if (!bridge?.requestGoogleIdentityToken) {
      onError?.(t("auth.googleUnavailable"));
      return;
    }

    onBusyChange?.(true);
    onError?.("");
    try {
      const configured = bridge.isGoogleOAuthConfigured
        ? await bridge.isGoogleOAuthConfigured()
        : true;
      if (!configured) {
        onError?.(t("auth.googleMisconfigured"));
        return;
      }

      const google = await bridge.requestGoogleIdentityToken();
      if (google.kind === "cancelled") return;
      if (google.kind === "misconfigured") {
        onError?.(t("auth.googleMisconfigured"));
        return;
      }
      if (google.kind === "missing_token") {
        onError?.(t("auth.googleMissingToken"));
        return;
      }
      if (google.kind === "error") {
        onError?.(t("auth.googleFailed"));
        return;
      }

      const result = await auth.completeGoogleNative({
        identityToken: google.identityToken,
        intent,
        legalAcknowledgement: intent === "register" ? legalAcknowledgement : false,
      });
      onGoogleResult?.(result);
    } catch (caught) {
      onError?.(caught instanceof Error ? caught.message : t("auth.googleFailed"));
    } finally {
      onBusyChange?.(false);
    }
  }

  async function onAppleDirectClick() {
    const bridge = window.checkstationDesktop;
    if (!bridge?.requestAppleWebOAuth) {
      onError?.(t("auth.appleUnavailable"));
      return;
    }
    const apple = await bridge.requestAppleWebOAuth({
      intent,
      legalAcknowledgement: intent === "register" ? legalAcknowledgement : false,
    });
    if (apple.kind === "unavailable") {
      onError?.(t("auth.appleUnavailable"));
      return;
    }
    if (apple.kind === "error") {
      onError?.(apple.message || t("auth.appleFailed"));
      return;
    }
    if (apple.kind === "failed") {
      onError?.(appleResultMessage(t, apple.resultCode || ""));
      return;
    }
    if (apple.kind !== "success" || !apple.handoff) {
      onError?.(t("auth.appleFailed"));
      return;
    }
    const result = await auth.completeDesktopAuthHandoff({ handoff: apple.handoff });
    onAppleResult?.(result);
  }

  async function onAppleMasClick() {
    const bridge = window.checkstationDesktop;
    if (!bridge?.requestAppleNativeSignIn) {
      onError?.(t("auth.appleUnavailable"));
      return;
    }
    const apple = await bridge.requestAppleNativeSignIn();
    if (apple.kind === "cancelled") return;
    if (apple.kind === "unavailable" || apple.kind === "signing_required") {
      onError?.(t("auth.appleSigningRequired"));
      return;
    }
    if (apple.kind === "missing_token") {
      onError?.(t("auth.appleMissingToken"));
      return;
    }
    if (apple.kind === "error") {
      onError?.(apple.message || t("auth.appleFailed"));
      return;
    }
    if (apple.kind !== "success" || !apple.identityToken || !apple.nonce) {
      onError?.(t("auth.appleFailed"));
      return;
    }
    const result = await auth.completeAppleNative({
      identityToken: apple.identityToken,
      nonce: apple.nonce,
      intent,
      legalAcknowledgement: intent === "register" ? legalAcknowledgement : false,
      fullName: apple.fullName || null,
    });
    onAppleResult?.(result);
  }

  async function onAppleClick() {
    if (busy || !appleEnabled) return;
    if (intent === "register" && !legalAcknowledgement) {
      onError?.(t("auth.legalRequired"));
      return;
    }

    onBusyChange?.(true);
    onError?.("");
    try {
      if (appleMode === "native") {
        await onAppleMasClick();
      } else {
        await onAppleDirectClick();
      }
    } catch (caught) {
      onError?.(caught instanceof Error ? caught.message : t("auth.appleFailed"));
    } finally {
      onBusyChange?.(false);
    }
  }

  return (
    <>
      <div className="auth-provider-buttons">
        <button
          type="button"
          className="btn-oauth btn-oauth-google has-provider-icon"
          disabled={busy}
          onClick={() => void onGoogleClick()}
        >
          <span className="auth-provider-icon-frame auth-provider-icon-frame-google" aria-hidden="true">
            <img
              className="auth-provider-icon auth-provider-icon-google"
              src={googleG}
              alt=""
              width={43}
              height={44}
            />
          </span>
          <span>{t("auth.continueGoogle")}</span>
        </button>
        <button
          type="button"
          className="btn-oauth btn-oauth-apple has-provider-icon"
          disabled={busy || !appleEnabled}
          title={appleEnabled ? undefined : t("auth.appleComingBody")}
          onClick={appleEnabled ? () => void onAppleClick() : undefined}
        >
          <span className="auth-provider-icon-frame auth-provider-icon-frame-apple" aria-hidden="true">
            <img
              className="auth-provider-icon auth-provider-icon-apple"
              src={appleSignIn}
              alt=""
              width={60}
              height={60}
            />
          </span>
          <span>{t("auth.continueApple")}</span>
        </button>
      </div>
      {footnote && !appleEnabled ? <p className="auth-footnote">{t("auth.appleComingBody")}</p> : null}
    </>
  );
}
