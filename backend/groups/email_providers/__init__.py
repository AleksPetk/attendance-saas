"""Group email sender provider registry."""

from groups.email_providers.base import (
    EmailSenderProvider,
    EmailSenderProviderError,
    get_email_sender_provider,
)
from groups.email_providers.custom_smtp import CustomSMTPProvider
from groups.email_providers.gmail import GmailProvider
from groups.email_providers.microsoft import MicrosoftProvider
from groups.email_providers.yahoo import YahooProvider

__all__ = [
    "CustomSMTPProvider",
    "EmailSenderProvider",
    "EmailSenderProviderError",
    "GmailProvider",
    "MicrosoftProvider",
    "YahooProvider",
    "get_email_sender_provider",
]
