from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from accounts.models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """
    Django admin for platform User login accounts.

    `is_staff` and `is_superuser` control platform-operator access to this Django
    admin site. Organization workspace roles (owner, admin, staff) are modeled on
    OrganizationMembership, not through these flags.
    """

    ordering = ("email",)
    list_display = ("email", "first_name", "last_name", "is_staff", "is_active", "last_login")
    list_filter = ("is_staff", "is_superuser", "is_active")
    search_fields = ("email", "first_name", "last_name")
    readonly_fields = ("last_login", "date_joined")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name")}),
        (
            "Platform admin access",
            {
                "description": (
                    "Controls access to this Django admin site for platform operator "
                    "accounts. Organization customer roles are separate and will be "
                    "managed through OrganizationMembership."
                ),
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "description": (
                    "Create a platform User account. Set staff/superuser only for "
                    "platform operator admin access, not for Organization customer roles."
                ),
                "fields": (
                    "email",
                    "password1",
                    "password2",
                    "is_staff",
                    "is_superuser",
                ),
            },
        ),
    )
