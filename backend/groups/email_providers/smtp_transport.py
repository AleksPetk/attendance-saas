"""
Shared SMTP transport for Group email sender providers.

Custom SMTP, Gmail, Microsoft, and Yahoo providers own validation and messaging;
this module owns connect / TLS / login / send only.
"""

import logging
import smtplib
import socket
import ssl
from email.message import EmailMessage

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from groups.email_providers.base import EmailSenderProviderError
from groups.email_sender_models import SmtpSecurity

logger = logging.getLogger("groups.email_providers.smtp_transport")

SAFE_AUTH_FAILED = (
    "SMTP authentication failed. Check your username and password."
)
SAFE_CONNECT_FAILED = "Could not connect to the SMTP server."
SAFE_TIMEOUT = "Connection to the SMTP server timed out."
SAFE_TLS_FAILED = (
    "Could not establish a secure SMTP connection. "
    "Check the port and security setting."
)
SAFE_SENDER_REJECTED = "The SMTP server rejected the sender address."
SAFE_SENDER_NOT_OWNED = (
    "The SMTP server rejected the sender address. "
    "Use a From address owned by the authenticated mailbox."
)
SAFE_RECIPIENT_REJECTED = "The SMTP server rejected the recipient address."
SAFE_RECIPIENT_REFUSED = (
    "The SMTP server refused this recipient. Check the recipient address "
    "and your email provider’s sending restrictions."
)
SAFE_SEND_FAILED = "Could not send the email"
SAFE_SMTP_AUTH_DISABLED = (
    "Authenticated SMTP may be disabled for this account or organization."
)


def redact(text, secret):
    if not text or not secret:
        return text
    return str(text).replace(str(secret), "[redacted]")


def smtp_response_parts(exc):
    """Extract numeric code + sanitized text from common smtplib exceptions."""
    if isinstance(exc, smtplib.SMTPResponseException):
        code = getattr(exc, "smtp_code", None)
        error = getattr(exc, "smtp_error", b"")
        if isinstance(error, (bytes, bytearray)):
            text = error.decode("utf-8", errors="replace")
        else:
            text = str(error or "")
        return code, text.strip()

    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        refused = getattr(exc, "recipients", None) or {}
        if isinstance(refused, dict) and refused:
            _recipient, detail = next(iter(refused.items()))
            if isinstance(detail, tuple) and len(detail) >= 2:
                code, error = detail[0], detail[1]
                if isinstance(error, (bytes, bytearray)):
                    text = error.decode("utf-8", errors="replace")
                else:
                    text = str(error or "")
                return code, text.strip()
    return None, redact(str(exc), "")[:500]


def looks_like_sender_rejection(text):
    lowered = (text or "").lower()
    return (
        "sender address rejected" in lowered
        or "sender rejected" in lowered
        or "not owned by user" in lowered
        or ("from address" in lowered and "reject" in lowered)
    )


def looks_like_smtp_auth_disabled(text):
    """
    Detect Microsoft / tenant policy responses that disable SMTP AUTH.

    Prefer coarse, stable phrases over brittle exact strings.
    """
    lowered = (text or "").lower()
    markers = (
        "smtpclientauthentication is disabled",
        "smtp auth is disabled",
        "smtp authentication is disabled",
        "authenticated smtp is disabled",
        "basic authentication is disabled",
        "basic auth is disabled",
        "5.7.57",
        "5.7.139",
        "smtpauthdisabled",
        "security defaults",
    )
    return any(marker in lowered for marker in markers)


