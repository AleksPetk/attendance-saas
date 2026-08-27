from django.db import models
from django.db.models import Q

from organizations.models import Organization, OrganizationPlan


class PurchaseSource(models.TextChoices):
    NONE = "none", "None"
    STRIPE = "stripe", "Stripe"
    APPLE = "apple", "Apple"


class BillingInterval(models.TextChoices):
    NONE = "none", "None"
    MONTHLY = "monthly", "Monthly"
    YEARLY = "yearly", "Yearly"


class BillingStatus(models.TextChoices):
    NONE = "none", "No paid subscription"
    TRIALING = "trialing", "Provider billing delay"
    ACTIVE = "active", "Active paid"
    PAST_DUE = "past_due", "Payment problem / grace"
    CANCELED = "canceled", "Ended / canceled paid access"


class SubscribedPlan(models.TextChoices):
    PLUS = OrganizationPlan.PLUS, "Plus"
    BUSINESS = OrganizationPlan.BUSINESS, "Business"


class PendingPlan(models.TextChoices):
    PLUS = OrganizationPlan.PLUS, "Plus"
    BUSINESS = OrganizationPlan.BUSINESS, "Business"
    BASIC = OrganizationPlan.BASIC, "Basic"


class WorkspaceSubscription(models.Model):
    """Current commercial subscription for one Organization workspace.

    Organization.plan remains the effective entitlement plan. This row is
    the provider-neutral billing lifecycle. There is at most one current
    subscription per workspace (OneToOne). History tables can be added later.
    """

    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="billing",
    )
    purchase_source = models.CharField(
        max_length=20,
        choices=PurchaseSource.choices,
        default=PurchaseSource.NONE,
        db_index=True,
    )
    external_customer_id = models.CharField(max_length=255, blank=True, default="")
    external_subscription_id = models.CharField(
        max_length=255,
        blank=True,
        default="",
    )
    status = models.CharField(
        max_length=20,
        choices=BillingStatus.choices,
        default=BillingStatus.NONE,
        db_index=True,
    )
    billing_interval = models.CharField(
        max_length=20,
        choices=BillingInterval.choices,
        default=BillingInterval.NONE,
    )
    subscribed_plan = models.CharField(
        max_length=20,
        choices=SubscribedPlan.choices,
        blank=True,
        default="",
        help_text="Commercial paid/deferred-start tier (plus/business). Blank when none.",
    )
    currency = models.CharField(
        max_length=3,
        default="usd",
        help_text="V1 catalog currency is USD. Stored lowercase ISO-like code.",
    )
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    trial_started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "Provider billing-delay window start (Stripe/Apple). "
            "Not the built-in 7-day Business trial."
        ),
    )
    trial_ends_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "When the provider starts the first paid period. "
            "Not the built-in 7-day Business trial."
        ),
    )
    cancel_at_period_end = models.BooleanField(default=False)
    pending_plan = models.CharField(
        max_length=20,
        choices=PendingPlan.choices,
        blank=True,
        default="",
        help_text="Scheduled destination plan. Applied only at effective_at.",
    )
    pending_change_effective_at = models.DateTimeField(null=True, blank=True)
    pending_interval = models.CharField(
        max_length=20,
        choices=BillingInterval.choices,
        blank=True,
        default="",
        help_text="Scheduled destination billing interval. Applied only at effective_at.",
    )
    payment_failure_started_at = models.DateTimeField(null=True, blank=True)
    payment_grace_deadline = models.DateTimeField(null=True, blank=True)
    last_payment_warning_at = models.DateTimeField(null=True, blank=True)
    payment_warning_count = models.PositiveSmallIntegerField(default=0)
    payment_recovered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Workspace subscription"
        verbose_name_plural = "Workspace subscriptions"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(purchase_source__in=PurchaseSource.values),
                name="billing_workspacesubscription_source_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=BillingStatus.values),
                name="billing_workspacesubscription_status_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(billing_interval__in=BillingInterval.values),
                name="billing_workspacesubscription_interval_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(subscribed_plan="")
                | models.Q(subscribed_plan__in=SubscribedPlan.values),
                name="billing_workspacesubscription_plan_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(pending_plan="")
                | models.Q(pending_plan__in=PendingPlan.values),
                name="billing_workspacesubscription_pending_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(pending_interval="")
                | models.Q(pending_interval__in=[BillingInterval.MONTHLY, BillingInterval.YEARLY]),
                name="billing_workspacesubscription_pending_interval_valid",
            ),
            models.CheckConstraint(
                condition=Q(trial_started_at__isnull=True, trial_ends_at__isnull=True)
                | Q(
                    trial_started_at__isnull=False,
                    trial_ends_at__isnull=False,
                    trial_ends_at__gt=models.F("trial_started_at"),
                ),
                name="billing_workspacesubscription_trial_window_valid",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "current_period_end"]),
            models.Index(fields=["status", "trial_ends_at"]),
            models.Index(fields=["status", "payment_grace_deadline"]),
        ]

    def __str__(self):
        workspace_id = getattr(self.organization, "workspace_id", self.organization_id)
        return f"{workspace_id} ({self.status})"


class ProviderEventStatus(models.TextChoices):
    RECEIVED = "received", "Received"
    PROCESSED = "processed", "Processed"
    IGNORED = "ignored", "Ignored"
    FAILED = "failed", "Failed"


class ProviderEvent(models.Model):
    """Idempotency record for provider webhooks. Does not store payloads."""

    provider = models.CharField(max_length=20, default=PurchaseSource.STRIPE)
    external_event_id = models.CharField(max_length=255)
    event_type = models.CharField(max_length=120)
    status = models.CharField(
        max_length=20,
        choices=ProviderEventStatus.choices,
        default=ProviderEventStatus.RECEIVED,
    )
    error_summary = models.CharField(max_length=255, blank=True, default="")
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "external_event_id"],
                name="billing_providerevent_provider_event_unique",
            )
        ]
        indexes = [
            models.Index(fields=["provider", "event_type"]),
        ]

    def __str__(self):
        return f"{self.provider}:{self.external_event_id}"


class WorkspaceBuiltinTrial(models.Model):
    """One-time built-in 7-day Business trial per Organization.

    Separate from Stripe/Apple billing and from promotions. ``consumed`` is
    write-once: billing changes must never restore eligibility.
    """

    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="builtin_trial",
    )
    started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When Business entitlement was granted. Null if never granted.",
    )
    ends_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When built-in Business entitlement ends. Null if never granted.",
    )
    consumed = models.BooleanField(
        default=True,
        help_text="True after grant or ineligible backfill. Never set back to False.",
    )
    expired_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When post-trial entitlement (Basic or paid) was applied.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Built-in Business trial"
        verbose_name_plural = "Built-in Business trials"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(consumed=True),
                name="billing_workspacebuiltintrial_consumed_once",
            ),
            models.CheckConstraint(
                condition=Q(started_at__isnull=True, ends_at__isnull=True)
                | Q(
                    started_at__isnull=False,
                    ends_at__isnull=False,
                    ends_at__gt=models.F("started_at"),
                ),
                name="billing_workspacebuiltintrial_window_valid",
            ),
        ]
        indexes = [
            models.Index(fields=["ends_at", "expired_at"]),
        ]

    def __str__(self):
        workspace_id = getattr(self.organization, "workspace_id", self.organization_id)
        if self.started_at is None:
            return f"{workspace_id} (ineligible)"
        return f"{workspace_id} (until {self.ends_at})"

    def delete(self, *args, **kwargs):
        from django.db.models import ProtectedError

        raise ProtectedError(
            "Built-in trial rows cannot be deleted.",
            [self],
        )
