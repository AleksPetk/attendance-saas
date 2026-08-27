"""Platform advertising and promotion settings in Django admin."""

from django.contrib import admin, messages
from django.shortcuts import redirect, render
from django.urls import path, reverse

from billing.promotion import (
    ACTIVE_PROMOTION_GROUPS,
    admin_groups_snapshot,
    set_group_value,
)
from core.models import (
    PlatformAdminAction,
    PlatformAdvertisingSettings,
    PlatformPromotionModeChange,
    PlatformPromotionSettings,
)


DISABLE_CONFIRM_COPY = (
    "Advertising will temporarily disappear from workspaces that normally "
    "require it. Workspace plans and subscriptions will not change."
)
ENABLE_CONFIRM_COPY = (
    "Workspaces that require advertising will show mock development ads again. "
    "Workspace plans and subscriptions will not change."
)


@admin.register(PlatformAdvertisingSettings)
class PlatformAdvertisingSettingsAdmin(admin.ModelAdmin):
    """View-only change form; state changes go through a confirmation page."""

    change_form_template = (
        "admin/core/platformadvertisingsettings/change_form.html"
    )
    list_display = ("ads_globally_enabled", "updated_at", "changed_by")
    readonly_fields = (
        "ads_globally_enabled",
        "updated_at",
        "changed_by",
    )
    fields = (
        "ads_globally_enabled",
        "updated_at",
        "changed_by",
    )

    def has_add_permission(self, request):
        return not PlatformAdvertisingSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        settings_obj = PlatformAdvertisingSettings.load()
        return redirect(
            reverse(
                "admin:core_platformadvertisingsettings_change",
                args=[settings_obj.pk],
            )
        )

    def change_view(self, request, object_id, form_url="", extra_context=None):
        extra_context = extra_context or {}
        extra_context["toggle_url"] = reverse(
            "admin:core_platformadvertisingsettings_toggle"
        )
        extra_context["show_save"] = False
        extra_context["show_save_and_continue"] = False
        extra_context["show_save_and_add_another"] = False
        extra_context["has_editable_inline_admin_formsets"] = False
        return super().change_view(
            request, object_id, form_url, extra_context=extra_context
        )

    def get_urls(self):
        urls = super().get_urls()
        extra = [
            path(
                "toggle/",
                self.admin_site.admin_view(self.toggle_view),
                name="core_platformadvertisingsettings_toggle",
            ),
        ]
        return extra + urls

    def toggle_view(self, request):
        settings_obj = PlatformAdvertisingSettings.load()
        enabling = not settings_obj.ads_globally_enabled
        cancel_url = reverse("admin:index")
        change_url = reverse(
            "admin:core_platformadvertisingsettings_change",
            args=[settings_obj.pk],
        )

        if request.method == "POST":
            confirmed = (request.POST.get("confirm") or "").strip() == "1"
            if not confirmed:
                messages.error(request, "Confirmation is required.")
            else:
                settings_obj.ads_globally_enabled = enabling
                settings_obj.changed_by = request.user
                settings_obj.save()
                action = "Enabled" if enabling else "Disabled"
                self.log_change(
                    request,
                    settings_obj,
                    f"{action} global advertising.",
                )
                messages.success(
                    request,
                    f"Advertising is now {'enabled' if enabling else 'disabled'}.",
                )
                return redirect("admin:index")

        if enabling:
            title = "Enable all advertising?"
            body = ENABLE_CONFIRM_COPY
            confirm_label = "Enable advertising"
        else:
            title = "Disable all advertising?"
            body = DISABLE_CONFIRM_COPY
            confirm_label = "Disable advertising"

        context = {
            **self.admin_site.each_context(request),
            "title": title,
            "confirm_title": title,
            "confirm_body": body,
            "confirm_label": confirm_label,
            "enabling": enabling,
            "cancel_url": cancel_url,
            "change_url": change_url,
            "opts": self.model._meta,
            "original": settings_obj,
        }
        return render(
            request,
            "admin/core/platformadvertisingsettings/confirm_toggle.html",
            context,
        )


