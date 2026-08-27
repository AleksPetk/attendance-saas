from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path, reverse

from accounts.deletion import PermanentDeletionError, permanently_delete_customer_account
from accounts.models import User
from core.admin_security import (
    ACTION,
    confirmation_form_errors,
    record_platform_admin_action,
    require_superuser,
)
from organizations.models import Organization


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """
    Django admin for platform User login accounts.

    `is_staff` and `is_superuser` control platform-operator access to this Django
    admin site. Paying customers own a workspace via Organization.owner.
    Privilege flags on customer owners are read-only here.
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
                    "accounts. Paying customer owners cannot receive these flags from "
                    "this form. User.is_active deactivates the owner login only — it "
                    "does not block workspace staff, kiosk, or billing. Use Organization "
                    "Block to stop the whole workspace and schedule paid cancellation."
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

    def get_readonly_fields(self, request, obj=None):
        readonly = list(self.readonly_fields)
        if obj is not None and Organization.objects.filter(owner=obj).exists():
            readonly.extend(
                ["is_staff", "is_superuser", "groups", "user_permissions"]
            )
        return readonly

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if change and "is_active" in form.changed_data and not obj.is_active:
            org = Organization.objects.filter(owner=obj).first()
            if org is not None and org.status == "active":
                self.message_user(
                    request,
                    (
                        "This owner login is inactive, but the Organization remains "
                        "active. Staff and kiosk still work, and billing is unchanged. "
                        "Use Organization Block to stop the whole workspace."
                    ),
                    level=messages.WARNING,
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
        extra_context["owns_organization"] = bool(
            user is not None and Organization.objects.filter(owner=user).exists()
        )
        extra_context["show_permanent_delete"] = bool(
            request.user.is_superuser
            and user is not None
            and not user.is_staff
            and not user.is_superuser
            and not extra_context["owns_organization"]
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
        require_superuser(request)
        target = get_object_or_404(User, pk=object_id)
        cancel_url = reverse("admin:accounts_user_change", args=[object_id])
        if target.is_staff or target.is_superuser:
            messages.error(
                request,
                "Platform operator accounts cannot be permanently deleted this way.",
            )
            return redirect(cancel_url)

        organization = Organization.objects.filter(owner=target).first()
        workspace_id = organization.workspace_id if organization is not None else ""
        if organization is not None:
            messages.error(
                request,
                "This user still owns a workspace. Permanently delete the Organization first.",
            )
            return redirect(cancel_url)

        errors = {}
        form_error = ""
        if request.method == "POST":
            _user, reason, errors = confirmation_form_errors(
                request, require_typed_delete=True
            )
            if not errors:
                email = target.email
                try:
                    permanently_delete_customer_account(
                        target, require_no_owned_organization=True
                    )
                except PermanentDeletionError as exc:
                    form_error = exc.messages[0] if exc.messages else str(exc)
                else:
                    record_platform_admin_action(
                        request=request,
                        action_type=ACTION.USER_PERMANENT_DELETE,
                        reason=reason,
                        target_kind="accounts.User",
                        target_id_snapshot=str(object_id),
                        workspace_id_snapshot="",
                        owner_email_snapshot=email,
                        old_value="existed",
                        new_value="deleted",
                    )
                    messages.success(
                        request,
                        f"Permanently deleted customer account {email}.",
                    )
                    return redirect("admin:accounts_user_changelist")

        context = {
            **self.admin_site.each_context(request),
            "title": "Permanently delete customer account",
            "confirm_title": "Permanently delete this user?",
            "current_state": (
                f"User {target.email}\nWorkspace: none"
            ),
            "requested_state": "User permanently deleted. The email may be registered again.",
            "access_impact": "This login can no longer authenticate.",
            "billing_impact": "No owned workspace.",
            "warning": "This cannot be undone.",
            "confirm_label": "Permanently delete this account",
            "require_typed_delete": True,
            "danger": True,
            "cancel_url": cancel_url,
            "opts": self.model._meta,
            "original": target,
            "posted_reason": request.POST.get("reason", ""),
            "errors": errors,
            "form_error": form_error or errors.get("form", ""),
            "extra_hidden": {},
        }
        return render(request, "admin/confirm_high_risk.html", context)
