"""Platform-admin creation of a workspace for an existing owner User.

Reuses Organization.objects.create_with_owner (canonical create path) so
workspace_id generation and the built-in Business feature trial signal run
exactly as on normal signup. Optional CheckStation Account conversion uses
existing lifecycle helpers — never creates Stripe subscriptions.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

from organizations.lifecycle import (
    CheckStationAccountError,
    change_checkstation_plan,
    turn_checkstation_account_on,
)
from organizations.models import (
    BillingMarketOverride,
    Organization,
    OrganizationPlan,
)

User = get_user_model()


class WorkspaceAdminCreateError(Exception):
    """Validation / rule failure for admin workspace creation."""

    def __init__(self, message, *, code="invalid"):
        super().__init__(message)
        self.code = code


def owner_already_has_workspace(owner) -> bool:
    return Organization.objects.filter(owner_id=owner.pk).exists()


def validate_owner_eligible_for_workspace(owner) -> None:
    if owner is None or not isinstance(owner, User):
        raise WorkspaceAdminCreateError(
            "Select an existing customer account.",
            code="owner_required",
        )
    if not getattr(owner, "is_active", False):
        raise WorkspaceAdminCreateError(
            "That account is inactive.",
            code="owner_inactive",
        )
    if getattr(owner, "is_staff", False) or getattr(owner, "is_superuser", False):
        raise WorkspaceAdminCreateError(
            "Platform operator accounts cannot own a customer workspace.",
            code="owner_platform_operator",
        )
    if not getattr(owner, "email_verified", False):
        raise WorkspaceAdminCreateError(
            "The owner email must be verified before a workspace can be created.",
            code="owner_email_unverified",
        )
    if owner_already_has_workspace(owner):
        raise WorkspaceAdminCreateError(
            "This owner already has a workspace. CheckStation allows one "
            "workspace per owner.",
            code="owner_has_workspace",
        )


def eligible_owners_queryset():
    """Customer Users that may receive a new workspace (no org yet)."""
    return (
        User.objects.filter(
            is_active=True,
            is_staff=False,
            is_superuser=False,
            email_verified=True,
            owned_organization__isnull=True,
        )
        .order_by("email")
    )


@transaction.atomic
def create_workspace_for_existing_owner(
    *,
    owner,
    internal_label="",
    billing_market_override=BillingMarketOverride.AUTO,
    as_checkstation_account=False,
    checkstation_plan=OrganizationPlan.BASIC,
):
    """
    Create one real Organization for an existing paying owner.

    Normal path (as_checkstation_account=False):
      create_with_owner → post_save grants built-in Business feature trial
      (commercial Basic; no Stripe subscription).

    CheckStation Account path:
      create_with_owner → turn_checkstation_account_on (closes trial grant;
      hides customer billing) → optional change_checkstation_plan.
      Still no Stripe subscription.
    """
    validate_owner_eligible_for_workspace(owner)

    market = (billing_market_override or BillingMarketOverride.AUTO).strip().lower()
    if market not in BillingMarketOverride.values:
        raise WorkspaceAdminCreateError(
            "Select Auto, Global, or Japan for the billing market override.",
            code="invalid_billing_market",
        )

    plan = (checkstation_plan or OrganizationPlan.BASIC).strip().lower()
    if as_checkstation_account and plan not in OrganizationPlan.values:
        raise WorkspaceAdminCreateError(
            "Select Basic, Plus, or Business for the CheckStation plan.",
            code="invalid_plan",
        )

    try:
        organization = Organization.objects.create_with_owner(
            owner=owner,
            internal_label=(internal_label or "").strip(),
            billing_market_override=market,
        )
    except IntegrityError as exc:
        raise WorkspaceAdminCreateError(
            "This owner already has a workspace. CheckStation allows one "
            "workspace per owner.",
            code="owner_has_workspace",
        ) from exc

    if as_checkstation_account:
        try:
            turn_checkstation_account_on(organization)
            if plan != OrganizationPlan.BASIC:
                change_checkstation_plan(organization, plan)
            elif organization.plan != OrganizationPlan.BASIC:
                # After trial grant, effective plan may be Business until
                # CheckStation ON closes the trial; ensure Basic when requested.
                change_checkstation_plan(organization, OrganizationPlan.BASIC)
        except CheckStationAccountError as exc:
            raise WorkspaceAdminCreateError(str(exc), code=getattr(exc, "code", "checkstation")) from exc

    organization.refresh_from_db()
    return organization
