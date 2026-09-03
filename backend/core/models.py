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


class PricingCardTemplate(models.TextChoices):
    NORMAL = "normal", "Normal"
    SPRING = "spring", "Spring"
    SUMMER = "summer", "Summer"
    AUTUMN = "autumn", "Autumn"
    WINTER = "winter", "Winter"
    HALLOWEEN = "halloween", "Halloween"
    CHRISTMAS_NEW_YEAR = "christmas_new_year", "Christmas & New Year"
    BLACK_FRIDAY = "black_friday", "Black Friday"


class PlatformPricingTemplateSettings(models.Model):
    """Singleton presentation setting for pricing cards.

    This setting must not influence catalog prices, promotions, Stripe,
    subscriptions, trials, plan limits, or entitlements.
    """

    SINGLETON_PK = 1

    active_template = models.CharField(
        max_length=24,
        choices=PricingCardTemplate.choices,
        default=PricingCardTemplate.NORMAL,
        help_text="Presentation only. Normal is the safe default.",
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
        verbose_name = "Price Templates"
        verbose_name_plural = "Price Templates"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(id=1),
                name="core_platformpricingtemplatesettings_singleton_pk",
            ),
            models.CheckConstraint(
                condition=models.Q(active_template__in=PricingCardTemplate.values),
                name="core_platformpricingtemplatesettings_template_valid",
            ),
        ]

    def __str__(self):
        return f"Price Templates ({self.get_active_template_display()})"

    def save(self, *args, **kwargs):
        self.pk = self.SINGLETON_PK
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ProtectedError(
            "Platform pricing template settings cannot be deleted.",
            [self],
        )

    @classmethod
    def load(cls):
        obj, _created = cls.objects.get_or_create(
            pk=cls.SINGLETON_PK,
            defaults={"active_template": PricingCardTemplate.NORMAL},
        )
        return obj


class PromotionalTextStyle(models.TextChoices):
    NORMAL = "normal", "Normal"
    SPRING = "spring", "Spring"
    SUMMER = "summer", "Summer"
    AUTUMN = "autumn", "Autumn"
    WINTER = "winter", "Winter"
    HALLOWEEN = "halloween", "Halloween"
    CHRISTMAS_NEW_YEAR = "christmas_new_year", "Christmas & New Year"
    BLACK_FRIDAY = "black_friday", "Black Friday"
    LUXURY_GOLD = "luxury_gold", "Luxury Gold"
    CYBERPUNK = "cyberpunk", "Cyberpunk"
    RETRO_SALE = "retro_sale", "Retro Sale"
    DARK_FANTASY = "dark_fantasy", "Dark Fantasy"
    EDITORIAL = "editorial", "Editorial"
    IMPACT_SALE = "impact_sale", "Impact Sale"
    ARCADE = "arcade", "Arcade"


class PromotionalTextMarketMode(models.TextChoices):
    TOGETHER = "together", "Markets Together"
    SEPARATE = "separate", "Markets Separate"


