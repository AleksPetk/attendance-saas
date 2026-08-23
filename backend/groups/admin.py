from django.contrib import admin

from groups.models import Group, GroupMembership, GroupOnlyParticipant, GroupSection


class GroupMembershipInline(admin.TabularInline):
    model = GroupMembership
    extra = 0
    fields = ("member", "section", "override_email", "status")
    readonly_fields = ("member", "section", "override_email", "status")
    show_change_link = True
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


class GroupOnlyParticipantInline(admin.TabularInline):
    model = GroupOnlyParticipant
    extra = 0
    fields = ("name", "section", "email", "status")
    readonly_fields = ("name", "section", "email", "status")
    show_change_link = True
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


class GroupSectionInline(admin.TabularInline):
    model = GroupSection
    extra = 0
    fields = ("name", "status")
    readonly_fields = ("name", "status")
    show_change_link = True
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    """Platform inspection of Groups. Workspace is shown internally."""

    list_display = (
        "name",
        "organization",
        "group_type",
        "status",
        "check_in_enabled",
        "check_out_enabled",
        "breaks_enabled",
        "created_at",
    )
    list_filter = (
        "status",
        "group_type",
        "check_in_enabled",
        "check_out_enabled",
        "breaks_enabled",
        "organization",
    )
    search_fields = (
        "name",
        "organization__workspace_id",
        "organization__internal_label",
    )
    autocomplete_fields = ("organization",)
    readonly_fields = ("created_at", "updated_at", "archived_at")
    inlines = (GroupSectionInline, GroupMembershipInline, GroupOnlyParticipantInline)
    fieldsets = (
        (
            None,
            {"fields": ("organization", "name", "group_type", "require_class_pin", "status")},
        ),
        (
            "Actions",
            {
                "fields": (
                    "check_in_enabled",
                    "check_out_enabled",
                    "breaks_enabled",
                    "max_breaks",
                )
            },
        ),
        (
            "Deprecated kiosk compatibility",
            {
                "classes": ("collapse",),
                "fields": (
                    "require_email",
                    "require_photo",
                    "require_check_in_identifier",
                    "require_pin",
                ),
            },
        ),
        (
            "Notifications",
            {
                "fields": (
                    "send_email_after_check_in",
                    "check_in_email_template",
                    "send_email_after_check_out",
                    "check_out_email_template",
                    "send_email_after_break",
                    "break_email_template",
                )
            },
        ),
        (
            "Deprecated fields",
            {
                "classes": ("collapse",),
                "fields": (
                    "email_sender_mode",
                    "automatic_check_in_enabled",
                    "automatic_check_in_time",
                ),
            },
        ),
        (
            "Timestamps",
            {"fields": ("created_at", "updated_at", "archived_at")},
        ),
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
            f'Group "{obj}" was archived instead of deleted.',
        )

    def delete_queryset(self, request, queryset):
        count = queryset.count()
        queryset.delete()
        self.message_user(
            request,
            f"{count} group(s) archived instead of deleted.",
        )


@admin.register(GroupMembership)
class GroupMembershipAdmin(admin.ModelAdmin):
    list_display = (
        "member",
        "group",
        "organization",
        "override_email",
        "status",
        "created_at",
    )
    list_filter = ("status", "organization")
    search_fields = (
        "member__name",
        "member__email",
        "group__name",
        "organization__workspace_id",
    )
    autocomplete_fields = ("organization", "group", "member")
    readonly_fields = (
        "override_pin_hash",
        "created_at",
        "updated_at",
        "deactivated_at",
    )
    fields = (
        "organization",
        "group",
        "member",
        "override_name",
        "override_email",
        "override_photo",
        "override_check_in_identifier",
        "override_pin_hash",
        "status",
        "created_at",
        "updated_at",
        "deactivated_at",
    )

    def delete_model(self, request, obj):
        obj.deactivate()
        self.message_user(
            request,
            f'Membership "{obj}" was deactivated instead of deleted.',
        )

    def delete_queryset(self, request, queryset):
        count = queryset.count()
        queryset.delete()
        self.message_user(
            request,
            f"{count} membership(s) deactivated instead of deleted.",
        )


@admin.register(GroupOnlyParticipant)
class GroupOnlyParticipantAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "group",
        "organization",
        "email",
        "status",
        "created_at",
    )
    list_filter = ("status", "organization")
    search_fields = (
        "name",
        "email",
        "check_in_identifier",
        "group__name",
        "organization__workspace_id",
    )
    autocomplete_fields = ("organization", "group")
    readonly_fields = ("pin_hash", "created_at", "updated_at", "archived_at")
    fields = (
        "organization",
        "group",
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

    def delete_model(self, request, obj):
        obj.archive()
        self.message_user(
            request,
            f'Group-only participant "{obj}" was archived instead of deleted.',
        )

    def delete_queryset(self, request, queryset):
        count = queryset.count()
        queryset.delete()
        self.message_user(
            request,
            f"{count} group-only participant(s) archived instead of deleted.",
        )


@admin.register(GroupSection)
class GroupSectionAdmin(admin.ModelAdmin):
    list_display = ("name", "group", "organization", "status", "created_at")
    list_filter = ("status", "organization")
    search_fields = ("name", "group__name", "organization__workspace_id")
    autocomplete_fields = ("organization", "group")
    readonly_fields = ("created_at", "updated_at", "archived_at")
    fields = (
        "organization",
        "group",
        "name",
        "status",
        "created_at",
        "updated_at",
        "archived_at",
    )

    def delete_model(self, request, obj):
        obj.archive()
        self.message_user(
            request,
            f'Class "{obj}" was archived instead of deleted.',
        )

    def delete_queryset(self, request, queryset):
        count = queryset.count()
        queryset.delete()
        self.message_user(
            request,
            f"{count} Class(es) archived instead of deleted.",
        )
