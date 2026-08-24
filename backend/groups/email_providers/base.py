"""
Provider interface for Group-owned outgoing email senders.

Attendance and Group APIs talk to this layer; they must not contain
provider-specific SMTP/OAuth branching.
"""

from abc import ABC, abstractmethod

from groups.email_sender_models import EmailSenderProviderKind


class EmailSenderProviderError(Exception):
    """Safe, customer-facing provider failure (no secrets)."""

    def __init__(self, public_message, *, diagnostic=None):
        super().__init__(public_message)
        self.public_message = public_message
        self.diagnostic = diagnostic or ""


class EmailSenderProvider(ABC):
    """Contract for Group email sender providers."""

    kind: str

    @abstractmethod
    def validate_configuration(self, sender):
        """Raise ValidationError / EmailSenderProviderError on invalid config."""

    @abstractmethod
    def send_test(self, sender, *, to_email):
        """Send a verification test message. Raises EmailSenderProviderError."""

    @abstractmethod
    def send_message(self, sender, *, to_email, subject, text_body, html_body=""):
        """Send an operational message. Raises EmailSenderProviderError."""

    def send_messages_batch(self, sender, *, messages):
        """
        Send multiple operational messages.

        messages: list of dicts with to_email, subject, text_body, html_body.
        Returns list of dicts: to_email, ok (bool), error (EmailSenderProviderError|None).
        Default implementation sends serially with one connection per message.
        """
        results = []
        for msg in messages:
            to_email = (msg.get("to_email") or "").strip().lower()
            try:
                self.send_message(
                    sender,
                    to_email=to_email,
                    subject=msg.get("subject") or "",
                    text_body=msg.get("text_body") or "",
                    html_body=msg.get("html_body") or "",
                )
            except EmailSenderProviderError as exc:
                results.append({"to_email": to_email, "ok": False, "error": exc})
            else:
                results.append({"to_email": to_email, "ok": True, "error": None})
        return results


_PROVIDERS = {}


def register_provider(provider_cls):
    instance = provider_cls()
    _PROVIDERS[instance.kind] = instance
    return provider_cls


def get_email_sender_provider(provider_kind=None):
    kind = provider_kind or EmailSenderProviderKind.CUSTOM_SMTP
    # Ensure providers are registered even if imported via base alone.
    if not _PROVIDERS or kind not in _PROVIDERS:
        from groups.email_providers import custom_smtp  # noqa: F401
        from groups.email_providers import gmail  # noqa: F401
        from groups.email_providers import microsoft  # noqa: F401
        from groups.email_providers import yahoo  # noqa: F401
    provider = _PROVIDERS.get(kind)
    if provider is None:
        raise EmailSenderProviderError("This email provider is not available.")
    return provider
