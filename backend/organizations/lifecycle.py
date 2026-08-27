"""Platform-admin Organization lifecycle: CheckStation Account, block, unblock.

Billing/Stripe calls stay in billing.operations. This module decides when
those operations run and what Organization status/plan should become.
"""

from __future__ import annotations

import logging

from django.db import transaction

from billing.exceptions import BillingStateError
from billing.models import BillingStatus, PurchaseSource, WorkspaceSubscription
from billing.services import (
    apply_due_billing_transitions,
    get_workspace_billing,
)
from organizations.entitlements.catalog import PLAN_BASIC
from organizations.entitlements.transitions import apply_effective_plan
from organizations.models import Organization, OrganizationStatus

logger = logging.getLogger("organizations.lifecycle")

LIVE_BILLING_STATUSES = frozenset(
    {
        BillingStatus.TRIALING,
        BillingStatus.ACTIVE,
        BillingStatus.PAST_DUE,
    }
)

CheckStationAccountError = BillingStateError


def organization_has_live_subscription(organization) -> bool:
    billing = get_workspace_billing(organization)
    if billing is None:
        return False
    return billing.status in LIVE_BILLING_STATUSES


def live_subscription_block_reason(organization) -> str:
    """Human-readable reason if a live commercial subscription exists."""
    billing = get_workspace_billing(organization)
    if billing is None:
        return ""
    if billing.status not in LIVE_BILLING_STATUSES:
        return ""
    source = billing.purchase_source or PurchaseSource.NONE
    plan = billing.subscribed_plan or organization.plan
    interval = billing.billing_interval or ""
    return (
        f"This workspace still has a live {source} subscription "
        f"({billing.status}, {plan} {interval}). "
        "Handle or end the paid subscription first."
    )


def _delete_workspace_subscription(organization):
    WorkspaceSubscription.objects.filter(organization_id=organization.pk).delete()


def _invalidate_staff_sessions(organization):
    from accounts.deletion import invalidate_staff_sessions_for_organization

    invalidate_staff_sessions_for_organization(organization.pk)


@transaction.atomic
def turn_checkstation_account_on(organization):
    """Enable CheckStation Account. Refuses while a live subscription exists."""
    org = Organization.objects.select_for_update().get(pk=organization.pk)
    if org.is_checkstation_account:
        return org
    reason = live_subscription_block_reason(org)
    if reason:
        raise CheckStationAccountError(reason, code="live_subscription")
    _delete_workspace_subscription(org)
    org.is_checkstation_account = True
    org.save(update_fields=["is_checkstation_account", "updated_at"])
    from billing.builtin_trial import close_builtin_trial_for_checkstation

    close_builtin_trial_for_checkstation(org)
    org.refresh_from_db()
    return org


@transaction.atomic
def turn_checkstation_account_off(organization):
    """Return to a normal Basic customer with no WorkspaceSubscription."""
    org = Organization.objects.select_for_update().get(pk=organization.pk)
    if not org.is_checkstation_account:
        apply_effective_plan(org, PLAN_BASIC, source="platform_admin.checkstation_off")
        _delete_workspace_subscription(org)
        org.refresh_from_db()
        return org
    apply_effective_plan(org, PLAN_BASIC, source="platform_admin.checkstation_off")
    _delete_workspace_subscription(org)
    org.is_checkstation_account = False
    org.save(update_fields=["is_checkstation_account", "updated_at"])
    org.refresh_from_db()
    return org


@transaction.atomic
def change_checkstation_plan(organization, target_plan):
    org = Organization.objects.select_for_update().get(pk=organization.pk)
    if not org.is_checkstation_account:
        raise CheckStationAccountError(
            "Manual plan changes are only available for CheckStation Accounts.",
            code="not_checkstation_account",
        )
    apply_effective_plan(org, target_plan, source="platform_admin.checkstation_plan")
    org.refresh_from_db()
    return org


def schedule_block_cancellation(organization):
    """Schedule period-end cancellation for a live Stripe (or local) subscription.

    No refund. Access is stopped separately by setting Organization.status.
    """
    from billing.operations import request_cancellation
    from billing.services import schedule_cancellation

    billing = get_workspace_billing(organization)
    if billing is None or billing.status not in LIVE_BILLING_STATUSES:
        return None
    if billing.cancel_at_period_end:
        return billing
    if billing.purchase_source == PurchaseSource.STRIPE:
        if not billing.external_subscription_id:
            raise CheckStationAccountError(
                "This workspace has a live Stripe subscription without a "
                "subscription ID on file. Handle billing before blocking.",
                code="stripe_subscription_id_missing",
            )
        return request_cancellation(organization)
    return schedule_cancellation(organization)


