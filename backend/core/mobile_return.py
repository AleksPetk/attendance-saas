"""
Validate Android mobile deep-link return URLs for Apple browser OAuth.

Separate from desktop loopback validation. Only the exact CheckStation
Android Apple result deep link is accepted:

  checkstation://auth/apple-result

No other scheme, host, path, query, or fragment is allowed as a redirect
destination supplied by the client.
"""

from __future__ import annotations

from urllib.parse import urlparse, urlunparse

MOBILE_APPLE_RETURN_SCHEME = "checkstation"
MOBILE_APPLE_RETURN_HOST = "auth"
MOBILE_APPLE_RETURN_PATH = "/apple-result"
MOBILE_APPLE_RETURN_URL = "checkstation://auth/apple-result"


class MobileReturnUrlError(ValueError):
    """Raised when a mobile return URL is missing or unsafe."""


def is_allowed_mobile_apple_return_url(value: str | None) -> bool:
    raw = str(value or "").strip()
    if not raw:
        return False
    try:
        parsed = urlparse(raw)
    except ValueError:
        return False
    if parsed.scheme != MOBILE_APPLE_RETURN_SCHEME:
        return False
    # checkstation://auth/apple-result → netloc/host "auth", path "/apple-result"
    if (parsed.hostname or "").lower() != MOBILE_APPLE_RETURN_HOST:
        return False
    if parsed.port is not None:
        return False
    if parsed.username or parsed.password:
        return False
    if parsed.query or parsed.fragment:
        return False
    if (parsed.path or "") != MOBILE_APPLE_RETURN_PATH:
        return False
    return True


def require_allowed_mobile_apple_return_url(value: str | None) -> str:
    if not is_allowed_mobile_apple_return_url(value):
        raise MobileReturnUrlError("Invalid mobile return URL.")
    # Canonical form — strip any unexpected casing/noise from parse.
    return urlunparse(
        (
            MOBILE_APPLE_RETURN_SCHEME,
            MOBILE_APPLE_RETURN_HOST,
            MOBILE_APPLE_RETURN_PATH,
            "",
            "",
            "",
        )
    )
