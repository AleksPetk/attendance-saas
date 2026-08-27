from django.contrib import admin

from billing.models import ProviderEvent, WorkspaceBuiltinTrial, WorkspaceSubscription


@admin.register(WorkspaceSubscription)
class WorkspaceSubscriptionAdmin(admin.ModelAdmin):
    """Inspect commercial subscription state. Not a paid checkout surface."""

    list_display = (
        "organization",
        "status",
        "subscribed_plan",
        "billing_interval",
        "purchase_source",
        "cancel_at_period_end",
        "updated_at",
    )
    list_filter = ("status", "purchase_source", "billing_interval", "subscribed_plan")
    search_fields = (
        "organization__workspace_id",
        "organization__internal_label",
        "external_customer_id",
        "external_subscription_id",
    )
    autocomplete_fields = ("organization",)
    readonly_fields = (
        "organization",
        "status",
        "purchase_source",
        "subscribed_plan",
        "billing_interval",
        "currency",
        "external_customer_id",
        "external_subscription_id",
        "current_period_start",
        "current_period_end",
        "trial_started_at",
        "trial_ends_at",
        "cancel_at_period_end",
        "pending_plan",
        "pending_interval",
        "pending_change_effective_at",
        "created_at",
        "updated_at",
        "payment_failure_started_at",
        "payment_grace_deadline",
        "last_payment_warning_at",
        "payment_warning_count",
        "payment_recovered_at",
    )
    fields = readonly_fields

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return True

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ProviderEvent)
class ProviderEventAdmin(admin.ModelAdmin):
    """Webhook idempotency records. Payloads are not stored."""

    list_display = (
        "provider",
        "external_event_id",
        "event_type",
        "status",
        "processed_at",
        "created_at",
    )
    list_filter = ("provider", "status", "event_type")
    search_fields = ("external_event_id", "event_type", "error_summary")
    readonly_fields = (
        "provider",
        "external_event_id",
        "event_type",
        "status",
        "error_summary",
        "processed_at",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(WorkspaceBuiltinTrial)
class WorkspaceBuiltinTrialAdmin(admin.ModelAdmin):
    """Inspect the one-time built-in Business trial. Not editable."""

    list_display = (
        "organization",
        "consumed",
        "started_at",
        "ends_at",
        "expired_at",
        "updated_at",
    )
    list_filter = ("consumed",)
    search_fields = (
        "organization__workspace_id",
        "organization__internal_label",
    )
    autocomplete_fields = ("organization",)
    readonly_fields = (
        "organization",
        "started_at",
        "ends_at",
        "consumed",
        "expired_at",
        "created_at",
        "updated_at",
    )
    fields = readonly_fields

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