@transaction.atomic
def block_organization(organization):
    """Stop workspace access immediately. Schedule paid cancellation if needed."""
    org = Organization.objects.select_for_update().get(pk=organization.pk)
    if org.status == OrganizationStatus.ARCHIVED:
        raise CheckStationAccountError(
            "Archived workspaces cannot be blocked. Restore or leave archived.",
            code="archived",
        )
    if org.status == OrganizationStatus.BLOCKED:
        return org
    if not org.is_checkstation_account:
        schedule_block_cancellation(org)
    org.block()
    _invalidate_staff_sessions(org)
    org.refresh_from_db()
    return org


@transaction.atomic
def unblock_organization(organization):
    """Restore access. Resume Stripe cancel-at-period-end if still in the paid period."""
    from billing.operations import request_resume_subscription

    org = Organization.objects.select_for_update().get(pk=organization.pk)
    if org.status != OrganizationStatus.BLOCKED:
        raise CheckStationAccountError(
            "Only a blocked workspace can be reactivated this way.",
            code="not_blocked",
        )
    if org.is_checkstation_account:
        org.unblock()
        org.refresh_from_db()
        return org

    billing = get_workspace_billing(org)
    if billing is not None:
        try:
            apply_due_billing_transitions(org)
        except BillingStateError:
            logger.info(
                "Billing transition skipped while unblocking organization_id=%s",
                org.pk,
            )
        org.refresh_from_db()
        billing = get_workspace_billing(org)

    if (
        billing is not None
        and billing.status in LIVE_BILLING_STATUSES
        and billing.cancel_at_period_end
        and billing.purchase_source == PurchaseSource.STRIPE
    ):
        request_resume_subscription(org)
    elif billing is None or billing.status not in LIVE_BILLING_STATUSES:
        apply_effective_plan(org, PLAN_BASIC, source="platform_admin.unblock_after_end")

    org.unblock()
    org.refresh_from_db()
    return org


def tenant_record_counts(organization) -> dict:
    from attendance.models import ActionRecord
    from groups.email_sender_models import GroupEmailDelivery, GroupEmailSender
    from groups.models import Group, GroupMembership, GroupOnlyParticipant, GroupSection
    from kiosk_builder.models import KioskDesign, KioskSettings
    from members.models import Member
    from organizations.models import WorkspaceStaffAccount

    org_id = organization.pk
    return {
        "members": Member.objects.filter(organization_id=org_id).count(),
        "groups": Group.objects.filter(organization_id=org_id).count(),
        "sections": GroupSection.objects.filter(organization_id=org_id).count(),
        "group_memberships": GroupMembership.objects.filter(organization_id=org_id).count(),
        "group_only_participants": GroupOnlyParticipant.objects.filter(
            organization_id=org_id
        ).count(),
        "staff_accounts": WorkspaceStaffAccount.objects.filter(
            organization_id=org_id
        ).count(),
        "action_records": ActionRecord.objects.filter(organization_id=org_id).count(),
        "kiosk_designs": KioskDesign.objects.filter(organization_id=org_id).count(),
        "kiosk_settings": KioskSettings.objects.filter(organization_id=org_id).count(),
        "email_senders": GroupEmailSender.objects.filter(organization_id=org_id).count(),
        "email_deliveries": GroupEmailDelivery.objects.filter(organization_id=org_id).count(),
    }


def billing_summary_for_admin(organization) -> dict:
    billing = get_workspace_billing(organization)
    if organization.is_checkstation_account:
        return {
            "account_type": "CheckStation Account",
            "managed_by_checkstation": True,
            "source": "none",
            "status": "none",
            "plan": organization.plan,
            "interval": None,
            "period_end": None,
            "cancel_at_period_end": False,
            "pending_plan": None,
            "live": False,
        }
    if billing is None:
        return {
            "account_type": "Normal customer",
            "managed_by_checkstation": False,
            "source": "none",
            "status": "none",
            "plan": organization.plan,
            "interval": None,
            "period_end": None,
            "cancel_at_period_end": False,
            "pending_plan": None,
            "live": False,
        }
    return {
        "account_type": "Normal customer",
        "managed_by_checkstation": False,
        "source": billing.purchase_source,
        "status": billing.status,
        "plan": billing.subscribed_plan or organization.plan,
        "interval": billing.billing_interval
        if billing.billing_interval != "none"
        else None,
        "period_end": billing.current_period_end or billing.trial_ends_at,
        "cancel_at_period_end": bool(billing.cancel_at_period_end),
        "pending_plan": billing.pending_plan or None,
        "live": billing.status in LIVE_BILLING_STATUSES,
    }
