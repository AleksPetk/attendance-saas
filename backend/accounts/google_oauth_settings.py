"""Google OAuth configuration helpers for owner sign-in."""

from django.conf import settings
from django.urls import reverse


GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_OAUTH_ISSUERS = frozenset({"accounts.google.com", "https://accounts.google.com"})
GOOGLE_OAUTH_SCOPES = ("openid", "email", "profile")


def google_oauth_client_id() -> str:
    return getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "").strip()


def google_oauth_client_secret() -> str:
    return getattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "").strip()


def google_oauth_is_configured() -> bool:
    return bool(google_oauth_client_id() and google_oauth_client_secret())


def google_oauth_state_ttl_seconds() -> int:
    return int(getattr(settings, "GOOGLE_OAUTH_STATE_TTL_SECONDS", 600))


def google_oauth_callback_path() -> str:
    return reverse("google-oauth-callback")


def google_oauth_redirect_uri(request) -> str:
    override = getattr(settings, "GOOGLE_OAUTH_REDIRECT_URI", "").strip()
    if override:
        return override
    return request.build_absolute_uri(google_oauth_callback_path())


def google_oauth_frontend_result_url(result_code: str) -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return f"{base}/auth/google/result?code={result_code}"


def google_oauth_account_security_result_url(result_code: str) -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return f"{base}/account/security?oauth=google&result={result_code}"
