"""
Outlook / Microsoft 365 provider for Group email senders.

Uses Microsoft SMTP with STARTTLS on port 587. Host selection follows current
official Microsoft guidance:

- Microsoft 365 / Exchange Online: smtp.office365.com
- Outlook.com / Hotmail / Live consumer: smtp-mail.outlook.com

Host, port, and security are not customer-facing. Microsoft OAuth / Graph API
are not implemented here.
"""

import logging

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from groups.email_providers.base import (
    EmailSenderProvider,
    EmailSenderProviderError,
    register_provider,
)
from groups.email_providers import smtp_transport as transport
from groups.email_sender_models import EmailSenderProviderKind, SmtpSecurity

logger = logging.getLogger("groups.email_providers.microsoft")

# Official Microsoft SMTP submission (not exposed in the Microsoft UI).
# https://learn.microsoft.com/en-us/exchange/mail-flow-best-practices/how-to-set-up-a-multifunction-device-or-application-to-send-email-using-microsoft-365-or-office-365
MICROSOFT_365_SMTP_HOST = "smtp.office365.com"
# https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040
OUTLOOK_COM_SMTP_HOST = "smtp-mail.outlook.com"
MICROSOFT_SMTP_PORT = 587
MICROSOFT_SMTP_SECURITY = SmtpSecurity.STARTTLS

CONSUMER_MICROSOFT_DOMAINS = frozenset(
    {
        "outlook.com",
        "hotmail.com",
        "live.com",
        "msn.com",
        "outlook.jp",
        "hotmail.co.uk",
        "live.co.uk",
    }
)

# Official help links (isolated for later updates).
MICROSOFT_HELP_SMTP_SUBMISSION = (
    "https://learn.microsoft.com/en-us/exchange/mail-flow-best-practices/"
    "how-to-set-up-a-multifunction-device-or-application-to-send-email-using-"
    "microsoft-365-or-office-365"
)
MICROSOFT_HELP_SMTP_AUTH = (
    "https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/"
    "authenticated-client-smtp-submission"
)
MICROSOFT_HELP_OUTLOOK_COM_SETTINGS = (
    "https://support.microsoft.com/en-us/office/"
    "pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040"
)
MICROSOFT_HELP_APP_PASSWORDS = (
    "https://support.microsoft.com/en-us/account-billing/"
    "how-to-get-and-use-app-passwords-5896ed9b-4263-e681-128a-a6f2979a7944"
)

SAFE_AUTH_FAILED = (
    "Microsoft authentication failed. Check your email and password/app password."
)
SAFE_SMTP_AUTH_DISABLED = (
    "Authenticated SMTP is disabled or unavailable for this Microsoft account. "
    "For Microsoft 365 business/work accounts, ask your administrator to enable "
    "Authenticated SMTP for this mailbox. Personal Outlook/Hotmail accounts may "
    "not support this connection method."
)
SAFE_CONNECT_FAILED = "Could not connect to Microsoft’s mail server."
SAFE_TLS_FAILED = (
    "Could not establish a secure connection to Microsoft’s mail server."
)
SAFE_SENDER_REJECTED = "Microsoft rejected the sender address."
SAFE_RECIPIENT_REJECTED = "Microsoft rejected the recipient address."
SAFE_SEND_FAILED = "Could not send the email"


def resolve_microsoft_smtp_host(microsoft_email):
    """
    Choose the official SMTP host for the mailbox domain.

    Custom Microsoft 365 domains (employee@company.com) use smtp.office365.com.
    Known consumer Outlook/Hotmail/Live domains use smtp-mail.outlook.com.
    """
    email = (microsoft_email or "").strip().lower()
    if "@" not in email:
        return MICROSOFT_365_SMTP_HOST
    domain = email.rsplit("@", 1)[-1]
    if domain in CONSUMER_MICROSOFT_DOMAINS or domain.endswith(".outlook.com"):
        return OUTLOOK_COM_SMTP_HOST
    return MICROSOFT_365_SMTP_HOST


