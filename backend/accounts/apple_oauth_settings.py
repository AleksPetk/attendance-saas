"""Apple OAuth configuration helpers for owner sign-in."""

from django.conf import settings
from django.urls import reverse


APPLE_OAUTH_AUTHORIZE_URL = "https://appleid.apple.com/auth/authorize"
APPLE_OAUTH_TOKEN_URL = "https://appleid.apple.com/auth/token"
APPLE_OAUTH_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_OAUTH_ISSUER = "https://appleid.apple.com"
APPLE_OAUTH_AUDIENCE = "https://appleid.apple.com"
APPLE_OAUTH_SCOPES = ("name", "email")


def apple_oauth_client_id() -> str:
    return getattr(settings, "APPLE_OAUTH_CLIENT_ID", "").strip()


def apple_oauth_team_id() -> str:
    return getattr(settings, "APPLE_OAUTH_TEAM_ID", "").strip()


def apple_oauth_key_id() -> str:
    return getattr(settings, "APPLE_OAUTH_KEY_ID", "").strip()


def apple_oauth_private_key_pem() -> str:
    raw = getattr(settings, "APPLE_OAUTH_PRIVATE_KEY", "") or ""
    return raw.replace("\\n", "\n").strip()


def apple_oauth_is_configured() -> bool:
    return bool(
        apple_oauth_client_id()
        and apple_oauth_team_id()
        and apple_oauth_key_id()
        and apple_oauth_private_key_pem()
    )


def apple_oauth_state_ttl_seconds() -> int:
    return int(getattr(settings, "APPLE_OAUTH_STATE_TTL_SECONDS", 600))


def apple_oauth_callback_path() -> str:
    return reverse("apple-oauth-callback")


def apple_oauth_redirect_uri(request) -> str:
    override = getattr(settings, "APPLE_OAUTH_REDIRECT_URI", "").strip()
    if override:
        return override
    return request.build_absolute_uri(apple_oauth_callback_path())


def apple_oauth_frontend_result_url(result_code: str) -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return f"{base}/auth/apple/result?code={result_code}"


def apple_oauth_account_security_result_url(result_code: str) -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return f"{base}/account/security?oauth=apple&result={result_code}"