def classify_smtp_error(exc, *, password="", security="", stage=""):
    message = redact(str(exc), password)
    lowered = message.lower()
    code, response_text = smtp_response_parts(exc)
    response_text = redact(response_text, password)
    diagnostic = {
        "stage": stage or "unknown",
        "exception": type(exc).__name__,
        "code": code,
        "response": (response_text or message)[:500],
    }
    security = (security or "").strip()
    combined = f"{response_text} {message}".lower()

    if looks_like_smtp_auth_disabled(combined):
        return SAFE_SMTP_AUTH_DISABLED, diagnostic

    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return SAFE_AUTH_FAILED, diagnostic

    if isinstance(exc, ssl.SSLError):
        return SAFE_TLS_FAILED, diagnostic

    if isinstance(exc, smtplib.SMTPSenderRefused):
        if looks_like_sender_rejection(response_text or message):
            return SAFE_SENDER_NOT_OWNED, diagnostic
        return SAFE_SENDER_REJECTED, diagnostic

    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        if looks_like_sender_rejection(response_text or message):
            return SAFE_SENDER_NOT_OWNED, diagnostic
        if code in {550, 551, 552, 553} or "5.7." in (response_text or ""):
            return SAFE_RECIPIENT_REFUSED, diagnostic
        return SAFE_RECIPIENT_REJECTED, diagnostic

    if isinstance(exc, TimeoutError) or (
        isinstance(exc, smtplib.SMTPServerDisconnected)
        and "timed out" in lowered
    ):
        if security in {SmtpSecurity.STARTTLS, SmtpSecurity.SSL}:
            return SAFE_TLS_FAILED, diagnostic
        return SAFE_TIMEOUT, diagnostic

    if isinstance(exc, smtplib.SMTPServerDisconnected):
        if security in {SmtpSecurity.STARTTLS, SmtpSecurity.SSL}:
            return SAFE_TLS_FAILED, diagnostic
        return SAFE_CONNECT_FAILED, diagnostic

    if isinstance(exc, socket.gaierror):
        return SAFE_CONNECT_FAILED, diagnostic

    if isinstance(
        exc,
        (ConnectionError, OSError, smtplib.SMTPConnectError),
    ):
        if "timed out" in lowered or "timeout" in lowered:
            return SAFE_TIMEOUT, diagnostic
        return SAFE_CONNECT_FAILED, diagnostic

    if "auth" in lowered or "login" in lowered or "credential" in lowered:
        return SAFE_AUTH_FAILED, diagnostic
    if (
        "ssl" in lowered
        or "tls" in lowered
        or "certificate" in lowered
        or "wrong version number" in lowered
    ):
        return SAFE_TLS_FAILED, diagnostic
    if looks_like_sender_rejection(response_text or message) or (
        "sender" in lowered and "reject" in lowered
    ):
        return SAFE_SENDER_NOT_OWNED, diagnostic
    if "recipient" in lowered and "reject" in lowered:
        return SAFE_RECIPIENT_REJECTED, diagnostic
    if isinstance(exc, smtplib.SMTPException):
        return SAFE_SEND_FAILED, diagnostic
    return SAFE_CONNECT_FAILED, diagnostic


def build_email_message(*, from_email, from_name, to_email, subject, text_body, html_body=""):
    message = EmailMessage()
    if from_name:
        message["From"] = f"{from_name} <{from_email}>"
    else:
        message["From"] = from_email
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(text_body or "")
    if html_body:
        message.add_alternative(html_body, subtype="html")
    return message


