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


class NewBasicPromotionMode(models.TextChoices):
    """Group 1 (New / Basic) acquisition modes."""

    OFF = "off", "OFF"
    NORMAL = "normal", "NORMAL"
    BIG = "big", "BIG"


class PromotionGroupKey(models.TextChoices):
    """Active V1 groups plus historical Plus Yearly (audit rows only)."""

    NEW_BASIC = "new_basic", "New / Basic"
    PLUS_MONTHLY = "plus_monthly", "Plus Monthly"
    BUSINESS_MONTHLY = "business_monthly", "Business Monthly"
    # Retained so historical PlatformPromotionModeChange rows still label cleanly.
    PLUS_YEARLY = "plus_yearly", "Plus Yearly (retired)"


class PlatformPromotionSettings(models.Model):
    """Singleton eligibility-based CheckStation promotion controls.

    Three independent V1 groups may all be ON at once. Backend eligibility
    decides which (if any) group a visitor/workspace receives. Permanent
    catalog list prices are never mutated.
    """

    SINGLETON_PK = 1

    new_basic_mode = models.CharField(
        max_length=16,
        choices=NewBasicPromotionMode.choices,
        default=NewBasicPromotionMode.OFF,
        help_text=(
            "Group 1: acquisition offers for public visitors and Basic workspaces."
        ),
    )
    plus_monthly_enabled = models.BooleanField(
        default=False,
        help_text=(
            "Group 2: Plus Monthly → Plus Yearly / Business Yearly first-year offers."
        ),
    )
    business_monthly_enabled = models.BooleanField(
        default=False,
        help_text="Group 3: yearly switch offer for Business Monthly subscribers.",
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
        verbose_name = "Promotions"
        verbose_name_plural = "Promotions"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(pk=1),
                name="core_platformpromotionsettings_singleton_pk",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    new_basic_mode__in=NewBasicPromotionMode.values
                ),
                name="core_platformpromotionsettings_new_basic_mode_valid",
            ),
        ]

    def __str__(self):
        return (
            "Promotions "
            f"(new/basic={self.new_basic_mode}, "
            f"plus_m={'on' if self.plus_monthly_enabled else 'off'}, "
            f"biz_m={'on' if self.business_monthly_enabled else 'off'})"
        )

    def save(self, *args, **kwargs):
        self.pk = self.SINGLETON_PK
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ProtectedError(
            "Platform promotion settings cannot be deleted.",
            [self],
        )

    @classmethod
    def load(cls):
        obj, _created = cls.objects.get_or_create(
            pk=cls.SINGLETON_PK,
            defaults={"new_basic_mode": NewBasicPromotionMode.OFF},
        )
        return obj


class PlatformPromotionModeChange(models.Model):
    """Append-only audit of promotion group setting changes."""

    group = models.CharField(
        max_length=32,
        choices=PromotionGroupKey.choices,
        default=PromotionGroupKey.NEW_BASIC,
    )
    old_value = models.CharField(max_length=32)
    new_value = models.CharField(max_length=32)
    changed_at = models.DateTimeField(auto_now_add=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        verbose_name = "Promotion setting change"
        verbose_name_plural = "Promotion setting changes"
        ordering = ("-changed_at", "-id")

    def __str__(self):
        return f"{self.group}: {self.old_value} → {self.new_value}"
