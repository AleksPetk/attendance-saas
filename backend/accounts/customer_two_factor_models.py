"""
Customer Owner (paying customer) TOTP device and one-time recovery codes.

This is intentionally separate from the platform-admin TOTP models to avoid
role confusion and cross-tenant or cross-surface access.
"""

from django.conf import settings
from django.db import models


class OwnerTOTPDevice(models.Model):
    """
    Authenticator device for a customer owner.

    The TOTP secret is stored encrypted. `confirmed` is False until the owner
    proves possession of the authenticator by submitting a valid current code.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owner_totp_device",
    )
    secret_encrypted = models.TextField()
    confirmed = models.BooleanField(default=False)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    last_verified_timestep = models.BigIntegerField(null=True, blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "owner TOTP device"
        verbose_name_plural = "owner TOTP devices"

    def __str__(self):
        status = "confirmed" if self.confirmed else "pending"
        return f"Owner TOTP {status} for user {self.user_id}"


class OwnerRecoveryCode(models.Model):
    """
    One-time recovery code for a customer owner.

    Only the hash is stored; the plaintext code is shown only at generation.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owner_recovery_codes",
    )
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "owner recovery code"
        verbose_name_plural = "owner recovery codes"
        indexes = [
            models.Index(fields=["user", "used_at"], name="owner_2fa_recov_user_used"),
        ]

    def __str__(self):
        state = "used" if self.used_at else "unused"
        return f"Recovery code ({state}) for user {self.user_id}"

