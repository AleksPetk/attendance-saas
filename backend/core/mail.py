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
RESEND_DOMAINS_URL = "https://api.resend.com/domains"
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


class EmailHealthUnknown(EmailError):
    """Configured, but no reliable provider health evidence is available."""


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
        from core.email_branding import canonical_product_name

        name = canonical_product_name(name)
        return f"{name} <{email}>"
    return email


class ResendEmailProvider:
    """Thin Resend HTTP client. The only module that talks to Resend."""

    def send(self, *, to_email, subject, html_body, text_body, reply_to=""):
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
        reply = str(reply_to or "").strip()
        if reply:
            payload["reply_to"] = reply
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

    def check_health(self):
        """
        Safe Resend health check. Does not send mail.

        GET /domains works for full-access keys. Sending-only keys return 401
        ``restricted_api_key`` there while POST /emails still works, so that
        401 is not treated as an outage. In that case a deliberately invalid
        POST /emails payload is used to prove the sending key is accepted
        without creating a message.
        """
        api_key = getattr(settings, "RESEND_API_KEY", "") or ""
        if not api_key:
            raise EmailConfigurationError("RESEND_API_KEY is not configured.")

        timeout = int(getattr(settings, "RESEND_TIMEOUT_SECONDS", 15) or 15)
        domains_code, _domains_body = self._resend_request(
            "GET",
            RESEND_DOMAINS_URL,
            api_key,
            timeout=timeout,
        )
        if domains_code is None:
            logger.error("Resend health check failed (network or timeout).")
            raise EmailSendError("The email provider could not be reached.") from None
        if 200 <= domains_code < 300:
            logger.info("Resend health check succeeded.")
            return "ok"
        if 500 <= domains_code < 600:
            logger.error("Resend health check returned HTTP %s.", domains_code)
            raise EmailSendError("The email provider rejected the request.")

        # 401/403 on /domains is the sending-only key case, not an outage.
        logger.info(
            "Resend domain list is not available for this API key (HTTP %s); "
            "checking send authorization instead.",
            domains_code,
        )
        return self._check_send_authorization(api_key, timeout=timeout)

    def _check_send_authorization(self, api_key, *, timeout):
        """
        Authenticate a sending key without delivering mail.

        An empty JSON object is invalid for POST /emails, so Resend returns
        400/422 after accepting the key. No recipient or body is included.
        """
        code, _raw = self._resend_request(
            "POST",
            RESEND_API_URL,
            api_key,
            data=b"{}",
            timeout=timeout,
        )
        if code is None:
            logger.error("Resend send-auth health check failed (network or timeout).")
            raise EmailSendError("The email provider could not be reached.") from None
        if code in {400, 422}:
            logger.info("Resend send-auth health check succeeded.")
            return "ok"
        if 200 <= code < 300:
            logger.error("Resend send-auth probe returned success unexpectedly.")
            raise EmailHealthUnknown("Resend did not yield a reliable health signal.")
        if code in {401, 403} or 500 <= code < 600:
            logger.error("Resend send-auth health check returned HTTP %s.", code)
            raise EmailSendError("The email provider rejected the request.")
        logger.info(
            "Resend send-auth health check was inconclusive (HTTP %s).",
            code,
        )
        raise EmailHealthUnknown("Resend did not yield a reliable health signal.")

    def _resend_request(self, method, url, api_key, *, data=None, timeout=15):
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "User-Agent": RESEND_USER_AGENT,
        }
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers=headers,
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.getcode(), response.read()
        except urllib.error.HTTPError as exc:
            body = exc.read()
            return exc.code, body
        except urllib.error.URLError:
            return None, b""


def get_email_provider():
    return ResendEmailProvider()


def send_transactional_email(*, to_email, subject, html_body, text_body, reply_to=""):
    """
    Send one transactional email through the configured provider.

    Raises EmailConfigurationError or EmailSendError. Never logs the API key
    or the full message token/URL beyond the provider's own sanitized errors.
    Optional reply_to is the validated submitter address for operator mail.
    From remains the verified CheckStation sender.
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
        reply_to=reply_to,
    )
