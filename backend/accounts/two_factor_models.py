"""Platform-operator TOTP device and hashed recovery codes."""

from django.conf import settings
from django.db import models


class PlatformTOTPDevice(models.Model):
    """
    Authenticator device for a platform operator (is_staff / is_superuser).

    The TOTP secret is stored encrypted. `confirmed` is False until the
    operator proves the authenticator by submitting a valid current code.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="platform_totp_device",
    )
    secret_encrypted = models.TextField()
    confirmed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    last_verified_timestep = models.BigIntegerField(null=True, blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "platform TOTP device"
        verbose_name_plural = "platform TOTP devices"

    def __str__(self):
        status = "confirmed" if self.confirmed else "pending"
        return f"TOTP {status} for user {self.user_id}"


class PlatformRecoveryCode(models.Model):
    """One-time recovery code for a platform operator. Only the hash is stored."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="platform_recovery_codes",
    )
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "platform recovery code"
        verbose_name_plural = "platform recovery codes"
        indexes = [
            models.Index(fields=["user", "used_at"], name="platform_2fa_recov_user_used"),
        ]

    def __str__(self):
        state = "used" if self.used_at else "unused"
        return f"Recovery code ({state}) for user {self.user_id}"
