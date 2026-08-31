"""Google OAuth/OIDC HTTP client for owner sign-in."""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings

from accounts.google_oauth_settings import (
    GOOGLE_OAUTH_AUTHORIZE_URL,
    GOOGLE_OAUTH_ISSUERS,
    GOOGLE_OAUTH_SCOPES,
    GOOGLE_OAUTH_TOKEN_URL,
    google_oauth_client_id,
    google_oauth_client_secret,
)

logger = logging.getLogger("accounts.google_oauth")


class GoogleOAuthClientError(Exception):
    """Raised when Google OAuth/OIDC exchange or verification fails."""


def build_google_authorization_url(*, redirect_uri: str, state: str, nonce: str) -> str:
    params = {
        "client_id": google_oauth_client_id(),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(GOOGLE_OAUTH_SCOPES),
        "state": state,
        "nonce": nonce,
        "prompt": "select_account",
    }
    return f"{GOOGLE_OAUTH_AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"


def exchange_authorization_code(*, redirect_uri: str, code: str) -> dict:
    payload = urllib.parse.urlencode(
        {
            "code": code,
            "client_id": google_oauth_client_id(),
            "client_secret": google_oauth_client_secret(),
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        GOOGLE_OAUTH_TOKEN_URL,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    timeout = getattr(settings, "GOOGLE_OAUTH_HTTP_TIMEOUT_SECONDS", 15)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        logger.warning("Google token exchange failed with HTTP %s", exc.code)
        raise GoogleOAuthClientError("token_exchange_failed") from exc
    except urllib.error.URLError as exc:
        logger.warning("Google token exchange network failure: %s", exc)
        raise GoogleOAuthClientError("token_exchange_failed") from exc

    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise GoogleOAuthClientError("token_exchange_failed") from exc

    id_token = data.get("id_token")
    if not id_token:
        raise GoogleOAuthClientError("missing_id_token")
    return data


def verify_google_id_token(id_token_jwt: str, *, expected_nonce: str) -> dict:
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
    except ImportError as exc:
        raise GoogleOAuthClientError("google_auth_unavailable") from exc

    try:
        claims = id_token.verify_oauth2_token(
            id_token_jwt,
            google_requests.Request(),
            google_oauth_client_id(),
        )
    except ValueError as exc:
        raise GoogleOAuthClientError("invalid_id_token") from exc

    issuer = claims.get("iss")
    if issuer not in GOOGLE_OAUTH_ISSUERS:
        raise GoogleOAuthClientError("invalid_issuer")

    audience = claims.get("aud")
    if audience != google_oauth_client_id():
        raise GoogleOAuthClientError("invalid_audience")

    token_nonce = claims.get("nonce")
    if not expected_nonce or token_nonce != expected_nonce:
        raise GoogleOAuthClientError("invalid_nonce")

    subject = str(claims.get("sub") or "").strip()
    if not subject:
        raise GoogleOAuthClientError("missing_subject")

    return claims
