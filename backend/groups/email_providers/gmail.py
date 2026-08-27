"""
Gmail App Password provider for Group email senders.

Uses Gmail SMTP with SSL/TLS on port 465 (smtp.gmail.com). Host, port, and
security are not customer-facing — they are applied by this provider only.

Google OAuth is not implemented here.
"""

import logging
import re

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from groups.email_providers.base import (
    EmailSenderProvider,
    EmailSenderProviderError,
    register_provider,
)
from groups.email_providers import smtp_transport as transport
from groups.email_sender_models import EmailSenderProviderKind, SmtpSecurity

logger = logging.getLogger("groups.email_providers.gmail")

# Canonical Gmail SMTP transport (not exposed in the Gmail UI).
GMAIL_SMTP_HOST = "smtp.gmail.com"
GMAIL_SMTP_PORT = 465
GMAIL_SMTP_SECURITY = SmtpSecurity.SSL

SAFE_AUTH_FAILED = (
    "Gmail authentication failed. Check your Gmail address and App Password."
)
SAFE_CONNECT_FAILED = "Could not connect to Gmail."
SAFE_TLS_FAILED = "Could not establish a secure connection to Gmail."
SAFE_SENDER_RESTRICTED = (
    "Gmail refused the message. Check your account or sending permissions."
)
SAFE_RECIPIENT_REJECTED = "Gmail rejected the recipient address."
SAFE_SEND_FAILED = "Could not send the email"


def normalize_gmail_app_password(value):
    """
    Google App Passwords are often copied with spaces for readability.

    Strip whitespace only; do not alter other characters.
    """
    if value is None:
        return ""
    return re.sub(r"\s+", "", str(value))


def validate_gmail_fields(*, gmail_address, password, require_password=True):
    errors = {}
    gmail_address = (gmail_address or "").strip().lower()

    if not gmail_address:
        errors["gmail_address"] = "Gmail address is required."
    else:
        try:
            validate_email(gmail_address)
        except ValidationError:
            errors["gmail_address"] = "Enter a valid Gmail address."

    if require_password and not normalize_gmail_app_password(password):
        errors["smtp_password"] = "App Password is required."

    if errors:
        raise ValidationError(errors)

    return {
        "gmail_address": gmail_address,
        "from_email": gmail_address,
        "smtp_username": gmail_address,
    }


def _map_gmail_public_error(public_message):
    """Map shared SMTP safe messages to Gmail-specific copy."""
    mapping = {
        transport.SAFE_AUTH_FAILED: SAFE_AUTH_FAILED,
        transport.SAFE_CONNECT_FAILED: SAFE_CONNECT_FAILED,
        transport.SAFE_TIMEOUT: SAFE_CONNECT_FAILED,
        transport.SAFE_TLS_FAILED: SAFE_TLS_FAILED,
        transport.SAFE_SENDER_REJECTED: SAFE_SENDER_RESTRICTED,
        transport.SAFE_SENDER_NOT_OWNED: SAFE_SENDER_RESTRICTED,
        transport.SAFE_RECIPIENT_REJECTED: SAFE_RECIPIENT_REJECTED,
        transport.SAFE_RECIPIENT_REFUSED: SAFE_RECIPIENT_REJECTED,
        transport.SAFE_SEND_FAILED: SAFE_SEND_FAILED,
    }
    return mapping.get(public_message, public_message)


@register_provider
class GmailProvider(EmailSenderProvider):
    kind = EmailSenderProviderKind.GMAIL

    def validate_configuration(self, sender):
        validate_gmail_fields(
            gmail_address=sender.from_email,
            password="x" if sender.password_configured else "",
            require_password=True,
        )

    def send_test(self, sender, *, to_email):
        from groups.email_providers.test_message import group_sender_test_email

        subject, html_body, text_body = group_sender_test_email()
        self.send_message(
            sender,
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
        )

    def send_message(self, sender, *, to_email, subject, text_body, html_body=""):
        self.validate_configuration(sender)
        gmail_address = (sender.from_email or "").strip().lower()
        password = normalize_gmail_app_password(sender.get_smtp_password())
        try:
            transport.send_smtp_message(
                host=GMAIL_SMTP_HOST,
                port=GMAIL_SMTP_PORT,
                security=GMAIL_SMTP_SECURITY,
                username=gmail_address,
                password=password,
                from_email=gmail_address,
                from_name=sender.from_name,
                to_email=to_email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
                group_id=sender.group_id,
            )
        except EmailSenderProviderError as exc:
            public = _map_gmail_public_error(exc.public_message)
            diagnostic = exc.diagnostic or {}
            if isinstance(diagnostic, dict):
                diagnostic_summary = (
                    f"stage={diagnostic.get('stage')} "
                    f"code={diagnostic.get('code')} "
                    f"response={str(diagnostic.get('response') or '')[:300]} "
                    f"exception={diagnostic.get('exception')}"
                )
            else:
                diagnostic_summary = str(diagnostic)[:500]
            logger.error(
                "Group Gmail send failed group_id=%s diagnostic=%s",
                sender.group_id,
                diagnostic_summary,
            )
            raise EmailSenderProviderError(public, diagnostic=exc.diagnostic) from None

    def send_messages_batch(self, sender, *, messages):
        self.validate_configuration(sender)
        gmail_address = (sender.from_email or "").strip().lower()
        password = normalize_gmail_app_password(sender.get_smtp_password())
        results = transport.send_smtp_messages_batch(
            host=GMAIL_SMTP_HOST,
            port=GMAIL_SMTP_PORT,
            security=GMAIL_SMTP_SECURITY,
            username=gmail_address,
            password=password,
            from_email=gmail_address,
            from_name=sender.from_name,
            messages=messages,
            group_id=sender.group_id,
        )
        for item in results:
            if not item["ok"] and item["error"] is not None:
                exc = item["error"]
                public = _map_gmail_public_error(exc.public_message)
                item["error"] = EmailSenderProviderError(
                    public, diagnostic=exc.diagnostic
                )
        return results
