from django.contrib import admin

from members.models import Member


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    """Platform inspection of workspace Members. Shows tenant internally."""

    list_display = (
        "name",
        "internal_code",
        "organization",
        "email",
        "check_in_identifier",
        "status",
        "has_pin",
        "created_at",
    )
    list_filter = ("status", "organization")
    search_fields = (
        "name",
        "internal_code",
        "email",
        "check_in_identifier",
        "organization__workspace_id",
        "organization__internal_label",
    )
    autocomplete_fields = ("organization",)
    readonly_fields = (
        "internal_code",
        "pin_hash",
        "created_at",
        "updated_at",
        "archived_at",
    )
    ordering = ("organization", "name")
    fields = (
        "organization",
        "internal_code",
        "name",
        "email",
        "photo",
        "date_of_birth",
        "phone",
        "check_in_identifier",
        "notes",
        "pin_hash",
        "status",
        "created_at",
        "updated_at",
        "archived_at",
    )

    def has_pin(self, obj):
        return obj.has_pin

    has_pin.boolean = True

    def get_readonly_fields(self, request, obj=None):
        readonly = list(self.readonly_fields)
        if obj:
            readonly.append("organization")
        return readonly

    def delete_model(self, request, obj):
        obj.archive()
        self.message_user(
            request,
            f'Member "{obj}" was archived instead of deleted.',
        )

    def delete_queryset(self, request, queryset):
        count = queryset.count()
        queryset.delete()
        self.message_user(
            request,
            f"{count} member(s) archived instead of deleted.",
        )
