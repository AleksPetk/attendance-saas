from django import forms
from django.contrib import admin, messages
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path, reverse

from accounts.deletion import PermanentDeletionError, permanently_delete_customer_account
from billing.exceptions import BillingStateError
from billing.markets import (
    MARKET_GLOBAL,
    MARKET_JP,
    market_for_currency,
    resolve_billing_market,
)
from core.admin_security import (
    ACTION,
    confirmation_form_errors,
    record_platform_admin_action,
    require_platform_operator,
    require_superuser,
)
from organizations.entitlements.catalog import PLAN_DISPLAY_NAMES
from organizations.lifecycle import (
    billing_summary_for_admin,
    block_organization,
    change_checkstation_plan,
    live_subscription_block_reason,
    tenant_record_counts,
    turn_checkstation_account_off,
    turn_checkstation_account_on,
    unblock_organization,
)
from organizations.models import (
    BillingMarketOverride,
    Organization,
    OrganizationPlan,
    OrganizationStatus,
    WorkspaceStaffAccount,
)
from organizations.workspace_admin_create import (
    WorkspaceAdminCreateError,
    create_workspace_for_existing_owner,
    eligible_owners_queryset,
)

CONFIRM_TEMPLATE = "admin/confirm_high_risk.html"
CREATE_WORKSPACE_TEMPLATE = (
    "admin/organizations/organization/create_workspace.html"
)
MARKET_LABELS = {
    MARKET_GLOBAL: "Global (USD)",
    MARKET_JP: "Japan (JPY)",
}


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


def _cancel_url(organization):
    return reverse("admin:organizations_organization_change", args=[organization.pk])


