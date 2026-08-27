"""Custom SMTP provider for Group email senders."""

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from groups.email_providers.base import (
    EmailSenderProvider,
    EmailSenderProviderError,
    register_provider,
)
from groups.email_providers import smtp_transport as transport
from groups.email_sender_models import (
    EmailSenderProviderKind,
    SmtpSecurity,
)

# Re-export shared safe messages so existing imports/tests keep working.
SAFE_AUTH_FAILED = transport.SAFE_AUTH_FAILED
SAFE_CONNECT_FAILED = transport.SAFE_CONNECT_FAILED
SAFE_TIMEOUT = transport.SAFE_TIMEOUT
SAFE_TLS_FAILED = transport.SAFE_TLS_FAILED
SAFE_SENDER_REJECTED = transport.SAFE_SENDER_REJECTED
SAFE_SENDER_NOT_OWNED = transport.SAFE_SENDER_NOT_OWNED
SAFE_RECIPIENT_REJECTED = transport.SAFE_RECIPIENT_REJECTED
SAFE_RECIPIENT_REFUSED = transport.SAFE_RECIPIENT_REFUSED
SAFE_SEND_FAILED = transport.SAFE_SEND_FAILED
SAFE_SMTP_AUTH_DISABLED = transport.SAFE_SMTP_AUTH_DISABLED

# Backward-compatible aliases for existing tests/imports.
_classify_smtp_error = transport.classify_smtp_error
_redact = transport.redact
_smtp_response_parts = transport.smtp_response_parts
_looks_like_sender_rejection = transport.looks_like_sender_rejection


def validate_smtp_fields(
    *,
    host,
    port,
    security,
    username,
    password,
    from_email,
    require_password=True,
):
    errors = {}
    host = (host or "").strip()
    username = (username or "").strip()
    from_email = (from_email or "").strip().lower()
    security = (security or "").strip()

    if not host:
        errors["smtp_host"] = "SMTP host is required."
    elif any(ch.isspace() for ch in host) or "/" in host:
        errors["smtp_host"] = "Enter a valid SMTP host."

    if port is None:
        errors["smtp_port"] = "SMTP port is required."
    else:
        try:
            port_int = int(port)
        except (TypeError, ValueError):
            errors["smtp_port"] = "SMTP port must be a number."
            port_int = None
        if port_int is not None and not (1 <= port_int <= 65535):
            errors["smtp_port"] = "SMTP port must be between 1 and 65535."

    if security not in SmtpSecurity.values:
        errors["smtp_security"] = "Select a valid SMTP security option."

    if not username:
        errors["smtp_username"] = "SMTP username is required."

    if require_password and not password:
        errors["smtp_password"] = "SMTP password is required."

    if not from_email:
        errors["from_email"] = "From email is required."
    else:
        try:
            validate_email(from_email)
        except ValidationError:
            errors["from_email"] = "Enter a valid From email address."

    if errors:
        raise ValidationError(errors)

    return {
        "smtp_host": host,
        "smtp_port": int(port),
        "smtp_security": security,
        "smtp_username": username,
        "from_email": from_email,
    }


@register_provider
class CustomSMTPProvider(EmailSenderProvider):
    kind = EmailSenderProviderKind.CUSTOM_SMTP

    def validate_configuration(self, sender):
        validate_smtp_fields(
            host=sender.smtp_host,
            port=sender.smtp_port,
            security=sender.smtp_security,
            username=sender.smtp_username,
            password="x" if sender.password_configured else "",
            from_email=sender.from_email,
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
        to_email = (to_email or "").strip().lower()
        try:
            validate_email(to_email)
        except ValidationError as exc:
            raise EmailSenderProviderError("Enter a valid recipient email.") from exc

        password = sender.get_smtp_password()
        from_email = (sender.from_email or "").strip().lower()
        from_name = (sender.from_name or "").strip()
        message = transport.build_email_message(
            from_email=from_email,
            from_name=from_name,
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
        )

        try:
            self._smtp_send(
                sender,
                message,
                password=password,
                envelope_from=from_email,
                envelope_to=to_email,
            )
        except EmailSenderProviderError:
            raise
        except Exception as exc:
            public, diagnostic = transport.classify_smtp_error(
                exc,
                password=password,
                security=sender.smtp_security,
                stage="send",
            )
            raise EmailSenderProviderError(public, diagnostic=diagnostic) from None

    def _smtp_send(self, sender, message, *, password, envelope_from, envelope_to):
        """
        Shared transport entry point.

        Tests may patch this method; production delegates to smtp_transport.
        """
        transport.smtp_send(
            host=sender.smtp_host,
            port=int(sender.smtp_port),
            security=sender.smtp_security,
            username=sender.smtp_username,
            password=password,
            message=message,
            envelope_from=envelope_from,
            envelope_to=envelope_to,
            group_id=getattr(sender, "group_id", None),
        )

    def send_messages_batch(self, sender, *, messages):
        self.validate_configuration(sender)
        password = sender.get_smtp_password()
        return transport.send_smtp_messages_batch(
            host=sender.smtp_host,
            port=int(sender.smtp_port),
            security=sender.smtp_security,
            username=sender.smtp_username,
            password=password,
            from_email=sender.from_email,
            from_name=sender.from_name,
            messages=messages,
            group_id=getattr(sender, "group_id", None),
        )
