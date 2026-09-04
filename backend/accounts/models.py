from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

from accounts.language import DEFAULT_LANGUAGE
from accounts.managers import UserManager


class PreferredLanguage(models.TextChoices):
    EN = "en", "English"
    JA = "ja", "Japanese"


class User(AbstractUser):
    """
    Platform-level login account.

    Used for platform superusers, platform SaaS staff (Django is_staff /
    is_superuser), and the paying customer who owns exactly one Organization.
    Customer-created workspace admin/staff logins are WorkspaceStaffAccount,
    not this model. This is not an Organization Member.

    `is_active` means the account may authenticate and is not administratively
    disabled. `email_verified` is separate: it means the paying customer has
    confirmed ownership of the email address.
    """

    username = None
    email = models.EmailField("email address", unique=True)
    email_verified = models.BooleanField(
        default=False,
        help_text="Whether the paying customer has confirmed this email address.",
    )
    email_verified_at = models.DateTimeField(null=True, blank=True)
    email_verification_last_sent_at = models.DateTimeField(null=True, blank=True)
    password_reset_last_sent_at = models.DateTimeField(null=True, blank=True)
    backup_email = models.EmailField(null=True, blank=True)
    backup_email_verified_at = models.DateTimeField(null=True, blank=True)
    pending_backup_email = models.EmailField(null=True, blank=True)
    backup_email_verification_last_sent_at = models.DateTimeField(null=True, blank=True)
    pending_primary_email = models.EmailField(null=True, blank=True)
    pending_primary_email_requested_at = models.DateTimeField(null=True, blank=True)
    primary_email_change_last_sent_at = models.DateTimeField(null=True, blank=True)
    preferred_language = models.CharField(
        max_length=8,
        choices=PreferredLanguage.choices,
        default=DEFAULT_LANGUAGE,
        help_text=(
            "Owner UI language (en or ja). Independent of billing market, "
            "currency, and timezone."
        ),
    )
    signup_billing_market = models.CharField(
        max_length=10,
        blank=True,
        default="",
        help_text=(
            "Billing market captured from trusted geo at registration "
            "(global or jp). Applied when the Organization is provisioned. "
            "Not customer-mutable."
        ),
    )

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = "user"
        verbose_name_plural = "users"

    def __str__(self):
        return self.email

    def save(self, *args, **kwargs):
        manager = type(self).objects
        for field in (
            "email",
            "backup_email",
            "pending_backup_email",
            "pending_primary_email",
        ):
            value = getattr(self, field, None)
            if value:
                setattr(self, field, manager.normalize_email(value))
        super().save(*args, **kwargs)

    def mark_email_verified(self, when=None):
        self.email_verified = True
        self.email_verified_at = when or timezone.now()
        self.save(update_fields=["email_verified", "email_verified_at"])


from accounts.customer_two_factor_models import (  # noqa: E402,F401
    OwnerRecoveryCode,
    OwnerTOTPDevice,
)
from accounts.owner_auth_provider_models import (  # noqa: E402,F401
    OwnerAuthProvider,
    OwnerAuthProviderLink,
)
from accounts.account_recovery import (  # noqa: E402,F401
    OwnerAccountRecoveryChallenge,
    OwnerAccountRecoveryEvent,
)
from accounts.two_factor_models import PlatformRecoveryCode, PlatformTOTPDevice  # noqa: E402,F401
