"""
Validate loopback return URLs for desktop Electron system-browser flows.

Desktop Apple OAuth and Stripe checkout/portal may pass a localhost callback so
the packaged app can resume after the system browser completes the flow.
Only http://127.0.0.1 and http://localhost with an explicit port are accepted.
"""

from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse


class DesktopReturnUrlError(ValueError):
    """Raised when a desktop return URL is missing or unsafe."""


def is_safe_desktop_return_url(value: str | None) -> bool:
    raw = str(value or "").strip()
    if not raw:
        return False
    try:
        parsed = urlparse(raw)
    except ValueError:
        return False
    if parsed.scheme != "http":
        return False
    if parsed.hostname not in {"127.0.0.1", "localhost"}:
        return False
    if parsed.port is None or parsed.port < 1 or parsed.port > 65535:
        return False
    if parsed.username or parsed.password:
        return False
    if parsed.fragment:
        return False
    path = parsed.path or "/"
    if not path.startswith("/"):
        return False
    # Reject path traversal and backslashes.
    if "\\" in path or "/../" in f"{path}/" or path.endswith("/.."):
        return False
    return True


def require_safe_desktop_return_url(value: str | None) -> str:
    raw = str(value or "").strip()
    if not is_safe_desktop_return_url(raw):
        raise DesktopReturnUrlError("Invalid desktop return URL.")
    parsed = urlparse(raw)
    # Normalize to a stable form without unexpected query noise from the client.
    return urlunparse(
        (
            "http",
            parsed.netloc.lower(),
            parsed.path or "/",
            "",
            "",
            "",
        )
    )


def append_desktop_return_query(base_url: str, params: dict[str, str]) -> str:
    """Append query params to a validated desktop return URL."""
    parsed = urlparse(base_url)
    existing = dict(parse_qsl(parsed.query, keep_blank_values=True))
    for key, value in params.items():
        if value is None:
            continue
        existing[str(key)] = str(value)
    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path or "/",
            "",
            urlencode(existing),
            "",
        )
    )