@admin.register(PlatformPromotionSettings)
class PlatformPromotionSettingsAdmin(admin.ModelAdmin):
    """View-only change form; group changes go through a confirmation page."""

    change_form_template = "admin/core/platformpromotionsettings/change_form.html"
    list_display = (
        "new_basic_mode",
        "plus_monthly_enabled",
        "business_monthly_enabled",
        "updated_at",
        "changed_by",
    )
    readonly_fields = (
        "new_basic_mode",
        "plus_monthly_enabled",
        "business_monthly_enabled",
        "updated_at",
        "changed_by",
    )
    fields = readonly_fields

    def has_add_permission(self, request):
        return not PlatformPromotionSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        settings_obj = PlatformPromotionSettings.load()
        return redirect(
            reverse(
                "admin:core_platformpromotionsettings_change",
                args=[settings_obj.pk],
            )
        )

    def change_view(self, request, object_id, form_url="", extra_context=None):
        settings_obj = PlatformPromotionSettings.load()
        extra_context = extra_context or {}
        extra_context["set_group_url"] = reverse(
            "admin:core_platformpromotionsettings_set_group"
        )
        extra_context["promotion_groups"] = admin_groups_snapshot(
            settings_obj=settings_obj
        )
        recent = PlatformPromotionModeChange.objects.select_related(
            "changed_by"
        )[:12]
        extra_context["recent_changes"] = recent
        extra_context["show_save"] = False
        extra_context["show_save_and_continue"] = False
        extra_context["show_save_and_add_another"] = False
        extra_context["has_editable_inline_admin_formsets"] = False
        return super().change_view(
            request, object_id, form_url, extra_context=extra_context
        )

    def get_urls(self):
        urls = super().get_urls()
        extra = [
            path(
                "set-group/",
                self.admin_site.admin_view(self.set_group_view),
                name="core_platformpromotionsettings_set_group",
            ),
        ]
        return extra + urls

    def _pending_promotion_changes(self, request, cards):
        """Changed group/value pairs to review. Unchanged groups are omitted."""
        groups = [str(group).strip() for group in request.POST.getlist("group")]
        values = [str(value).strip() for value in request.POST.getlist("value")]
        groups = [group for group in groups if group]
        if not groups:
            get_group = (request.GET.get("group") or "").strip()
            get_value = (request.GET.get("value") or "").strip()
            if get_group:
                groups = [get_group]
                values = [get_value]

        if groups:
            if len(values) != len(groups):
                return [], "Select a valid promotion value."
            pairs = list(zip(groups, values))
        else:
            pairs = []
            for group in ACTIVE_PROMOTION_GROUPS:
                field = f"value__{group}"
                if field not in request.POST:
                    continue
                pairs.append((group, (request.POST.get(field) or "").strip()))

        pending = []
        seen = set()
        for group, value in pairs:
            if group not in ACTIVE_PROMOTION_GROUPS:
                return [], "Select a valid promotion group."
            if group in seen:
                continue
            seen.add(group)
            card = cards.get(group)
            if not card:
                return [], "Unknown promotion group."
            valid_values = {choice["value"] for choice in card["choices"]}
            if value not in valid_values:
                return [], "Select a valid promotion value."
            if value == card["value"]:
                continue
            choice_summary = next(
                (
                    choice["summary"]
                    for choice in card["choices"]
                    if choice["value"] == value
                ),
                "",
            )
            pending.append(
                {
                    "group": group,
                    "value": value,
                    "label": card["label"],
                    "old_value": card["value"],
                    "choice_summary": choice_summary,
                }
            )
        return pending, None

    def set_group_view(self, request):
        settings_obj = PlatformPromotionSettings.load()
        change_url = reverse(
            "admin:core_platformpromotionsettings_change",
            args=[settings_obj.pk],
        )
        cancel_url = change_url
        cards = {
            card["group"]: card
            for card in admin_groups_snapshot(settings_obj=settings_obj)
        }
        pending, error = self._pending_promotion_changes(request, cards)
        if error:
            messages.error(request, error)
            return redirect(change_url)
        if not pending:
            messages.info(request, "No promotion changes to review.")
            return redirect(change_url)

        if request.method == "POST" and (request.POST.get("confirm") or "").strip() == "1":
            for item in pending:
                updated, changed = set_group_value(
                    item["group"],
                    item["value"],
                    actor=request.user,
                )
                if changed:
                    self.log_change(
                        request,
                        updated,
                        (
                            f'Changed {item["group"]} from '
                            f'"{item["old_value"]}" to "{item["value"]}".'
                        ),
                    )
                    messages.success(
                        request,
                        f"{item['label']} is now {item['value'].upper()}.",
                    )
                else:
                    messages.info(
                        request,
                        f"{item['label']} is already {item['value'].upper()}.",
                    )
            return redirect(change_url)

        if len(pending) == 1:
            item = pending[0]
            title = f"Set {item['label']} to {item['value'].upper()}?"
            confirm_body = (
                f"Current: {item['old_value'].upper()}. "
                f"New: {item['value'].upper()}. {item['choice_summary']}"
            )
            confirm_label = f"Set {item['label']} to {item['value'].upper()}"
        else:
            title = "Apply promotion changes?"
            confirm_body = (
                "These promotion groups will change. "
                "Groups you did not change are not included."
            )
            confirm_label = "Apply promotion changes"

        context = {
            **self.admin_site.each_context(request),
            "title": title,
            "confirm_title": title,
            "confirm_body": confirm_body,
            "confirm_label": confirm_label,
            "pending_changes": pending,
            "cancel_url": cancel_url,
            "change_url": change_url,
            "opts": self.model._meta,
            "original": settings_obj,
        }
        return render(
            request,
            "admin/core/platformpromotionsettings/confirm_set_mode.html",
            context,
        )


@admin.register(PlatformPromotionModeChange)
class PlatformPromotionModeChangeAdmin(admin.ModelAdmin):
    """Read-only audit trail for promotion group setting changes."""

    list_display = ("changed_at", "group", "old_value", "new_value", "changed_by")
    list_filter = ("group", "old_value", "new_value")
    readonly_fields = ("group", "old_value", "new_value", "changed_at", "changed_by")
    ordering = ("-changed_at", "-id")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PlatformAdminAction)
class PlatformAdminActionAdmin(admin.ModelAdmin):
    """Read-only durable audit of high-risk platform-admin actions."""

    list_display = (
        "created_at",
        "action_type",
        "actor_email_snapshot",
        "workspace_id_snapshot",
        "old_value",
        "new_value",
    )
    list_filter = ("action_type",)
    search_fields = (
        "actor_email_snapshot",
        "workspace_id_snapshot",
        "owner_email_snapshot",
        "reason",
    )
    readonly_fields = (
        "action_type",
        "actor",
        "actor_email_snapshot",
        "target_kind",
        "target_id_snapshot",
        "workspace_id_snapshot",
        "owner_email_snapshot",
        "old_value",
        "new_value",
        "reason",
        "created_at",
    )
    ordering = ("-created_at", "-id")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
