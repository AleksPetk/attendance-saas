from django.contrib import admin

from kiosk_builder.models import KioskDesign, KioskSettings


@admin.register(KioskSettings)
class KioskSettingsAdmin(admin.ModelAdmin):
    list_display = ("id", "organization", "group", "mode", "updated_at")
    list_filter = ("organization", "mode")
    raw_id_fields = ("organization", "group")
    readonly_fields = ("created_at", "updated_at", "exit_code_hash")


@admin.register(KioskDesign)
class KioskDesignAdmin(admin.ModelAdmin):
    list_display = ("id", "organization", "group", "updated_at")
    list_filter = ("organization",)
    raw_id_fields = ("organization", "group")
    readonly_fields = ("created_at", "updated_at")
