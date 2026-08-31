"""Linked Google/Apple sign-in identities for paying owner accounts."""

from django.conf import settings
from django.db import models

from accounts.managers import UserManager


class OwnerAuthProvider(models.TextChoices):
    GOOGLE = "google", "Google"
    APPLE = "apple", "Apple"


class OwnerAuthProviderLink(models.Model):
    """
    Stable OAuth identity linked to one paying owner User.

    Canonical identity is (provider, provider_subject). Provider email is a
    snapshot only and must not drive account matching or primary email changes.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="auth_provider_links",
    )
    provider = models.CharField(
        max_length=16,
        choices=OwnerAuthProvider.choices,
        db_index=True,
    )
    provider_subject = models.CharField(max_length=255)
    provider_email = models.EmailField(blank=True, default="")
    provider_email_verified = models.BooleanField(default=False)
    linked_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "owner auth provider link"
        verbose_name_plural = "owner auth provider links"
        constraints = [
            models.UniqueConstraint(
                fields=("provider", "provider_subject"),
                name="owner_auth_provider_subject_unique",
            ),
            models.UniqueConstraint(
                fields=("user", "provider"),
                name="owner_auth_provider_user_unique",
            ),
        ]
        indexes = [
            models.Index(fields=("user", "provider"), name="owner_auth_link_user_prov"),
        ]

    def __str__(self):
        return f"{self.provider} link for user {self.user_id}"

    def save(self, *args, **kwargs):
        if self.provider_email:
            self.provider_email = UserManager().normalize_email(self.provider_email)
        super().save(*args, **kwargs)
