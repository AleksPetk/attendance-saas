"""Google Play Android Publisher API client (backend-only).

Uses a service-account JSON file path from settings. Never logs credential contents.
"""

from __future__ import annotations

import json
import logging
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from django.conf import settings

from billing.exceptions import BillingStateError
from billing.google_products import GOOGLE_PLAY_PACKAGE_NAME

logger = logging.getLogger("billing.google_api")

_ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher"
_API_ROOT = "https://androidpublisher.googleapis.com/androidpublisher/v3"


class GooglePlayApiError(BillingStateError):
    """Google Play Developer API call failed."""


def google_play_package_name() -> str:
    configured = str(getattr(settings, "GOOGLE_PLAY_PACKAGE_NAME", "") or "").strip()
    return configured or GOOGLE_PLAY_PACKAGE_NAME


def google_play_service_account_file() -> str:
    return str(getattr(settings, "GOOGLE_PLAY_SERVICE_ACCOUNT_FILE", "") or "").strip()


def google_play_configured() -> bool:
    path = google_play_service_account_file()
    if not path:
        return False
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except OSError:
        return False
    except json.JSONDecodeError:
        return False
    return str(data.get("type") or "") == "service_account" and bool(
        data.get("client_email")
    )


def _credentials():
    path = google_play_service_account_file()
    if not path:
        raise GooglePlayApiError(
            "Google Play billing is not configured.",
            code="google_play_not_configured",
        )
    try:
        from google.oauth2 import service_account
    except ImportError as exc:
        raise GooglePlayApiError(
            "Google auth library is unavailable.",
            code="google_play_not_configured",
        ) from exc
    try:
        return service_account.Credentials.from_service_account_file(
            path,
            scopes=[_ANDROID_PUBLISHER_SCOPE],
        )
    except OSError as exc:
        raise GooglePlayApiError(
            "Google Play service account file is unavailable.",
            code="google_play_not_configured",
        ) from exc
    except ValueError as exc:
        raise GooglePlayApiError(
            "Google Play service account file is invalid.",
            code="google_play_not_configured",
        ) from exc


def _authorized_token() -> str:
    credentials = _credentials()
    if not credentials.valid:
        from google.auth.transport.requests import Request

        credentials.refresh(Request())
    token = getattr(credentials, "token", None)
    if not token:
        raise GooglePlayApiError(
            "Google Play API authentication failed.",
            code="google_play_auth_failed",
        )
    return str(token)


def _http_json(
    method: str,
    url: str,
    *,
    body: dict | None = None,
    timeout: float | None = None,
) -> dict[str, Any] | None:
    timeout_seconds = timeout
    if timeout_seconds is None:
        timeout_seconds = float(
            getattr(settings, "GOOGLE_PLAY_HTTP_TIMEOUT_SECONDS", 15) or 15
        )
    payload = None
    headers = {
        "Authorization": f"Bearer {_authorized_token()}",
        "Accept": "application/json",
    }
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=payload, headers=headers, method=method.upper())
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read()
            if not raw:
                return None
            data = json.loads(raw.decode("utf-8"))
            if not isinstance(data, dict):
                raise GooglePlayApiError(
                    "Google Play API returned an unexpected payload.",
                    code="google_play_api_invalid",
                )
            return data
    except HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:240]
        except Exception:
            detail = ""
        status = int(getattr(exc, "code", 0) or 0)
        if status == 404:
            raise GooglePlayApiError(
                "Google Play purchase token was not found.",
                code="google_purchase_not_found",
            ) from exc
        if status in {401, 403}:
            logger.warning("Google Play API auth/permission error status=%s", status)
            raise GooglePlayApiError(
                "Google Play API authentication failed.",
                code="google_play_auth_failed",
            ) from exc
        logger.warning(
            "Google Play API HTTP error status=%s detail=%s",
            status,
            detail[:120] if detail else "",
        )
        raise GooglePlayApiError(
            "Google Play API request failed.",
            code="google_play_api_failed",
        ) from exc
    except URLError as exc:
        raise GooglePlayApiError(
            "Google Play API is unreachable.",
            code="google_play_api_failed",
        ) from exc
    except json.JSONDecodeError as exc:
        raise GooglePlayApiError(
            "Google Play API returned invalid JSON.",
            code="google_play_api_invalid",
        ) from exc


def get_subscription_purchase_v2(purchase_token: str) -> dict[str, Any]:
    """Fetch authoritative subscription state via purchases.subscriptionsv2.get."""
    token = str(purchase_token or "").strip()
    if not token:
        raise GooglePlayApiError(
            "purchase_token is required.",
            code="google_purchase_token_missing",
        )
    package = quote(google_play_package_name(), safe="")
    encoded_token = quote(token, safe="")
    url = (
        f"{_API_ROOT}/applications/{package}/purchases/subscriptionsv2/tokens/"
        f"{encoded_token}"
    )
    data = _http_json("GET", url)
    if not isinstance(data, dict):
        raise GooglePlayApiError(
            "Google Play API returned an empty subscription payload.",
            code="google_play_api_invalid",
        )
    return data


def acknowledge_subscription_purchase(
    *,
    product_id: str,
    purchase_token: str,
) -> None:
    """Acknowledge a subscription purchase (idempotent if already acknowledged)."""
    product = str(product_id or "").strip()
    token = str(purchase_token or "").strip()
    if not product or not token:
        raise GooglePlayApiError(
            "product_id and purchase_token are required to acknowledge.",
            code="google_acknowledge_invalid",
        )
    package = quote(google_play_package_name(), safe="")
    encoded_product = quote(product, safe="")
    encoded_token = quote(token, safe="")
    url = (
        f"{_API_ROOT}/applications/{package}/purchases/subscriptions/"
        f"{encoded_product}/tokens/{encoded_token}:acknowledge"
    )
    try:
        _http_json("POST", url, body={})
    except GooglePlayApiError as exc:
        # Already-acknowledged tokens may return 400; treat as success for idempotency.
        if getattr(exc, "code", "") == "google_play_api_failed":
            logger.info(
                "Google acknowledge returned non-fatal API error for product=%s",
                product,
            )
            return
        raise


def probe_google_play_credentials() -> dict[str, Any]:
    """Non-destructive credential check: load SA + refresh OAuth token only."""
    credentials = _credentials()
    email = str(getattr(credentials, "service_account_email", "") or "")
    from google.auth.transport.requests import Request

    credentials.refresh(Request())
    return {
        "ok": True,
        "client_email": email,
        "package_name": google_play_package_name(),
        "token_acquired": bool(getattr(credentials, "token", None)),
    }