def _render_confirm(request, *, organization, context):
    base = {
        **admin.site.each_context(request),
        "opts": Organization._meta,
        "original": organization,
        "cancel_url": _cancel_url(organization),
        "posted_reason": request.POST.get("reason", ""),
        "errors": {},
        "form_error": "",
        "extra_hidden": {},
        "require_typed_delete": False,
        "danger": False,
    }
    base.update(context)
    return render(request, CONFIRM_TEMPLATE, base)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    """
    Platform admin for customer workspaces.

    Plan, status, and owner are not raw-editable. High-risk changes go
    through confirmation pages with a fresh password and required reason.
    """

    change_form_template = "admin/organizations/organization/change_form.html"
    change_list_template = (
        "admin/organizations/organization/change_list.html"
    )
    list_display = (
        "workspace_id",
        "owner",
        "internal_label",
        "is_checkstation_account",
        "plan",
        "billing_market_override_column",
        "effective_billing_market_column",
        "status",
        "created_at",
        "archived_at",
    )
    list_filter = (
        "status",
        "plan",
        "billing_market_override",
        "is_checkstation_account",
    )
    search_fields = ("workspace_id", "owner__email", "internal_label")
    readonly_fields = (
        "owner",
        "workspace_id",
        "is_checkstation_account",
        "plan",
        "status",
        "active_standard_groups_slots_resolved",
        "archived_groups_slots_resolved",
        "members_slots_resolved",
        "workspace_admins_slots_resolved",
        "workspace_staff_slots_resolved",
        "created_at",
        "updated_at",
        "blocked_at",
        "archived_at",
    )
    inlines = (OrganizationStaffAccountInline,)
    ordering = ("workspace_id",)
    fields = (
        "owner",
        "workspace_id",
        "internal_label",
        "is_checkstation_account",
        "plan",
        "status",
        "created_at",
        "updated_at",
        "blocked_at",
        "archived_at",
    )

    def has_add_permission(self, request):
        return False

    def get_deleted_objects(self, objs, request):
        """
        Admin delete archives the workspace; tenant data and billing rows remain.

        Without this override Django admin assumes a hard delete and blocks the
        action when related models (for example WorkspaceBuiltinTrial) disallow
        admin deletion.
        """
        return [], {}, set(), []

    def save_model(self, request, obj, form, change):
        if change and obj.pk:
            current = Organization.objects.get(pk=obj.pk)
            obj.plan = current.plan
            obj.status = current.status
            obj.owner_id = current.owner_id
            obj.is_checkstation_account = current.is_checkstation_account
            obj.billing_market_override = current.billing_market_override
            obj.blocked_at = current.blocked_at
            obj.archived_at = current.archived_at
        super().save_model(request, obj, form, change)

    @admin.display(description="Market override", ordering="billing_market_override")
    def billing_market_override_column(self, obj):
        return obj.get_billing_market_override_display()

    @admin.display(description="Effective market")
    def effective_billing_market_column(self, obj):
        return MARKET_LABELS[resolve_billing_market(obj)]

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
                "create-workspace/",
                self.admin_site.admin_view(self.create_workspace_view),
                name="organizations_organization_create_workspace",
            ),
            path(
                "<path:object_id>/account-type/",
                self.admin_site.admin_view(self.account_type_view),
                name="organizations_organization_account_type",
            ),
            path(
                "<path:object_id>/block/",
                self.admin_site.admin_view(self.block_view),
                name="organizations_organization_block",
            ),
            path(
                "<path:object_id>/unblock/",
                self.admin_site.admin_view(self.unblock_view),
                name="organizations_organization_unblock",
            ),
            path(
                "<path:object_id>/plan/",
                self.admin_site.admin_view(self.plan_change_view),
                name="organizations_organization_plan",
            ),
            path(
                "<path:object_id>/billing-market/",
                self.admin_site.admin_view(self.billing_market_view),
                name="organizations_organization_billing_market",
            ),
            path(
                "<path:object_id>/permanent-delete/",
                self.admin_site.admin_view(self.permanent_delete_view),
                name="organizations_organization_permanent_delete",
            ),
        ]
        return extra + urls

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        if request.user.is_staff or request.user.is_superuser:
            extra_context["create_workspace_url"] = reverse(
                "admin:organizations_organization_create_workspace"
            )
        return super().changelist_view(request, extra_context=extra_context)

    def create_workspace_view(self, request):
        """Admin-only create of a real workspace for an existing owner."""
        require_platform_operator(request)
        cancel_url = reverse("admin:organizations_organization_changelist")
        owners = list(eligible_owners_queryset()[:500])
        owner_choices = [(u.pk, u.email) for u in owners]
        selected_owner = (request.POST.get("owner") or request.GET.get("owner") or "").strip()
        selected_market = (
            request.POST.get("billing_market_override")
            or BillingMarketOverride.AUTO
        ).strip().lower()
        if selected_market not in BillingMarketOverride.values:
            selected_market = BillingMarketOverride.AUTO
        as_checkstation = request.POST.get("as_checkstation_account") == "on" or (
            request.method == "GET"
            and request.GET.get("as_checkstation_account") == "1"
        )
        selected_plan = (
            request.POST.get("checkstation_plan") or OrganizationPlan.BASIC
        ).strip().lower()
        if selected_plan not in OrganizationPlan.values:
            selected_plan = OrganizationPlan.BASIC
        posted_label = request.POST.get("internal_label", "")
        posted_reason = request.POST.get("reason", "")

        def _page_context(*, errors=None, form_error=""):
            account_kind = (
                "CheckStation Account (internal / reviewer / test)"
                if as_checkstation
                else "Normal customer workspace"
            )
            plan_note = ""
            if as_checkstation:
                plan_note = (
                    f"\nCheckStation plan: "
                    f"{PLAN_DISPLAY_NAMES.get(selected_plan, selected_plan)}"
                )
            else:
                plan_note = (
                    "\nBuilt-in 7-day Business feature trial grants on create "
                    "(commercially Basic; no Stripe subscription)."
                )
            return {
                **admin.site.each_context(request),
                "opts": Organization._meta,
                "title": "Create workspace",
                "confirm_title": "Create workspace for existing owner?",
                "confirm_lead": (
                    "Creates a real CheckStation Organization using the same "
                    "canonical create path as normal signup. Workspace ID is "
                    "generated automatically. One workspace per owner."
                ),
                "warning": (
                    "No Stripe checkout or paid subscription is created. "
                    "Do not use this for charging customers."
                ),
                "requested_state": (
                    f"Owner: selected below\n"
                    f"Account type: {account_kind}\n"
                    f"Billing market override: "
                    f"{dict(BillingMarketOverride.choices).get(selected_market, selected_market)}"
                    f"{plan_note}"
                ),
                "access_impact": (
                    "Owner gains their single workspace immediately. "
                    "Staff accounts are not created."
                ),
                "billing_impact": (
                    "No Stripe subscription. No charge. "
                    + (
                        "CheckStation Account hides customer Subscription/Billing; "
                        "plan is admin-controlled."
                        if as_checkstation
                        else "Same initial commercial state as normal signup "
                        "(built-in feature trial; commercially Basic)."
                    )
                ),
                "confirm_label": "Create workspace",
                "cancel_url": cancel_url,
                "owner_choices": owner_choices,
                "selected_owner": selected_owner,
                "billing_market_choices": list(BillingMarketOverride.choices),
                "selected_billing_market": selected_market,
                "plan_choices": list(OrganizationPlan.choices),
                "selected_plan": selected_plan,
                "as_checkstation_account": as_checkstation,
                "posted_internal_label": posted_label,
                "posted_reason": posted_reason,
                "errors": errors or {},
                "form_error": form_error,
            }

        if request.method == "POST":
            _user, reason, errors = confirmation_form_errors(request)
            owner = None
            if not selected_owner:
                errors["owner"] = "Select an existing customer account."
            else:
                from accounts.models import User as AccountUser

                owner = AccountUser.objects.filter(pk=selected_owner).first()
                if owner is None:
                    errors["owner"] = "That customer account was not found."

            if not errors:
                try:
                    organization = create_workspace_for_existing_owner(
                        owner=owner,
                        internal_label=posted_label,
                        billing_market_override=selected_market,
                        as_checkstation_account=as_checkstation,
                        checkstation_plan=selected_plan,
                    )
                except WorkspaceAdminCreateError as exc:
                    errors["form"] = str(exc)
                    if exc.code.startswith("owner_"):
                        errors["owner"] = str(exc)
                else:
                    account_label = (
                        "CheckStation Account"
                        if organization.is_checkstation_account
                        else "normal customer"
                    )
                    record_platform_admin_action(
                        request=request,
                        action_type=ACTION.ORGANIZATION_CREATE,
                        reason=reason,
                        target=organization,
                        workspace_id_snapshot=organization.workspace_id,
                        owner_email_snapshot=organization.owner.email,
                        old_value="(none)",
                        new_value=(
                            f"{organization.workspace_id} / {account_label} / "
                            f"{organization.plan}"
                        ),
                        log_message=(
                            f"Created workspace {organization.workspace_id} "
                            f"for {organization.owner.email} ({account_label})."
                        ),
                    )
                    messages.success(
                        request,
                        (
                            f"Created workspace {organization.workspace_id} "
                            f"for {organization.owner.email}."
                        ),
                    )
                    return redirect(
                        reverse(
                            "admin:organizations_organization_change",
                            args=[organization.pk],
                        )
                    )

            return render(
                request,
                CREATE_WORKSPACE_TEMPLATE,
                _page_context(
                    errors=errors,
                    form_error=errors.get("form", ""),
                ),
            )

        return render(
            request,
            CREATE_WORKSPACE_TEMPLATE,
            _page_context(),
        )

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
        if organization is not None:
            extra_context["account_type_label"] = (
                "CheckStation Account"
                if organization.is_checkstation_account
                else "Normal customer"
            )
            extra_context["billing_summary"] = billing_summary_for_admin(organization)
            effective_market = resolve_billing_market(organization)
            extra_context["billing_market_override_label"] = (
                organization.get_billing_market_override_display()
            )
            extra_context["effective_billing_market_label"] = MARKET_LABELS[effective_market]
            extra_context["billing_market_forced"] = (
                organization.billing_market_override != BillingMarketOverride.AUTO
            )
            extra_context["billing_market_mismatch_warning"] = self._market_mismatch_warning(
                organization,
                effective_market,
            )
            extra_context["billing_market_url"] = reverse(
                "admin:organizations_organization_billing_market", args=[object_id]
            )
            extra_context["account_type_url"] = reverse(
                "admin:organizations_organization_account_type", args=[object_id]
            )
            extra_context["block_url"] = reverse(
                "admin:organizations_organization_block", args=[object_id]
            )
            extra_context["unblock_url"] = reverse(
                "admin:organizations_organization_unblock", args=[object_id]
            )
            extra_context["plan_change_url"] = reverse(
                "admin:organizations_organization_plan", args=[object_id]
            )
            if extra_context["show_permanent_delete"]:
                extra_context["permanent_delete_url"] = reverse(
                    "admin:organizations_organization_permanent_delete",
                    args=[object_id],
                )
        extra_context["show_save"] = True
        extra_context["show_save_and_add_another"] = False
        extra_context["show_delete"] = False
        return super().change_view(
            request, object_id, form_url, extra_context=extra_context
        )

    def _market_mismatch_warning(self, organization, effective_market):
        summary = billing_summary_for_admin(organization)
        if not summary["live"] or summary.get("currency") not in {"usd", "jpy"}:
            return ""
        subscription_market = market_for_currency(summary["currency"])
        if subscription_market == effective_market:
            return ""
        return (
            f"Active subscription remains {MARKET_LABELS[subscription_market]}. "
            f"The override resolves new checkout to {MARKET_LABELS[effective_market]}; "
            "the current paid subscription will not be migrated."
        )

    def billing_market_view(self, request, object_id):
        require_platform_operator(request)
        organization = get_object_or_404(Organization, pk=object_id)
        previous = organization.billing_market_override
        target = (
            request.POST.get("target_billing_market")
            or request.GET.get("market")
            or previous
        ).strip().lower()
        valid_targets = set(BillingMarketOverride.values)
        preview = Organization(
            billing_market_override=target if target in valid_targets else previous
        )
        effective = resolve_billing_market(preview)
        warning = self._market_mismatch_warning(organization, effective)
        if not warning and target != BillingMarketOverride.AUTO:
            warning = (
                "Forced billing market. Remember to return this workspace to Auto "
                "when testing is complete."
            )

        errors = {}
        if request.method == "POST":
            _user, reason, errors = confirmation_form_errors(request)
            if target not in valid_targets:
                errors["form"] = "Select Auto, Global, or Japan."
            if not errors:
                if target != previous:
                    organization.billing_market_override = target
                    organization.save(update_fields=["billing_market_override", "updated_at"])
                    effective = resolve_billing_market(organization)
                    record_platform_admin_action(
                        request=request,
                        action_type=ACTION.BILLING_MARKET_OVERRIDE_CHANGE,
                        reason=reason,
                        target=organization,
                        workspace_id_snapshot=organization.workspace_id,
                        owner_email_snapshot=organization.owner.email,
                        old_value=previous,
                        new_value=f"{target} (effective: {effective})",
                        log_message=(
                            f"Billing market override {previous} → {target}; "
                            f"effective market {effective}."
                        ),
                    )
                    messages.success(
                        request,
                        f"Billing market override is now {organization.get_billing_market_override_display()}.",
                    )
                else:
                    messages.info(request, "Billing market override was unchanged.")
                return redirect(_cancel_url(organization))

        context = {
            "title": "Change billing market override",
            "confirm_title": "Change billing market override?",
            "confirm_lead": (
                "This changes new-checkout pricing only. It never migrates an active subscription."
            ),
            "current_state": (
                f"Override: {organization.get_billing_market_override_display()}\n"
                f"Effective: {MARKET_LABELS[resolve_billing_market(organization)]}"
            ),
            "requested_state": (
                f"Override: {dict(BillingMarketOverride.choices).get(target, target)}\n"
                f"Effective: {MARKET_LABELS[effective]}"
            ),
            "access_impact": "No workspace access, language, or entitlement change.",
            "billing_impact": (
                "New checkout and eligible no-subscription pricing use the selected market. "
                "Existing paid subscriptions keep their current currency and Stripe Prices."
            ),
            "warning": warning,
            "confirm_label": "Save billing market override",
            "show_billing_market_select": True,
            "billing_market_choices": list(BillingMarketOverride.choices),
            "extra_hidden": {"target_billing_market": target},
            "errors": errors,
            "form_error": errors.get("form", ""),
        }
        return _render_confirm(request, organization=organization, context=context)

    def account_type_view(self, request, object_id):
        require_platform_operator(request)
        organization = get_object_or_404(Organization, pk=object_id)
        turning_on = not organization.is_checkstation_account
        live_reason = live_subscription_block_reason(organization) if turning_on else ""
        if turning_on:
            current = "Normal customer"
            requested = "CheckStation Account"
            billing_impact = (
                "Subscription and Billing will disappear for the customer. "
                "No Stripe subscription will be created. Promotions will not apply."
            )
            access_impact = "Owner, staff, and kiosk keep working. Plan stays as currently set."
            warning = live_reason or (
                "Turning this ON hides customer Subscription/Billing and makes "
                "plan an internal CheckStation setting."
            )
            confirm_label = "Turn CheckStation Account ON"
        else:
            current = "CheckStation Account"
            requested = "Normal customer (Basic, no subscription)"
            billing_impact = (
                "Workspace becomes a normal Basic account with no WorkspaceSubscription. "
                "The customer may subscribe later. Unpaid Plus/Business is not preserved."
            )
            access_impact = "Access stays as it is. Subscription and Billing tabs reappear."
            warning = (
                "Turning OFF resets the effective plan to Basic and restores "
                "normal commercial billing."
            )
            confirm_label = "Turn CheckStation Account OFF"

        if request.method == "POST":
            _user, reason, errors = confirmation_form_errors(request)
            if live_reason and turning_on:
                errors["form"] = live_reason
            if not errors:
                try:
                    if turning_on:
                        turn_checkstation_account_on(organization)
                        action = ACTION.CHECKSTATION_ACCOUNT_ON
                    else:
                        turn_checkstation_account_off(organization)
                        action = ACTION.CHECKSTATION_ACCOUNT_OFF
                except BillingStateError as exc:
                    errors["form"] = str(exc)
                else:
                    organization.refresh_from_db()
                    record_platform_admin_action(
                        request=request,
                        action_type=action,
                        reason=reason,
                        target=organization,
                        workspace_id_snapshot=organization.workspace_id,
                        owner_email_snapshot=organization.owner.email,
                        old_value=current,
                        new_value=requested,
                        log_message=f"Account type: {current} → {requested}.",
                    )
                    messages.success(request, f"Account type is now {requested}.")
                    return redirect(_cancel_url(organization))
            return _render_confirm(
                request,
                organization=organization,
                context={
                    "title": "Change account type",
                    "confirm_title": "Change account type?",
                    "current_state": current,
                    "requested_state": requested,
                    "access_impact": access_impact,
                    "billing_impact": billing_impact,
                    "warning": warning,
                    "confirm_label": confirm_label,
                    "errors": errors,
                    "form_error": errors.get("form", ""),
                },
            )

        return _render_confirm(
            request,
            organization=organization,
            context={
                "title": "Change account type",
                "confirm_title": "Change account type?",
                "current_state": current,
                "requested_state": requested,
                "access_impact": access_impact,
                "billing_impact": billing_impact,
                "warning": warning,
                "confirm_label": confirm_label,
            },
        )

    def block_view(self, request, object_id):
        require_platform_operator(request)
        organization = get_object_or_404(Organization, pk=object_id)
        if organization.status != OrganizationStatus.ACTIVE:
            messages.error(request, "Only an active workspace can be blocked.")
            return redirect(_cancel_url(organization))
        summary = billing_summary_for_admin(organization)
        if organization.is_checkstation_account:
            billing_impact = "No billing changes are required."
            warning = None
        elif summary["live"]:
            billing_impact = (
                "Blocking immediately removes workspace access.\n"
                "The current paid period will not be refunded.\n"
                "The subscription will be scheduled to cancel at the end of the "
                "current paid period so no new renewal is charged."
            )
            warning = billing_impact
        else:
            billing_impact = "No live paid subscription. Access stops; billing stays none."
            warning = None

        if request.method == "POST":
            _user, reason, errors = confirmation_form_errors(request)
            if not errors:
                try:
                    block_organization(organization)
                except BillingStateError as exc:
                    errors["form"] = str(exc)
                else:
                    organization.refresh_from_db()
                    record_platform_admin_action(
                        request=request,
                        action_type=ACTION.ORGANIZATION_BLOCK,
                        reason=reason,
                        target=organization,
                        workspace_id_snapshot=organization.workspace_id,
                        owner_email_snapshot=organization.owner.email,
                        old_value="active",
                        new_value="blocked",
                        log_message="Blocked organization.",
                    )
                    messages.success(
                        request,
                        f"Workspace {organization.workspace_id} is blocked.",
                    )
                    return redirect(_cancel_url(organization))
            return _render_confirm(
                request,
                organization=organization,
                context=self._block_context(
                    organization, summary, billing_impact, warning, errors
                ),
            )

        return _render_confirm(
            request,
            organization=organization,
            context=self._block_context(
                organization, summary, billing_impact, warning, {}
            ),
        )

    def _block_context(self, organization, summary, billing_impact, warning, errors):
        return {
            "title": "Block workspace",
            "confirm_title": "Block this workspace?",
            "current_state": (
                f"Status: {organization.get_status_display()}\n"
                f"Account: {'CheckStation Account' if organization.is_checkstation_account else 'Normal customer'}\n"
                f"Billing: {summary['status']} {summary['plan']} {summary['interval'] or ''}"
            ),
            "requested_state": "Blocked (platform-enforced access restriction)",
            "access_impact": (
                "Owner workspace login, staff login, existing staff sessions, "
                "kiosk, and workspace APIs stop immediately. Data is kept."
            ),
            "billing_impact": billing_impact,
            "warning": warning,
            "confirm_label": "Block workspace",
            "danger": True,
            "errors": errors,
            "form_error": errors.get("form", ""),
        }

    def unblock_view(self, request, object_id):
        require_platform_operator(request)
        organization = get_object_or_404(Organization, pk=object_id)
        if organization.status != OrganizationStatus.BLOCKED:
            messages.error(request, "Only a blocked workspace can be reactivated this way.")
            return redirect(_cancel_url(organization))
        summary = billing_summary_for_admin(organization)
        if organization.is_checkstation_account:
            requested = "Active. CheckStation plan is preserved."
            billing_impact = "No billing changes."
        elif summary["live"] and summary["cancel_at_period_end"]:
            requested = (
                "Active. The scheduled cancellation will be resumed so the "
                "same subscription continues and the next renewal proceeds."
            )
            billing_impact = "Resume cancel-at-period-end on the existing subscription."
        else:
            requested = (
                "Active as a normal Basic account with no paid subscription. "
                "The customer may subscribe again."
            )
            billing_impact = "Paid access has ended or was never present. Effective plan becomes Basic."

        if request.method == "POST":
            _user, reason, errors = confirmation_form_errors(request)
            if not errors:
                try:
                    unblock_organization(organization)
                except BillingStateError as exc:
                    errors["form"] = str(exc)
                else:
                    organization.refresh_from_db()
                    record_platform_admin_action(
                        request=request,
                        action_type=ACTION.ORGANIZATION_UNBLOCK,
                        reason=reason,
                        target=organization,
                        workspace_id_snapshot=organization.workspace_id,
                        owner_email_snapshot=organization.owner.email,
                        old_value="blocked",
                        new_value="active",
                        log_message="Unblocked organization.",
                    )
                    messages.success(
                        request,
                        f"Workspace {organization.workspace_id} is active again.",
                    )
                    return redirect(_cancel_url(organization))
            return _render_confirm(
                request,
                organization=organization,
                context=self._unblock_context(
                    organization, requested, billing_impact, errors
                ),
            )

        return _render_confirm(
            request,
            organization=organization,
            context=self._unblock_context(
                organization, requested, billing_impact, {}
            ),
        )

    def _unblock_context(self, organization, requested, billing_impact, errors):
        return {
            "title": "Reactivate workspace",
            "confirm_title": "Reactivate this workspace?",
            "current_state": "Blocked",
            "requested_state": requested,
            "access_impact": "Owner, staff, kiosk, and workspace APIs work again.",
            "billing_impact": billing_impact,
            "confirm_label": "Reactivate workspace",
            "errors": errors,
            "form_error": errors.get("form", ""),
        }

    def plan_change_view(self, request, object_id):
        require_platform_operator(request)
        organization = get_object_or_404(Organization, pk=object_id)
        if not organization.is_checkstation_account:
            messages.error(
                request,
                "Manual plan changes are only available for CheckStation Accounts.",
            )
            return redirect(_cancel_url(organization))
        target = (
            request.POST.get("target_plan")
            or request.GET.get("plan")
            or organization.plan
        ).strip().lower()
        labels = PLAN_DISPLAY_NAMES
        extra_hidden = {"target_plan": target}

        if request.method == "POST":
            _user, reason, errors = confirmation_form_errors(request)
            if target not in OrganizationPlan.values:
                errors["form"] = "Select Basic, Plus, or Business."
            if not errors:
                try:
                    previous = organization.plan
                    change_checkstation_plan(organization, target)
                except (BillingStateError, ValueError) as exc:
                    errors["form"] = str(exc)
                else:
                    organization.refresh_from_db()
                    record_platform_admin_action(
                        request=request,
                        action_type=ACTION.CHECKSTATION_PLAN_CHANGE,
                        reason=reason,
                        target=organization,
                        workspace_id_snapshot=organization.workspace_id,
                        owner_email_snapshot=organization.owner.email,
                        old_value=previous,
                        new_value=target,
                        log_message=f"CheckStation plan {previous} → {target}.",
                    )
                    messages.success(
                        request,
                        f"Plan is now {labels.get(target, target)}.",
                    )
                    return redirect(_cancel_url(organization))
            return _render_confirm(
                request,
                organization=organization,
                context=self._plan_context(
                    organization, target, extra_hidden, errors
                ),
            )

        return _render_confirm(
            request,
            organization=organization,
            context=self._plan_context(organization, target, extra_hidden, {}),
        )

    def _plan_context(self, organization, target, extra_hidden, errors):
        labels = PLAN_DISPLAY_NAMES
        choices = " / ".join(
            f"{labels.get(key, key)} ({key})" for key in OrganizationPlan.values
        )
        return {
            "title": "Change CheckStation plan",
            "confirm_title": "Change CheckStation plan?",
            "confirm_lead": f"Target plan is submitted as a hidden field. Allowed: {choices}.",
            "current_state": labels.get(organization.plan, organization.plan),
            "requested_state": labels.get(target, target),
            "access_impact": (
                "Normal plan feature and quantity limits apply immediately. "
                "Plan locks recalculate. No Stripe call."
            ),
            "billing_impact": "No customer subscription. No WorkspaceSubscription is created.",
            "confirm_label": f"Set plan to {labels.get(target, target)}",
            "show_plan_select": True,
            "plan_choices": list(OrganizationPlan.choices),
            "extra_hidden": extra_hidden,
            "errors": errors,
            "form_error": errors.get("form", ""),
        }

    def permanent_delete_view(self, request, object_id):
        require_superuser(request)
        organization = get_object_or_404(Organization, pk=object_id)
        cancel_url = _cancel_url(organization)
        owner = organization.owner
        if owner.is_staff or owner.is_superuser:
            messages.error(
                request,
                "Platform operator accounts cannot be permanently deleted this way.",
            )
            return redirect(cancel_url)

        live_reason = live_subscription_block_reason(organization)
        counts = tenant_record_counts(organization)
        summary = (
            f"Workspace {organization.workspace_id} / {owner.email}\n"
            f"Members: {counts['members']}\n"
            f"Groups: {counts['groups']}\n"
            f"Classes/sections: {counts['sections']}\n"
            f"Staff accounts: {counts['staff_accounts']}\n"
            f"Action records: {counts['action_records']}\n"
            f"Kiosk designs/settings: {counts['kiosk_designs']}/{counts['kiosk_settings']}\n"
            f"Email senders/deliveries: {counts['email_senders']}/{counts['email_deliveries']}"
        )
        warning = (
            "This cannot be undone. Attendance/action history will be destroyed. "
            "Tenant data will be destroyed. The owner User will also be deleted. "
            "This is not archive, and it is not a refund."
        )
        if live_reason:
            warning = live_reason + " Permanent deletion is refused until billing is ended."

        if request.method == "POST":
            _user, reason, errors = confirmation_form_errors(
                request, require_typed_delete=True
            )
            if live_reason:
                errors["form"] = live_reason
            if not errors:
                workspace_id = organization.workspace_id
                email = owner.email
                try:
                    permanently_delete_customer_account(
                        owner,
                        require_no_live_subscription=True,
                    )
                except PermanentDeletionError as exc:
                    errors["form"] = exc.messages[0] if exc.messages else str(exc)
                else:
                    record_platform_admin_action(
                        request=request,
                        action_type=ACTION.ORGANIZATION_PERMANENT_DELETE,
                        reason=reason,
                        target_kind="organizations.Organization",
                        target_id_snapshot=str(object_id),
                        workspace_id_snapshot=workspace_id,
                        owner_email_snapshot=email,
                        old_value="existed",
                        new_value="deleted",
                    )
                    messages.success(
                        request,
                        (
                            f"Permanently deleted workspace {workspace_id} "
                            f"and customer account {email}."
                        ),
                    )
                    return redirect("admin:organizations_organization_changelist")
            return _render_confirm(
                request,
                organization=organization,
                context={
                    "title": "Permanently delete workspace",
                    "confirm_title": "Permanently delete this workspace?",
                    "current_state": summary,
                    "requested_state": "Workspace, tenant data, and owner User permanently deleted.",
                    "access_impact": "All access ends. The email may be registered again.",
                    "billing_impact": live_reason
                    or "No live paid subscription on file.",
                    "warning": warning,
                    "confirm_label": "Permanently delete this workspace",
                    "require_typed_delete": True,
                    "danger": True,
                    "errors": errors,
                    "form_error": errors.get("form", ""),
                },
            )

        return _render_confirm(
            request,
            organization=organization,
            context={
                "title": "Permanently delete workspace",
                "confirm_title": "Permanently delete this workspace?",
                "current_state": summary,
                "requested_state": "Workspace, tenant data, and owner User permanently deleted.",
                "access_impact": "All access ends. The email may be registered again.",
                "billing_impact": live_reason or "No live paid subscription on file.",
                "warning": warning,
                "confirm_label": "Permanently delete this workspace",
                "require_typed_delete": True,
                "danger": True,
            },
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
