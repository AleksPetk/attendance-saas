"""Cloudflare Turnstile server-side verification. Never trust the widget alone."""

import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings

logger = logging.getLogger("contact.turnstile")

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

# Official Cloudflare dummy keys for local/automated tests.
DUMMY_PASS_SITE_KEY = "1x00000000000000000000AA"
DUMMY_PASS_SECRET = "1x0000000000000000000000000000000AA"


class TurnstileError(Exception):
    def __init__(self, code="turnstile_failed"):
        super().__init__(code)
        self.code = code


def configured_site_key():
    raw = str(getattr(settings, "TURNSTILE_SITE_KEY", "") or "").strip()
    if raw:
        return raw
    if getattr(settings, "DEBUG", False):
        return DUMMY_PASS_SITE_KEY
    return ""


def configured_secret():
    raw = str(getattr(settings, "TURNSTILE_SECRET_KEY", "") or "").strip()
    if raw:
        return raw
    if getattr(settings, "DEBUG", False):
        return DUMMY_PASS_SECRET
    return ""


def turnstile_is_configured():
    return bool(configured_site_key() and configured_secret())


def verify_turnstile_token(token, remote_ip=""):
    secret = configured_secret()
    if not secret:
        logger.error("Turnstile secret is not configured.")
        raise TurnstileError("turnstile_unavailable")
    value = str(token or "").strip()
    if not value:
        raise TurnstileError("turnstile_missing")

    payload = urllib.parse.urlencode(
        {
            "secret": secret,
            "response": value,
            "remoteip": remote_ip or "",
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        SITEVERIFY_URL,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    timeout = int(getattr(settings, "TURNSTILE_TIMEOUT_SECONDS", 8) or 8)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            status_code = response.getcode()
    except urllib.error.HTTPError:
        logger.error("Turnstile siteverify HTTP error.")
        raise TurnstileError("turnstile_unavailable") from None
    except urllib.error.URLError:
        logger.error("Turnstile siteverify network error.")
        raise TurnstileError("turnstile_unavailable") from None

    if status_code >= 400:
        raise TurnstileError("turnstile_unavailable")
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        raise TurnstileError("turnstile_unavailable") from None
    if not isinstance(data, dict) or not data.get("success"):
        raise TurnstileError("turnstile_invalid")
    return True