def smtp_send(
    *,
    host,
    port,
    security,
    username,
    password,
    message,
    envelope_from,
    envelope_to,
    group_id=None,
    timeout=20,
):
    """
    Distinct connection modes:

    - SSL/TLS: SMTP_SSL immediate TLS (often port 465)
    - STARTTLS: plain SMTP, EHLO, STARTTLS, EHLO, then auth (often 587)
    - None: plain SMTP without upgrade (not recommended)
    """
    stage = "connect"
    try:
        if security == SmtpSecurity.SSL:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(
                host, port, timeout=timeout, context=context
            ) as smtp:
                stage = "login"
                smtp.login(username, password)
                stage = "send_message"
                smtp.send_message(
                    message,
                    from_addr=envelope_from,
                    to_addrs=[envelope_to],
                )
            return

        if security == SmtpSecurity.STARTTLS:
            with smtplib.SMTP(host, port, timeout=timeout) as smtp:
                stage = "ehlo"
                smtp.ehlo()
                stage = "starttls"
                context = ssl.create_default_context()
                smtp.starttls(context=context)
                smtp.ehlo()
                stage = "login"
                smtp.login(username, password)
                stage = "send_message"
                smtp.send_message(
                    message,
                    from_addr=envelope_from,
                    to_addrs=[envelope_to],
                )
            return

        if security == SmtpSecurity.NONE:
            with smtplib.SMTP(host, port, timeout=timeout) as smtp:
                stage = "ehlo"
                smtp.ehlo()
                stage = "login"
                smtp.login(username, password)
                stage = "send_message"
                smtp.send_message(
                    message,
                    from_addr=envelope_from,
                    to_addrs=[envelope_to],
                )
            return

        raise EmailSenderProviderError(SAFE_TLS_FAILED)
    except EmailSenderProviderError:
        raise
    except Exception as exc:
        public, diagnostic = classify_smtp_error(
            exc,
            password=password,
            security=security,
            stage=stage,
        )
        logger.error(
            "Group SMTP connection failed group_id=%s security=%s "
            "stage=%s code=%s response=%s exception=%s "
            "envelope_from=%s envelope_to=%s",
            group_id,
            security,
            diagnostic.get("stage"),
            diagnostic.get("code"),
            diagnostic.get("response"),
            diagnostic.get("exception"),
            envelope_from,
            envelope_to,
        )
        raise EmailSenderProviderError(public, diagnostic=diagnostic) from None


def _prepare_smtp_sends(*, from_email, from_name, messages):
    """Build SMTP send payloads from normalized message dicts."""
    sends = []
    from_email = (from_email or "").strip().lower()
    from_name = (from_name or "").strip()
    for msg in messages:
        to_email = (msg.get("to_email") or "").strip().lower()
        try:
            validate_email(to_email)
        except ValidationError as exc:
            raise EmailSenderProviderError("Enter a valid recipient email.") from exc
        email_message = build_email_message(
            from_email=from_email,
            from_name=from_name,
            to_email=to_email,
            subject=msg.get("subject") or "",
            text_body=msg.get("text_body") or "",
            html_body=msg.get("html_body") or "",
        )
        sends.append(
            {
                "message": email_message,
                "envelope_from": from_email,
                "envelope_to": to_email,
            }
        )
    return sends


