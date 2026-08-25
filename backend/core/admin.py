"""Platform advertising settings in Django admin."""

from django.contrib import admin, messages
from django.shortcuts import redirect, render
from django.urls import path, reverse

from core.models import PlatformAdvertisingSettings


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
