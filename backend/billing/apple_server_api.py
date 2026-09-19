"""App Store Server API client (JWT auth) for optional online checks."""

from __future__ import annotations

import time
from typing import Any

import jwt
import requests
from django.conf import settings

from billing.exceptions import BillingStateError
from billing.apple_products import APPLE_BUNDLE_ID

_SANDBOX_BASE = "https://api.storekit-sandbox.itunes.apple.com"
_PRODUCTION_BASE = "https://api.storekit.itunes.apple.com"


class AppleServerApiError(BillingStateError):
    def __init__(self, message, *, code="apple_server_api_error"):
        super().__init__(message, code=code)


def apple_iap_credentials_configured() -> bool:
    return bool(
        (getattr(settings, "APPLE_IAP_ISSUER_ID", "") or "").strip()
        and (getattr(settings, "APPLE_IAP_KEY_ID", "") or "").strip()
        and (getattr(settings, "APPLE_IAP_PRIVATE_KEY", "") or "").strip()
    )


def _private_key_pem() -> str:
    raw = (getattr(settings, "APPLE_IAP_PRIVATE_KEY", "") or "").strip()
    if not raw:
        raise AppleServerApiError(
            "Apple IAP private key is not configured.",
            code="apple_iap_not_configured",
        )
    if "BEGIN PRIVATE KEY" in raw:
        return raw
    # Allow escaped newlines from .env
    normalized = raw.replace("\\n", "\n")
    if "BEGIN PRIVATE KEY" in normalized:
        return normalized
    return (
        "-----BEGIN PRIVATE KEY-----\n"
        f"{normalized}\n"
        "-----END PRIVATE KEY-----\n"
    )


def build_app_store_connect_token(*, ttl_seconds: int = 1200) -> str:
    """Create a short-lived JWT for App Store Server API."""
    if not apple_iap_credentials_configured():
        raise AppleServerApiError(
            "Apple IAP API credentials are not configured.",
            code="apple_iap_not_configured",
        )
    issuer = settings.APPLE_IAP_ISSUER_ID.strip()
    key_id = settings.APPLE_IAP_KEY_ID.strip()
    bundle = (getattr(settings, "APPLE_IAP_BUNDLE_ID", "") or APPLE_BUNDLE_ID).strip()
    now = int(time.time())
    payload = {
        "iss": issuer,
        "iat": now,
        "exp": now + max(60, min(ttl_seconds, 3600)),
        "aud": "appstoreconnect-v1",
        "bid": bundle,
    }
    return jwt.encode(
        payload,
        _private_key_pem(),
        algorithm="ES256",
        headers={"kid": key_id, "alg": "ES256", "typ": "JWT"},
    )


def _base_url_for_environment(environment: str) -> str:
    env = str(environment or "").strip().lower()
    if env in {"sandbox", "xcode", "localtesting"}:
        return _SANDBOX_BASE
    return _PRODUCTION_BASE


def get_transaction_info(
    transaction_id: str,
    *,
    environment: str,
    timeout_seconds: float | None = None,
) -> dict[str, Any]:
    """GET /inApps/v1/transactions/{transactionId} → decoded signedTransactionInfo."""
    from billing.apple_jws import verify_apple_jws

    txn = str(transaction_id or "").strip()
    if not txn:
        raise AppleServerApiError(
            "A transaction id is required.",
            code="apple_transaction_missing",
        )
    token = build_app_store_connect_token()
    timeout = timeout_seconds
    if timeout is None:
        timeout = float(getattr(settings, "APPLE_IAP_HTTP_TIMEOUT_SECONDS", 15) or 15)
    url = f"{_base_url_for_environment(environment)}/inApps/v1/transactions/{txn}"
    try:
        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise AppleServerApiError(
            "Apple App Store Server API is unavailable.",
            code="apple_server_unavailable",
        ) from exc
    if response.status_code == 404:
        raise AppleServerApiError(
            "Apple transaction was not found.",
            code="apple_transaction_not_found",
        )
    if response.status_code >= 400:
        raise AppleServerApiError(
            "Apple App Store Server API rejected the request.",
            code="apple_server_api_error",
        )
    body = response.json()
    signed = body.get("signedTransactionInfo") or ""
    if not signed:
        raise AppleServerApiError(
            "Apple transaction response was incomplete.",
            code="apple_server_api_error",
        )
    return verify_apple_jws(signed).payload
