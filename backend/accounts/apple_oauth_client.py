"""Apple OAuth/OIDC HTTP client for owner sign-in."""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings

from accounts.apple_oauth_settings import (
    APPLE_OAUTH_AUDIENCE,
    APPLE_OAUTH_AUTHORIZE_URL,
    APPLE_OAUTH_ISSUER,
    APPLE_OAUTH_JWKS_URL,
    APPLE_OAUTH_SCOPES,
    APPLE_OAUTH_TOKEN_URL,
    apple_oauth_client_id,
    apple_oauth_key_id,
    apple_oauth_private_key_pem,
    apple_oauth_team_id,
)

logger = logging.getLogger("accounts.apple_oauth")

_jwks_client = None


class AppleOAuthClientError(Exception):
    """Raised when Apple OAuth/OIDC exchange or verification fails."""


def _http_timeout_seconds() -> int:
    return int(getattr(settings, "APPLE_OAUTH_HTTP_TIMEOUT_SECONDS", 15))


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        try:
            import jwt
        except ImportError as exc:
            raise AppleOAuthClientError("pyjwt_unavailable") from exc
        _jwks_client = jwt.PyJWKClient(APPLE_OAUTH_JWKS_URL)
    return _jwks_client


def generate_apple_client_secret() -> str:
    """
    Build a short-lived ES256 client secret JWT for Apple's token endpoint.

    Apple requires issuer=Team ID, subject=Services ID, audience=appleid.apple.com.
    """
    try:
        import jwt
        from cryptography.hazmat.primitives import serialization
    except ImportError as exc:
        raise AppleOAuthClientError("pyjwt_unavailable") from exc

    pem = apple_oauth_private_key_pem()
    if not pem:
        raise AppleOAuthClientError("missing_private_key")

    try:
        private_key = serialization.load_pem_private_key(pem.encode("utf-8"), password=None)
    except ValueError as exc:
        raise AppleOAuthClientError("invalid_private_key") from exc

    now = int(time.time())
    claims = {
        "iss": apple_oauth_team_id(),
        "iat": now,
        "exp": now + 300,
        "aud": APPLE_OAUTH_AUDIENCE,
        "sub": apple_oauth_client_id(),
    }
    headers = {"kid": apple_oauth_key_id(), "alg": "ES256"}
    token = jwt.encode(claims, private_key, algorithm="ES256", headers=headers)
    if isinstance(token, bytes):
        return token.decode("utf-8")
    return token


def build_apple_authorization_url(*, redirect_uri: str, state: str, nonce: str) -> str:
    params = {
        "client_id": apple_oauth_client_id(),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "response_mode": "form_post",
        "scope": " ".join(APPLE_OAUTH_SCOPES),
        "state": state,
        "nonce": nonce,
    }
    return f"{APPLE_OAUTH_AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"


def exchange_authorization_code(*, redirect_uri: str, code: str) -> dict:
    client_secret = generate_apple_client_secret()
    payload = urllib.parse.urlencode(
        {
            "client_id": apple_oauth_client_id(),
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        APPLE_OAUTH_TOKEN_URL,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(request, timeout=_http_timeout_seconds()) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        logger.warning("Apple token exchange failed with HTTP %s", exc.code)
        raise AppleOAuthClientError("token_exchange_failed") from exc
    except urllib.error.URLError as exc:
        logger.warning("Apple token exchange network failure: %s", exc)
        raise AppleOAuthClientError("token_exchange_failed") from exc

    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise AppleOAuthClientError("token_exchange_failed") from exc

    id_token = data.get("id_token")
    if not id_token:
        raise AppleOAuthClientError("missing_id_token")
    return data


def verify_apple_id_token(id_token_jwt: str, *, expected_nonce: str) -> dict:
    try:
        import jwt
    except ImportError as exc:
        raise AppleOAuthClientError("pyjwt_unavailable") from exc

    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(id_token_jwt)
        claims = jwt.decode(
            id_token_jwt,
            signing_key.key,
            algorithms=["RS256"],
            audience=apple_oauth_client_id(),
            issuer=APPLE_OAUTH_ISSUER,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AppleOAuthClientError("expired_id_token") from exc
    except jwt.InvalidTokenError as exc:
        raise AppleOAuthClientError("invalid_id_token") from exc

    issuer = claims.get("iss")
    if issuer != APPLE_OAUTH_ISSUER:
        raise AppleOAuthClientError("invalid_issuer")

    audience = claims.get("aud")
    client_id = apple_oauth_client_id()
    if isinstance(audience, (list, tuple, set)):
        if client_id not in audience:
            raise AppleOAuthClientError("invalid_audience")
    elif audience != client_id:
        raise AppleOAuthClientError("invalid_audience")

    token_nonce = claims.get("nonce")
    if not expected_nonce or token_nonce != expected_nonce:
        raise AppleOAuthClientError("invalid_nonce")

    subject = str(claims.get("sub") or "").strip()
    if not subject:
        raise AppleOAuthClientError("missing_subject")

    return claims