def validate_microsoft_fields(*, microsoft_email, password, require_password=True):
    errors = {}
    microsoft_email = (microsoft_email or "").strip().lower()

    if not microsoft_email:
        errors["microsoft_email"] = "Microsoft email is required."
    else:
        try:
            validate_email(microsoft_email)
        except ValidationError:
            errors["microsoft_email"] = "Enter a valid Microsoft email address."

    if require_password and not (password or "").strip():
        errors["smtp_password"] = "Password / app password is required."

    if errors:
        raise ValidationError(errors)

    return {
        "microsoft_email": microsoft_email,
        "from_email": microsoft_email,
        "smtp_username": microsoft_email,
        "smtp_host": resolve_microsoft_smtp_host(microsoft_email),
        "smtp_port": MICROSOFT_SMTP_PORT,
        "smtp_security": MICROSOFT_SMTP_SECURITY,
    }


def _map_microsoft_public_error(public_message, diagnostic=None):
    """Map shared SMTP safe messages to Microsoft-specific copy."""
    response = ""
    if isinstance(diagnostic, dict):
        response = str(diagnostic.get("response") or "")
    if (
        public_message == transport.SAFE_SMTP_AUTH_DISABLED
        or transport.looks_like_smtp_auth_disabled(response)
        or public_message == transport.SAFE_AUTH_FAILED
        and transport.looks_like_smtp_auth_disabled(response)
    ):
        return SAFE_SMTP_AUTH_DISABLED

    mapping = {
        transport.SAFE_AUTH_FAILED: SAFE_AUTH_FAILED,
        transport.SAFE_SMTP_AUTH_DISABLED: SAFE_SMTP_AUTH_DISABLED,
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
class MicrosoftProvider(EmailSenderProvider):
    kind = EmailSenderProviderKind.MICROSOFT

    def validate_configuration(self, sender):
        validate_microsoft_fields(
            microsoft_email=sender.from_email,
            password="x" if sender.password_configured else "",
            require_password=True,
        )

    def send_test(self, sender, *, to_email):
        subject = "Check Station test email"
        text_body = (
            "This is a test message from Check Station.\n\n"
            "Your Group email sender is working."
        )
        html_body = (
            "<p>This is a test message from Check Station.</p>"
            "<p>Your Group email sender is working.</p>"
        )
        self.send_message(
            sender,
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
        )

    def send_message(self, sender, *, to_email, subject, text_body, html_body=""):
        self.validate_configuration(sender)
        microsoft_email = (sender.from_email or "").strip().lower()
        host = resolve_microsoft_smtp_host(microsoft_email)
        password = sender.get_smtp_password()
        try:
            transport.send_smtp_message(
                host=host,
                port=MICROSOFT_SMTP_PORT,
                security=MICROSOFT_SMTP_SECURITY,
                username=microsoft_email,
                password=password,
                from_email=microsoft_email,
                from_name=sender.from_name,
                to_email=to_email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
                group_id=sender.group_id,
            )
        except EmailSenderProviderError as exc:
            public = _map_microsoft_public_error(exc.public_message, exc.diagnostic)
            diagnostic = exc.diagnostic or {}
            if isinstance(diagnostic, dict):
                diagnostic_summary = (
                    f"stage={diagnostic.get('stage')} "
                    f"code={diagnostic.get('code')} "
                    f"response={str(diagnostic.get('response') or '')[:300]} "
                    f"exception={diagnostic.get('exception')} "
                    f"host={host}"
                )
            else:
                diagnostic_summary = str(diagnostic)[:500]
            logger.error(
                "Group Microsoft send failed group_id=%s diagnostic=%s",
                sender.group_id,
                diagnostic_summary,
            )
            raise EmailSenderProviderError(public, diagnostic=exc.diagnostic) from None

    def send_messages_batch(self, sender, *, messages):
        self.validate_configuration(sender)
        microsoft_email = (sender.from_email or "").strip().lower()
        host = resolve_microsoft_smtp_host(microsoft_email)
        password = sender.get_smtp_password()
        results = transport.send_smtp_messages_batch(
            host=host,
            port=MICROSOFT_SMTP_PORT,
            security=MICROSOFT_SMTP_SECURITY,
            username=microsoft_email,
            password=password,
            from_email=microsoft_email,
            from_name=sender.from_name,
            messages=messages,
            group_id=sender.group_id,
        )
        for item in results:
            if not item["ok"] and item["error"] is not None:
                exc = item["error"]
                public = _map_microsoft_public_error(exc.public_message, exc.diagnostic)
                item["error"] = EmailSenderProviderError(
                    public, diagnostic=exc.diagnostic
                )
        return results