def smtp_send_batch(
    *,
    host,
    port,
    security,
    username,
    password,
    sends,
    group_id=None,
    timeout=20,
):
    """
    Open one SMTP session and send multiple messages on the same connection.

    sends: list of dicts with message, envelope_from, envelope_to.
    Returns list of dicts: envelope_to, ok, error (EmailSenderProviderError or None).
    """
    if not sends:
        return []

    results = []
    stage = "connect"
    try:
        if security == SmtpSecurity.SSL:
            context = ssl.create_default_context()
            smtp_factory = lambda: smtplib.SMTP_SSL(  # noqa: E731
                host, port, timeout=timeout, context=context
            )
        elif security in {SmtpSecurity.STARTTLS, SmtpSecurity.NONE}:
            smtp_factory = lambda: smtplib.SMTP(host, port, timeout=timeout)  # noqa: E731
        else:
            raise EmailSenderProviderError(SAFE_TLS_FAILED)

        with smtp_factory() as smtp:
            if security == SmtpSecurity.STARTTLS:
                stage = "ehlo"
                smtp.ehlo()
                stage = "starttls"
                context = ssl.create_default_context()
                smtp.starttls(context=context)
                smtp.ehlo()
            elif security == SmtpSecurity.NONE:
                stage = "ehlo"
                smtp.ehlo()

            stage = "login"
            smtp.login(username, password)

            for item in sends:
                envelope_to = item["envelope_to"]
                envelope_from = item["envelope_from"]
                try:
                    stage = "send_message"
                    smtp.send_message(
                        item["message"],
                        from_addr=envelope_from,
                        to_addrs=[envelope_to],
                    )
                    results.append(
                        {"envelope_to": envelope_to, "ok": True, "error": None}
                    )
                except EmailSenderProviderError as exc:
                    results.append(
                        {"envelope_to": envelope_to, "ok": False, "error": exc}
                    )
                except Exception as exc:
                    public, diagnostic = classify_smtp_error(
                        exc,
                        password=password,
                        security=security,
                        stage=stage,
                    )
                    logger.error(
                        "Group SMTP batch send failed group_id=%s security=%s "
                        "stage=%s code=%s response=%s exception=%s "
                        "envelope_from=%s envelope_to=%s",
                        group_id,
                        security,
                        diagnostic.get("stage"),
                        diagnostic.get("code"),
                        diagnostic.get("response"),
                        diagnostic.get("exception"),
                        envelope_from,
                        envelope_to,
                    )
                    results.append(
                        {
                            "envelope_to": envelope_to,
                            "ok": False,
                            "error": EmailSenderProviderError(
                                public, diagnostic=diagnostic
                            ),
                        }
                    )
        return results
    except EmailSenderProviderError as exc:
        pending = [item["envelope_to"] for item in sends[len(results) :]]
        for envelope_to in pending:
            results.append(
                {"envelope_to": envelope_to, "ok": False, "error": exc}
            )
        return results
    except Exception as exc:
        public, diagnostic = classify_smtp_error(
            exc,
            password=password,
            security=security,
            stage=stage,
        )
        logger.error(
            "Group SMTP batch connection failed group_id=%s security=%s "
            "stage=%s code=%s response=%s exception=%s",
            group_id,
            security,
            diagnostic.get("stage"),
            diagnostic.get("code"),
            diagnostic.get("response"),
            diagnostic.get("exception"),
        )
        connection_error = EmailSenderProviderError(public, diagnostic=diagnostic)
        for item in sends[len(results) :]:
            results.append(
                {
                    "envelope_to": item["envelope_to"],
                    "ok": False,
                    "error": connection_error,
                }
            )
        return results


def send_smtp_messages_batch(
    *,
    host,
    port,
    security,
    username,
    password,
    from_email,
    from_name,
    messages,
    group_id=None,
):
    """
    Build and send multiple messages over one SMTP connection.
    Returns list of dicts: to_email, ok, error.
    """
    sends = _prepare_smtp_sends(
        from_email=from_email,
        from_name=from_name,
        messages=messages,
    )
    raw_results = smtp_send_batch(
        host=host,
        port=int(port),
        security=security,
        username=username,
        password=password,
        sends=sends,
        group_id=group_id,
    )
    return [
        {
            "to_email": item["envelope_to"],
            "ok": item["ok"],
            "error": item["error"],
        }
        for item in raw_results
    ]


def send_smtp_message(
    *,
    host,
    port,
    security,
    username,
    password,
    from_email,
    from_name,
    to_email,
    subject,
    text_body,
    html_body="",
    group_id=None,
):
    to_email = (to_email or "").strip().lower()
    try:
        validate_email(to_email)
    except ValidationError as exc:
        raise EmailSenderProviderError("Enter a valid recipient email.") from exc

    from_email = (from_email or "").strip().lower()
    message = build_email_message(
        from_email=from_email,
        from_name=(from_name or "").strip(),
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )
    try:
        smtp_send(
            host=host,
            port=int(port),
            security=security,
            username=username,
            password=password,
            message=message,
            envelope_from=from_email,
            envelope_to=to_email,
            group_id=group_id,
        )
    except EmailSenderProviderError:
        raise
    except Exception as exc:
        public, diagnostic = classify_smtp_error(
            exc,
            password=password,
            security=security,
            stage="send",
        )
        logger.error(
            "Group SMTP send failed group_id=%s security=%s stage=%s "
            "code=%s response=%s exception=%s",
            group_id,
            security,
            diagnostic.get("stage"),
            diagnostic.get("code"),
            diagnostic.get("response"),
            diagnostic.get("exception"),
        )
        raise EmailSenderProviderError(public, diagnostic=diagnostic) from None
