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
