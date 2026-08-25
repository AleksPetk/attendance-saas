"""Platform-scoped operational settings (not tenant/workspace data)."""

from django.conf import settings
from django.db import models
from django.db.models.deletion import ProtectedError


class PlatformAdvertisingSettings(models.Model):
    """Singleton kill switch for workspace advertising.

    Does not change Organization.plan, entitlements catalog, or subscriptions.
    """

    SINGLETON_PK = 1

    ads_globally_enabled = models.BooleanField(
        default=True,
        help_text=(
            "When off, advertising is hidden in every workspace. "
            "Plans and subscriptions are unchanged."
        ),
    )
    updated_at = models.DateTimeField(auto_now=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        verbose_name = "Advertising"
        verbose_name_plural = "Advertising"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(pk=1),
                name="core_platformadvertisingsettings_singleton_pk",
            ),
        ]

    def __str__(self):
        state = "Enabled" if self.ads_globally_enabled else "Disabled"
        return f"Advertising ({state})"

    def save(self, *args, **kwargs):
        self.pk = self.SINGLETON_PK
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ProtectedError(
            "Platform advertising settings cannot be deleted.",
            [self],
        )

    @classmethod
    def load(cls):
        obj, _created = cls.objects.get_or_create(
            pk=cls.SINGLETON_PK,
            defaults={"ads_globally_enabled": True},
        )
        return obj
