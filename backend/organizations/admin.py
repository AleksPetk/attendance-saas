from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path, reverse

from accounts.deletion import PermanentDeletionError, permanently_delete_customer_account
from organizations.entitlements.transitions import apply_effective_plan
from organizations.models import Organization, WorkspaceStaffAccount


class OrganizationStaffAccountInline(admin.TabularInline):
    model = WorkspaceStaffAccount
    extra = 0
    fields = ("username", "email", "role", "status")
    readonly_fields = ("username", "email", "role", "status")
    show_change_link = True
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    """
    Platform admin for customer workspaces.

    Workspace ID is generated automatically and is immutable. internal_label
    is optional admin/support text, not a customer-facing name.
    """

    change_form_template = "admin/organizations/organization/change_form.html"
    list_display = (
        "workspace_id",
        "owner",
        "internal_label",
        "plan",
        "status",
        "created_at",
        "archived_at",
    )
    list_filter = ("status", "plan")
    search_fields = ("workspace_id", "owner__email", "internal_label")
    autocomplete_fields = ("owner",)
    readonly_fields = (
        "workspace_id",
        "active_standard_groups_slots_resolved",
        "archived_groups_slots_resolved",
        "members_slots_resolved",
        "workspace_admins_slots_resolved",
        "workspace_staff_slots_resolved",
        "created_at",
        "updated_at",
        "archived_at",
    )
    inlines = (OrganizationStaffAccountInline,)
    ordering = ("workspace_id",)
    fields = (
        "owner",
        "workspace_id",
        "internal_label",
        "plan",
        "status",
        "active_standard_groups_slots_resolved",
        "archived_groups_slots_resolved",
        "members_slots_resolved",
        "workspace_admins_slots_resolved",
        "workspace_staff_slots_resolved",
        "created_at",
        "updated_at",
        "archived_at",
    )

    def delete_model(self, request, obj):
        obj.archive()
        self.message_user(
            request,
            f'Organization "{obj}" was archived instead of deleted.',
        )

    def delete_queryset(self, request, queryset):
        count = queryset.count()
        queryset.delete()
        self.message_user(
            request,
            f"{count} organization(s) archived instead of deleted.",
        )

    def get_urls(self):
        urls = super().get_urls()
        extra = [
            path(
                "<path:object_id>/permanent-delete/",
                self.admin_site.admin_view(self.permanent_delete_view),
                name="organizations_organization_permanent_delete",
            ),
        ]
        return extra + urls

    def save_model(self, request, obj, form, change):
        """Manual plan edits are entitlement operations, not paid transactions."""
        if change and "plan" in form.changed_data:
            target_plan = obj.plan
            previous_plan = form.initial.get("plan")
            if previous_plan is None:
                previous_plan = (
                    Organization.objects.filter(pk=obj.pk)
                    .values_list("plan", flat=True)
                    .first()
                )
            obj.plan = previous_plan
            super().save_model(request, obj, form, change)
            apply_effective_plan(obj, target_plan, source="platform_admin")
            return
        super().save_model(request, obj, form, change)

    def change_view(self, request, object_id, form_url="", extra_context=None):
        extra_context = extra_context or {}
        organization = self.get_object(request, object_id)
        owner = getattr(organization, "owner", None) if organization else None
        extra_context["show_permanent_delete"] = bool(
            request.user.is_superuser
            and owner is not None
            and not owner.is_staff
            and not owner.is_superuser
        )
        if extra_context["show_permanent_delete"]:
            extra_context["permanent_delete_url"] = reverse(
                "admin:organizations_organization_permanent_delete",
                args=[object_id],
            )
        return super().change_view(
            request, object_id, form_url, extra_context=extra_context
        )

    def permanent_delete_view(self, request, object_id):
        if not request.user.is_superuser:
            raise PermissionDenied
        organization = get_object_or_404(Organization, pk=object_id)
        cancel_url = reverse(
            "admin:organizations_organization_change", args=[object_id]
        )
        owner = organization.owner
        if owner.is_staff or owner.is_superuser:
            messages.error(
                request,
                "Platform operator accounts cannot be permanently deleted this way.",
            )
            return redirect(cancel_url)

        error = ""
        if request.method == "POST":
            confirmation = (request.POST.get("confirmation") or "").strip()
            if confirmation != "DELETE":
                error = "Type DELETE to confirm."
            else:
                try:
                    permanently_delete_customer_account(owner)
                except PermanentDeletionError as exc:
                    error = exc.messages[0] if exc.messages else str(exc)
                else:
                    messages.success(
                        request,
                        (
                            f"Permanently deleted workspace {organization.workspace_id} "
                            f"and customer account {owner.email}."
                        ),
                    )
                    return redirect("admin:organizations_organization_changelist")

        context = {
            **self.admin_site.each_context(request),
            "title": "Permanently delete workspace",
            "email": owner.email,
            "workspace_id": organization.workspace_id,
            "cancel_url": cancel_url,
            "error": error,
            "opts": self.model._meta,
        }
        return render(
            request,
            "admin/organizations/organization/permanent_delete.html",
            context,
        )


class WorkspaceStaffAccountAdminForm(forms.ModelForm):
    raw_password = forms.CharField(
        label="Password",
        required=False,
        widget=forms.PasswordInput,
        help_text="Set or replace the password. Leave blank to keep the current password.",
    )

    class Meta:
        model = WorkspaceStaffAccount
        fields = (
            "organization",
            "username",
            "email",
            "role",
            "status",
            "raw_password",
        )
        help_texts = {
            "username": "Unique within this workspace only. The same username may exist in other workspaces.",
        }

    def clean(self):
        cleaned = super().clean()
        if not self.instance.pk and not cleaned.get("raw_password"):
            raise forms.ValidationError("Password is required for a new staff account.")
        return cleaned


@admin.register(WorkspaceStaffAccount)
class WorkspaceStaffAccountAdmin(admin.ModelAdmin):
    """
    Platform admin for customer-created workspace admin/staff logins.

    These are not paying Users and not Django is_staff. Deleting deactivates.
    """

    form = WorkspaceStaffAccountAdminForm
    list_display = ("username", "organization", "role", "status", "email")
    list_filter = ("role", "status")
    search_fields = (
        "username",
        "email",
        "organization__workspace_id",
        "organization__internal_label",
    )
    autocomplete_fields = ("organization",)
    readonly_fields = (
        "plan_unlocked",
        "created_at",
        "updated_at",
        "deactivated_at",
    )
    ordering = ("organization", "username")

    def get_readonly_fields(self, request, obj=None):
        readonly = list(self.readonly_fields)
        if obj:
            readonly.append("organization")
        return readonly

    def save_model(self, request, obj, form, change):
        raw_password = form.cleaned_data.get("raw_password")
        if raw_password:
            obj.set_password(raw_password)
        super().save_model(request, obj, form, change)

    def delete_model(self, request, obj):
        obj.deactivate()
        self.message_user(
            request,
            f'Staff account "{obj}" was deactivated instead of deleted.',
        )

    def delete_queryset(self, request, queryset):
        count = queryset.count()
        queryset.delete()
        self.message_user(
            request,
            f"{count} staff account(s) deactivated instead of deleted.",
        )
