from django.contrib import admin

from members.models import Member


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    """Platform inspection of workspace Members. Shows tenant internally."""

    list_display = (
        "id",
        "name",
        "organization",
        "email",
        "phone",
        "status",
        "created_at",
    )
    list_filter = ("status", "organization")
    search_fields = (
        "name",
        "email",
        "phone",
        "address",
        "organization__workspace_id",
        "organization__internal_label",
    )
    autocomplete_fields = ("organization",)
    readonly_fields = (
        "pin_hash",
        "check_in_identifier",
        "created_at",
        "updated_at",
        "archived_at",
    )
    ordering = ("organization", "name", "id")
    fields = (
        "organization",
        "name",
        "email",
        "photo",
        "date_of_birth",
        "phone",
        "address",
        "notes",
        "check_in_identifier",
        "pin_hash",
        "status",
        "created_at",
        "updated_at",
        "archived_at",
    )

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