class PlatformPromotionalTextSettings(models.Model):
    """Singleton display-copy setting for pricing surfaces only.

    This copy is independent from prices, discounts, Stripe coupons,
    promotions, trials, limits, entitlements, and pricing templates.
    """

    SINGLETON_PK = 1

    mode = models.CharField(
        max_length=12,
        choices=PromotionalTextMarketMode.choices,
        default=PromotionalTextMarketMode.TOGETHER,
        verbose_name="Market Mode",
        help_text="Choose one shared presentation or independent Global and Japan presentations.",
    )
    enabled = models.BooleanField(
        default=False,
        help_text="Show this display text on public and workspace pricing areas.",
    )
    text = models.CharField(
        max_length=280,
        blank=True,
        default="",
        verbose_name="Message",
        help_text=(
            "Display text only. It does not change prices, discounts, "
            "promotions, or Stripe coupons."
        ),
    )
    text_style = models.CharField(
        max_length=32,
        choices=PromotionalTextStyle.choices,
        default=PromotionalTextStyle.NORMAL,
        verbose_name="Text Style",
        help_text="Presentation only. This is independent from Pricing Card Templates.",
    )
    global_enabled = models.BooleanField(
        default=False,
        verbose_name="Global Enabled",
        help_text="Show the Global display text in Global billing contexts.",
    )
    global_text = models.CharField(
        max_length=280,
        blank=True,
        default="",
        verbose_name="Global Message",
        help_text="Display text for the Global billing market only.",
    )
    global_text_style = models.CharField(
        max_length=32,
        choices=PromotionalTextStyle.choices,
        default=PromotionalTextStyle.NORMAL,
        verbose_name="Global Text Style",
        help_text="Presentation only. This is independent from Pricing Card Templates.",
    )
    jp_enabled = models.BooleanField(
        default=False,
        verbose_name="Japan Enabled",
        help_text="Show the Japan display text in Japan billing contexts.",
    )
    jp_text = models.CharField(
        max_length=280,
        blank=True,
        default="",
        verbose_name="Japan Message",
        help_text="Display text for the Japan billing market only.",
    )
    jp_text_style = models.CharField(
        max_length=32,
        choices=PromotionalTextStyle.choices,
        default=PromotionalTextStyle.NORMAL,
        verbose_name="Japan Text Style",
        help_text="Presentation only. This is independent from Pricing Card Templates.",
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
        verbose_name = "Promotional Text"
        verbose_name_plural = "Promotional Text"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(id=1),
                name="core_platformpromotionaltextsettings_singleton_pk",
            ),
            models.CheckConstraint(
                condition=models.Q(text_style__in=PromotionalTextStyle.values),
                name="core_platformpromotionaltextsettings_style_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(mode__in=PromotionalTextMarketMode.values),
                name="core_promotionaltext_market_mode_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(global_text_style__in=PromotionalTextStyle.values),
                name="core_promotionaltext_global_style_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(jp_text_style__in=PromotionalTextStyle.values),
                name="core_promotionaltext_jp_style_valid",
            ),
        ]

    def __str__(self):
        status = "Enabled" if self.enabled else "Disabled"
        return f"Promotional Text ({status})"

    def save(self, *args, **kwargs):
        self.pk = self.SINGLETON_PK
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ProtectedError(
            "Platform promotional text settings cannot be deleted.",
            [self],
        )

    @classmethod
    def load(cls):
        obj, _created = cls.objects.get_or_create(
            pk=cls.SINGLETON_PK,
            defaults={
                "mode": PromotionalTextMarketMode.TOGETHER,
                "enabled": False,
                "text": "",
                "text_style": PromotionalTextStyle.NORMAL,
            },
        )
        return obj


class PlatformAdminActionType(models.TextChoices):
    CHECKSTATION_ACCOUNT_ON = "checkstation_account_on", "CheckStation Account ON"
    CHECKSTATION_ACCOUNT_OFF = "checkstation_account_off", "CheckStation Account OFF"
    CHECKSTATION_PLAN_CHANGE = "checkstation_plan_change", "CheckStation plan change"
    BILLING_MARKET_OVERRIDE_CHANGE = (
        "billing_market_override_change",
        "Billing market override change",
    )
    ORGANIZATION_BLOCK = "organization_block", "Block organization"
    ORGANIZATION_UNBLOCK = "organization_unblock", "Unblock organization"
    ORGANIZATION_PERMANENT_DELETE = (
        "organization_permanent_delete",
        "Permanently delete organization",
    )
    USER_PERMANENT_DELETE = "user_permanent_delete", "Permanently delete user"


class PlatformAdminAction(models.Model):
    """Durable snapshot of high-risk platform-admin actions.

    Survives deletion of the target User/Organization. Reasons are
    operator-only and must not be exposed to customers.
    """

    action_type = models.CharField(
        max_length=64,
        choices=PlatformAdminActionType.choices,
        db_index=True,
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    actor_email_snapshot = models.CharField(max_length=254, blank=True, default="")
    target_kind = models.CharField(max_length=32, blank=True, default="")
    target_id_snapshot = models.CharField(max_length=64, blank=True, default="")
    workspace_id_snapshot = models.CharField(max_length=16, blank=True, default="")
    owner_email_snapshot = models.CharField(max_length=254, blank=True, default="")
    old_value = models.CharField(max_length=255, blank=True, default="")
    new_value = models.CharField(max_length=255, blank=True, default="")
    reason = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Platform admin action"
        verbose_name_plural = "Platform admin actions"
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(fields=["action_type", "created_at"]),
        ]

    def __str__(self):
        return f"{self.action_type} ({self.created_at})"
