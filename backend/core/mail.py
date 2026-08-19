"""
Transactional email abstraction.

Auth and other platform mail go through this module so provider-specific
Resend calls stay isolated. Callers must never pass or log API keys.
"""

import json
import logging
import urllib.error
import urllib.request
from urllib.parse import urlparse

from django.conf import settings

logger = logging.getLogger("core.mail")

RESEND_API_URL = "https://api.resend.com/emails"
# Cloudflare in front of api.resend.com rejects Python's default
# urllib User-Agent (Error 1010 / browser signature).
RESEND_USER_AGENT = "CheckStation/1.0"

PROVIDER_ERROR_KEYS = (
    "name",
    "type",
    "message",
    "status",
    "title",
    "detail",
    "error_code",
    "error_name",
)


class EmailError(Exception):
    """Base class for transactional email failures."""


class EmailConfigurationError(EmailError):
    """Missing or invalid email/provider configuration."""


class EmailSendError(EmailError):
    """The provider rejected the message or the request failed."""


def _redact_secret(value, secret):
    if not value or not secret:
        return value
    return str(value).replace(secret, "[redacted]")


def _provider_error_summary(status_code, raw_body, secret):
    """
    Build a log-safe provider error dict.

    Never includes Authorization headers or API keys.
    """
    redacted = _redact_secret(raw_body or "", secret)[:500]
    summary = {"status": status_code}
    try:
        data = json.loads(raw_body or "")
    except (TypeError, ValueError):
        data = None
    if isinstance(data, dict):
        for key in PROVIDER_ERROR_KEYS:
            value = data.get(key)
            if value is not None and value != "":
                summary[key] = _redact_secret(value, secret)
    if "message" not in summary and "detail" not in summary and redacted:
        summary["body"] = redacted
    return summary


def _reject_message(summary):
    public = "The email provider rejected the message."
    if not getattr(settings, "DEBUG", False):
        return public
    parts = []
    for key in ("status", "name", "error_code", "title", "message", "detail"):
        value = summary.get(key)
        if value is not None and value != "":
            parts.append(f"{key}={value}")
    if not parts:
        return public
    return f"{public} ({'; '.join(parts)})"


def _configured_frontend_base_url():
    raw = (getattr(settings, "FRONTEND_BASE_URL", "") or "").strip().rstrip("/")
    if not raw:
        raise EmailConfigurationError("FRONTEND_BASE_URL is not configured.")
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise EmailConfigurationError("FRONTEND_BASE_URL is not a valid http(s) origin.")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise EmailConfigurationError("FRONTEND_BASE_URL must be an origin without a path.")
    return f"{parsed.scheme}://{parsed.netloc}"


def frontend_url(*path_parts):
    """
    Build a frontend URL from configured FRONTEND_BASE_URL only.

    Path segments are joined; callers must not pass an absolute URL.
    """
    base = _configured_frontend_base_url()
    cleaned = []
    for part in path_parts:
        text = str(part).strip().strip("/")
        if not text:
            continue
        if "://" in text or text.startswith("//"):
            raise EmailConfigurationError("Refusing an absolute URL in a frontend path.")
        cleaned.append(text)
    if not cleaned:
        return base
    return f"{base}/{'/'.join(cleaned)}"


def format_from_address(name, email):
    email = (email or "").strip()
    name = (name or "").strip()
    if not email:
        raise EmailConfigurationError("RESEND_FROM_EMAIL is not configured.")
    if "<" in email and ">" in email:
        return email
    if name:
        return f"{name} <{email}>"
    return email


class ResendEmailProvider:
    """Thin Resend HTTP client. The only module that talks to Resend."""

    def send(self, *, to_email, subject, html_body, text_body):
        api_key = getattr(settings, "RESEND_API_KEY", "") or ""
        if not api_key:
            raise EmailConfigurationError("RESEND_API_KEY is not configured.")

        payload = {
            "from": format_from_address(
                getattr(settings, "RESEND_FROM_NAME", "") or "",
                getattr(settings, "RESEND_FROM_EMAIL", "") or "",
            ),
            "to": [to_email],
            "subject": subject,
            "html": html_body,
            "text": text_body,
        }
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            RESEND_API_URL,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": RESEND_USER_AGENT,
            },
        )
        timeout = int(getattr(settings, "RESEND_TIMEOUT_SECONDS", 15) or 15)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8", errors="replace")
                status_code = response.getcode()
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            summary = _provider_error_summary(exc.code, error_body, api_key)
            logger.error("Resend rejected the send: %s", summary)
            raise EmailSendError(_reject_message(summary)) from None
        except urllib.error.URLError:
            logger.error("Resend request failed (network or timeout).")
            raise EmailSendError("The email provider could not be reached.") from None

        if status_code >= 400:
            summary = _provider_error_summary(status_code, raw, api_key)
            logger.error("Resend returned an error status: %s", summary)
            raise EmailSendError(_reject_message(summary))

        logger.info("Transactional email accepted by provider.")
        return True


def get_email_provider():
    return ResendEmailProvider()


def send_transactional_email(*, to_email, subject, html_body, text_body):
    """
    Send one transactional email through the configured provider.

    Raises EmailConfigurationError or EmailSendError. Never logs the API key
    or the full message token/URL beyond the provider's own sanitized errors.
    """
    if not to_email:
        raise EmailConfigurationError("A recipient email is required.")
    if not subject:
        raise EmailConfigurationError("An email subject is required.")
    if not html_body or not text_body:
        raise EmailConfigurationError("Both HTML and plain-text bodies are required.")

    provider = get_email_provider()
    return provider.send(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )
