"""Platform advertising and promotion settings in Django admin."""

from django.contrib import admin, messages
from django.shortcuts import redirect, render
from django.urls import path, reverse

from billing.promotion import admin_groups_snapshot, set_group_value
from core.models import (
    PlatformAdvertisingSettings,
    PlatformPromotionModeChange,
    PlatformPromotionSettings,
    PromotionGroupKey,
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

    def set_group_view(self, request):
        settings_obj = PlatformPromotionSettings.load()
        change_url = reverse(
            "admin:core_platformpromotionsettings_change",
            args=[settings_obj.pk],
        )
        cancel_url = change_url

        group = (request.POST.get("group") or request.GET.get("group") or "").strip()
        value = (request.POST.get("value") or request.GET.get("value") or "").strip()
        if group not in {
            PromotionGroupKey.NEW_BASIC,
            PromotionGroupKey.PLUS_MONTHLY,
            PromotionGroupKey.BUSINESS_MONTHLY,
        }:
            messages.error(request, "Select a valid promotion group.")
            return redirect(change_url)

        cards = {card["group"]: card for card in admin_groups_snapshot(settings_obj=settings_obj)}
        card = cards.get(group)
        if not card:
            messages.error(request, "Unknown promotion group.")
            return redirect(change_url)
        valid_values = {choice["value"] for choice in card["choices"]}
        if value not in valid_values:
            messages.error(request, "Select a valid promotion value.")
            return redirect(change_url)

        if value == card["value"]:
            messages.info(
                request,
                f"{card['label']} is already {value.upper()}.",
            )
            return redirect(change_url)

        choice_summary = next(
            (c["summary"] for c in card["choices"] if c["value"] == value),
            "",
        )

        if request.method == "POST" and (request.POST.get("confirm") or "").strip() == "1":
            old_value = card["value"]
            updated, changed = set_group_value(group, value, actor=request.user)
            if changed:
                self.log_change(
                    request,
                    updated,
                    (
                        f'Changed {group} from "{old_value}" to "{value}".'
                    ),
                )
                messages.success(
                    request,
                    f"{card['label']} is now {value.upper()}.",
                )
            else:
                messages.info(
                    request,
                    f"{card['label']} is already {value.upper()}.",
                )
            return redirect(change_url)

        context = {
            **self.admin_site.each_context(request),
            "title": f"Set {card['label']} to {value.upper()}?",
            "confirm_title": f"Set {card['label']} to {value.upper()}?",
            "confirm_body": (
                f"Current: {card['value'].upper()}. "
                f"New: {value.upper()}. {choice_summary}"
            ),
            "confirm_label": f"Set {card['label']} to {value.upper()}",
            "requested_group": group,
            "requested_value": value,
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
