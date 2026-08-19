from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.core.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path, reverse

from accounts.deletion import PermanentDeletionError, permanently_delete_customer_account
from accounts.models import User
from organizations.models import Organization


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """
    Django admin for platform User login accounts.

    `is_staff` and `is_superuser` control platform-operator access to this Django
    admin site. They are not workspace owner/admin/staff roles. Paying customers
    own a workspace via Organization.owner. Customer-created admin/staff logins
    are WorkspaceStaffAccount records.
    """

    change_form_template = "admin/accounts/user/change_form.html"
    ordering = ("email",)
    list_display = (
        "email",
        "first_name",
        "last_name",
        "email_verified",
        "is_staff",
        "is_active",
        "last_login",
    )
    list_filter = ("email_verified", "is_staff", "is_superuser", "is_active")
    search_fields = ("email", "first_name", "last_name")
    readonly_fields = ("last_login", "date_joined", "email_verified_at")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name")}),
        (
            "Email verification",
            {
                "description": (
                    "Paying customers must verify email before using the workspace. "
                    "This is separate from is_active. Platform operators "
                    "(is_staff / is_superuser) are exempt from this requirement."
                ),
                "fields": ("email_verified", "email_verified_at"),
            },
        ),
        (
            "Platform admin access",
            {
                "description": (
                    "Controls access to this Django admin site for platform operator "
                    "accounts. Paying customers own a workspace via Organization.owner. "
                    "Customer-created admin/staff logins are WorkspaceStaffAccount, "
                    "not these flags."
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
                    "platform operator admin access. Paying customers should not "
                    "have these flags; workspace admin/staff are WorkspaceStaffAccount."
                ),
                "fields": (
                    "email",
                    "password1",
                    "password2",
                    "email_verified",
                    "is_staff",
                    "is_superuser",
                ),
            },
        ),
    )

    def get_urls(self):
        urls = super().get_urls()
        extra = [
            path(
                "<path:object_id>/permanent-delete/",
                self.admin_site.admin_view(self.permanent_delete_view),
                name="accounts_user_permanent_delete",
            ),
        ]
        return extra + urls

    def change_view(self, request, object_id, form_url="", extra_context=None):
        extra_context = extra_context or {}
        user = self.get_object(request, object_id)
        extra_context["show_permanent_delete"] = bool(
            request.user.is_superuser
            and user is not None
            and not user.is_staff
            and not user.is_superuser
        )
        if extra_context["show_permanent_delete"]:
            extra_context["permanent_delete_url"] = reverse(
                "admin:accounts_user_permanent_delete",
                args=[object_id],
            )
        return super().change_view(
            request, object_id, form_url, extra_context=extra_context
        )

    def permanent_delete_view(self, request, object_id):
        if not request.user.is_superuser:
            raise PermissionDenied
        target = get_object_or_404(User, pk=object_id)
        cancel_url = reverse("admin:accounts_user_change", args=[object_id])
        if target.is_staff or target.is_superuser:
            messages.error(
                request,
                "Platform operator accounts cannot be permanently deleted this way.",
            )
            return redirect(cancel_url)

        workspace_id = ""
        organization = Organization.objects.filter(owner=target).first()
        if organization is not None:
            workspace_id = organization.workspace_id

        error = ""
        if request.method == "POST":
            confirmation = (request.POST.get("confirmation") or "").strip()
            if confirmation != "DELETE":
                error = "Type DELETE to confirm."
            else:
                try:
                    permanently_delete_customer_account(target)
                except PermanentDeletionError as exc:
                    error = exc.messages[0] if exc.messages else str(exc)
                else:
                    messages.success(
                        request,
                        f"Permanently deleted customer account {target.email}.",
                    )
                    return redirect("admin:accounts_user_changelist")

        context = {
            **self.admin_site.each_context(request),
            "title": "Permanently delete customer account",
            "email": target.email,
            "workspace_id": workspace_id or "none",
            "cancel_url": cancel_url,
            "error": error,
            "opts": self.model._meta,
        }
        return render(
            request,
            "admin/accounts/user/permanent_delete.html",
            context,
        )
