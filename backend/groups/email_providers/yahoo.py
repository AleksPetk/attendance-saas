"""
Yahoo Mail App Password provider for Group email senders.

Uses Yahoo SMTP with SSL/TLS on port 465 (smtp.mail.yahoo.com). Host, port, and
security are not customer-facing — they are applied by this provider only.

Yahoo OAuth is not implemented here.

Canonical transport (official Yahoo Help: smtp.mail.yahoo.com, ports 465 or 587):
Check Station uses port 465 with direct SSL/TLS to match the existing reliable
SSL transport path and keep the provider deterministic.
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

logger = logging.getLogger("groups.email_providers.yahoo")

# Canonical Yahoo SMTP transport (not exposed in the Yahoo UI).
# https://help.yahoo.com/kb/pop-smtp-settings-article-sln4724.html
YAHOO_SMTP_HOST = "smtp.mail.yahoo.com"
YAHOO_SMTP_PORT = 465
YAHOO_SMTP_SECURITY = SmtpSecurity.SSL

YAHOO_HELP_SMTP_SETTINGS = (
    "https://help.yahoo.com/kb/pop-smtp-settings-article-sln4724.html"
)
YAHOO_HELP_ACCOUNT_SECURITY = "https://login.yahoo.com/account/security"
YAHOO_HELP_APP_PASSWORDS = "https://help.yahoo.com/kb/account/SLN27791.html"

SAFE_AUTH_FAILED = (
    "Yahoo authentication failed. Check your Yahoo email and App Password."
)
SAFE_APP_PASSWORD_RESTRICTED = (
    "Yahoo refused the login. Check that you are using a Yahoo App Password "
    "and that third-party access is available for this account."
)
SAFE_CONNECT_FAILED = "Could not connect to Yahoo Mail."
SAFE_TLS_FAILED = "Could not establish a secure connection to Yahoo Mail."
SAFE_SENDER_REJECTED = "Yahoo rejected the sender address."
SAFE_RECIPIENT_REJECTED = "Yahoo rejected the recipient address."
SAFE_SEND_FAILED = "Could not send the email"


def normalize_yahoo_app_password(value):
    """
    Yahoo App Passwords are often copied with spaces for readability.

    Strip whitespace only; do not alter other characters.
    """
    if value is None:
        return ""
    return re.sub(r"\s+", "", str(value))


def validate_yahoo_fields(*, yahoo_email, password, require_password=True):
    errors = {}
    yahoo_email = (yahoo_email or "").strip().lower()

    if not yahoo_email:
        errors["yahoo_email"] = "Yahoo email is required."
    else:
        try:
            validate_email(yahoo_email)
        except ValidationError:
            errors["yahoo_email"] = "Enter a valid Yahoo email address."

    if require_password and not normalize_yahoo_app_password(password):
        errors["smtp_password"] = "App Password is required."

    if errors:
        raise ValidationError(errors)

    return {
        "yahoo_email": yahoo_email,
        "from_email": yahoo_email,
        "smtp_username": yahoo_email,
    }


def _looks_like_app_password_restriction(text):
    lowered = (text or "").lower()
    markers = (
        "application-specific password",
        "app password",
        "app-specific password",
        "please use your app password",
        "web login required",
        "login to your account via a web browser",
        "temporary password",
        "unusual sign-in",
    )
    return any(marker in lowered for marker in markers)


def _map_yahoo_public_error(public_message, diagnostic=None):
    """Map shared SMTP safe messages to Yahoo-specific copy."""
    response = ""
    if isinstance(diagnostic, dict):
        response = str(diagnostic.get("response") or "")
    if (
        public_message == transport.SAFE_AUTH_FAILED
        and _looks_like_app_password_restriction(response)
    ):
        return SAFE_APP_PASSWORD_RESTRICTED

    mapping = {
        transport.SAFE_AUTH_FAILED: SAFE_AUTH_FAILED,
        transport.SAFE_CONNECT_FAILED: SAFE_CONNECT_FAILED,
        transport.SAFE_TIMEOUT: SAFE_CONNECT_FAILED,
        transport.SAFE_TLS_FAILED: SAFE_TLS_FAILED,
        transport.SAFE_SENDER_REJECTED: SAFE_SENDER_REJECTED,
        transport.SAFE_SENDER_NOT_OWNED: SAFE_SENDER_REJECTED,
        transport.SAFE_RECIPIENT_REJECTED: SAFE_RECIPIENT_REJECTED,
        transport.SAFE_RECIPIENT_REFUSED: SAFE_RECIPIENT_REJECTED,
        transport.SAFE_SEND_FAILED: SAFE_SEND_FAILED,
    }
    return mapping.get(public_message, public_message)


@register_provider
class YahooProvider(EmailSenderProvider):
    kind = EmailSenderProviderKind.YAHOO

    def validate_configuration(self, sender):
        validate_yahoo_fields(
            yahoo_email=sender.from_email,
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
        yahoo_email = (sender.from_email or "").strip().lower()
        password = normalize_yahoo_app_password(sender.get_smtp_password())
        try:
            transport.send_smtp_message(
                host=YAHOO_SMTP_HOST,
                port=YAHOO_SMTP_PORT,
                security=YAHOO_SMTP_SECURITY,
                username=yahoo_email,
                password=password,
                from_email=yahoo_email,
                from_name=sender.from_name,
                to_email=to_email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
                group_id=sender.group_id,
            )
        except EmailSenderProviderError as exc:
            public = _map_yahoo_public_error(exc.public_message, exc.diagnostic)
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
                "Group Yahoo send failed group_id=%s diagnostic=%s",
                sender.group_id,
                diagnostic_summary,
            )
            raise EmailSenderProviderError(public, diagnostic=exc.diagnostic) from None

    def send_messages_batch(self, sender, *, messages):
        self.validate_configuration(sender)
        yahoo_email = (sender.from_email or "").strip().lower()
        password = normalize_yahoo_app_password(sender.get_smtp_password())
        results = transport.send_smtp_messages_batch(
            host=YAHOO_SMTP_HOST,
            port=YAHOO_SMTP_PORT,
            security=YAHOO_SMTP_SECURITY,
            username=yahoo_email,
            password=password,
            from_email=yahoo_email,
            from_name=sender.from_name,
            messages=messages,
            group_id=sender.group_id,
        )
        for item in results:
            if not item["ok"] and item["error"] is not None:
                exc = item["error"]
                public = _map_yahoo_public_error(exc.public_message, exc.diagnostic)
                item["error"] = EmailSenderProviderError(
                    public, diagnostic=exc.diagnostic
                )
        return results
