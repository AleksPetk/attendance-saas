import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "./api.js";
import { AuthLayout, ErrorBanner, LoadingState } from "./components.jsx";
import {
  OAUTH_PUBLIC_RESULT_ACTION,
  oauthPublicResultAction,
  oauthPublicResultMessage,
  providerButtonLabel,
} from "./ownerOAuthPublicUi.js";

export default function OwnerOAuthResultScreen({ provider, onSignedIn }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resultCode = (searchParams.get("code") || "").trim();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!resultCode) {
      setError("Sign-in could not be completed. Try again.");
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
        setError("Your session could not be loaded. Try signing in again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    enterWorkspace();
    return () => {
      cancelled = true;
    };
  }, [resultCode, navigate, onSignedIn]);

  if (loading) {
    return (
      <div className="page">
        <LoadingState label="Signing you in…" />
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
        <AuthLayout title="Sign-in" lead="We could not finish signing you in.">
          <ErrorBanner message={error} />
          <div className="auth-provider-buttons auth-provider-buttons-single">
            <Link to="/login" className="btn-primary btn-block">
              Back to sign in
            </Link>
          </div>
        </AuthLayout>
      );
    }
    return (
      <div className="page">
        <LoadingState label="Signing you in…" />
      </div>
    );
  }

  const message = oauthPublicResultMessage(provider, resultCode);
  const providerName = provider === "apple" ? "Apple" : "Google";

  return (
    <AuthLayout
      title={`${providerName} sign-in`}
      lead="We could not complete sign-in with your provider."
      footnote={
        <p>
          <Link to="/login">Back to sign in</Link>
          {" · "}
          <Link to="/register">Create account</Link>
        </p>
      }
    >
      <ErrorBanner message={message || error || "Sign-in could not be completed. Try again."} />
      <div className="auth-provider-buttons auth-provider-buttons-single">
        {action === OAUTH_PUBLIC_RESULT_ACTION.SHOW_ERROR_WITH_REGISTER ? (
          <Link to="/register" className="btn-primary btn-block">
            Create account
          </Link>
        ) : null}
        {action === OAUTH_PUBLIC_RESULT_ACTION.SHOW_ERROR_WITH_LOGIN ? (
          <Link to="/login" className="btn-primary btn-block">
            Sign in
          </Link>
        ) : null}
        {action === OAUTH_PUBLIC_RESULT_ACTION.SHOW_ERROR ? (
          <>
            <Link to="/login" className="btn-primary btn-block">
              Try again
            </Link>
            <p className="hint" style={{ textAlign: "center" }}>
              You can also use {providerButtonLabel(provider).toLowerCase()} from the sign-in page.
            </p>
          </>
        ) : null}
      </div>
    </AuthLayout>
  );
}
