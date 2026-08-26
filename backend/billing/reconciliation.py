"""Map a provider subscription snapshot onto internal billing services."""

from __future__ import annotations

from django.utils import timezone

from billing.exceptions import BillingStateError
from billing.models import BillingStatus, PurchaseSource, WorkspaceSubscription
from billing.prices import plan_interval_for_price_id
from billing.services import (
    activate_paid_subscription,
    apply_successful_upgrade,
    finalize_subscription_end,
    get_workspace_billing,
    lock_workspace_billing,
    mark_payment_failure,
    mark_payment_recovered,
    schedule_cancellation,
    scheduled_change_pending,
    start_trial,
)
from organizations.entitlements.transitions import apply_effective_plan
from organizations.models import Organization, OrganizationPlan

ENDED_STATUSES = frozenset({"canceled", "unpaid", "incomplete_expired"})


def resolve_organization_from_mapping(
    *,
    metadata=None,
    client_reference_id="",
    customer_id="",
    subscription_id="",
):
    metadata = metadata or {}
    candidates = []

    org_id = str(metadata.get("organization_id") or client_reference_id or "").strip()
    if org_id.isdigit():
        meta_org = Organization.objects.filter(pk=int(org_id)).first()
        if meta_org is not None:
            candidates.append(("metadata", meta_org))

    if subscription_id:
        billing = WorkspaceSubscription.objects.filter(
            external_subscription_id=subscription_id
        ).select_related("organization").first()
        if billing is not None:
            candidates.append(("subscription", billing.organization))

    if customer_id:
        billing = WorkspaceSubscription.objects.filter(
            external_customer_id=customer_id
        ).select_related("organization").first()
        if billing is not None:
            candidates.append(("customer", billing.organization))

    if not candidates:
        raise BillingStateError(
            "Stripe object could not be mapped to a workspace.",
            code="stripe_tenant_unmapped",
        )

    org = candidates[0][1]
    for _source, other in candidates[1:]:
        if other.pk != org.pk:
            raise BillingStateError(
                "Stripe tenant references disagree across metadata and stored IDs.",
                code="stripe_tenant_mismatch",
            )

    workspace_id = str(metadata.get("workspace_id") or "").strip()
    if workspace_id and org.workspace_id != workspace_id:
        raise BillingStateError(
            "Stripe workspace metadata does not match the Organization.",
            code="stripe_tenant_mismatch",
        )
    return org


def _store_provider_ids(organization, snapshot):
    _org, billing = lock_workspace_billing(organization)
    billing.purchase_source = PurchaseSource.STRIPE
    billing.external_customer_id = snapshot.customer_id or billing.external_customer_id
    billing.external_subscription_id = (
        snapshot.subscription_id or billing.external_subscription_id
    )
    billing.save(
        update_fields=[
            "purchase_source",
            "external_customer_id",
            "external_subscription_id",
            "updated_at",
        ]
    )
    return billing


def reconcile_subscription_snapshot(organization, snapshot, *, now=None):
    """Converge internal billing to the provider snapshot without double-applying.

    Organization.plan changes only through billing services / apply_effective_plan.
    """
    moment = now or timezone.now()
    _store_provider_ids(organization, snapshot)
    organization.refresh_from_db()

    # Ended provider states must finalize even if Price ID mapping is missing.
    if snapshot.status in ENDED_STATUSES:
        period_end = snapshot.current_period_end
        if (
            snapshot.cancel_at_period_end
            and period_end is not None
            and period_end > moment
        ):
            schedule_cancellation(organization, effective_at=period_end)
            return get_workspace_billing(organization)
        return finalize_subscription_end(organization, ended_at=moment, now=moment)

    mapped = plan_interval_for_price_id(snapshot.price_id)
    if mapped is None:
        raise BillingStateError(
            "Stripe Price ID is not mapped to a Check Station plan.",
            code="stripe_price_unmapped",
        )
    plan_key, interval = mapped

    if snapshot.status == "past_due":
        mark_payment_failure(organization, failed_at=moment, now=moment)
        return get_workspace_billing(organization)

    billing = get_workspace_billing(organization)
    if billing and billing.status == BillingStatus.PAST_DUE:
        mark_payment_recovered(organization, recovered_at=moment, now=moment)
        organization.refresh_from_db()

    if snapshot.status == "trialing":
        start_trial(
            organization,
            billing_interval=interval,
            trial_started_at=snapshot.trial_start or snapshot.current_period_start,
            trial_ends_at=snapshot.trial_end or snapshot.current_period_end,
            purchase_source=PurchaseSource.STRIPE,
            payment_method_recorded=True,
            external_customer_id=snapshot.customer_id,
            external_subscription_id=snapshot.subscription_id,
            now=moment,
        )
        if snapshot.cancel_at_period_end:
            schedule_cancellation(
                organization,
                effective_at=snapshot.trial_end or snapshot.current_period_end,
            )
        return get_workspace_billing(organization)

    billing = get_workspace_billing(organization)
    pending_change = scheduled_change_pending(billing)
    pending_target_interval = (
        (billing.pending_interval or billing.billing_interval) if billing else None
    )
    pending_downgrade = bool(
        billing
        and billing.pending_plan == OrganizationPlan.PLUS
        and billing.subscribed_plan == OrganizationPlan.BUSINESS
        and pending_target_interval == billing.billing_interval
        and not billing.cancel_at_period_end
    )

    if pending_change and billing and snapshot.current_period_end and snapshot.current_period_end > moment:
        target_plan = billing.pending_plan or billing.subscribed_plan
        target_interval = billing.pending_interval or billing.billing_interval
        current_pair = (billing.subscribed_plan, billing.billing_interval)
        snapshot_pair = (plan_key, interval)
        target_pair = (target_plan, target_interval)

        if snapshot_pair == current_pair:
            _org, billing = lock_workspace_billing(organization)
            billing.current_period_start = snapshot.current_period_start
            billing.current_period_end = snapshot.current_period_end
            billing.external_subscription_id = snapshot.subscription_id
            billing.external_customer_id = snapshot.customer_id
            billing.save(
                update_fields=[
                    "current_period_start",
                    "current_period_end",
                    "external_subscription_id",
                    "external_customer_id",
                    "updated_at",
                ]
            )
            if snapshot.cancel_at_period_end:
                schedule_cancellation(organization, effective_at=snapshot.current_period_end)
            return get_workspace_billing(organization)

        if snapshot_pair != target_pair:
            return billing

    if plan_key == OrganizationPlan.PLUS and organization.plan == OrganizationPlan.BUSINESS:
        if pending_downgrade and snapshot.current_period_end and snapshot.current_period_end > moment:
            # Stripe still collecting Business until period end.
            return billing
        apply_effective_plan(
            organization, OrganizationPlan.PLUS, source="billing.reconcile_downgrade"
        )
        activate_paid_subscription(
            organization,
            subscribed_plan=plan_key,
            billing_interval=interval,
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=snapshot.current_period_start,
            current_period_end=snapshot.current_period_end,
            external_customer_id=snapshot.customer_id,
            external_subscription_id=snapshot.subscription_id,
            now=moment,
        )
        return get_workspace_billing(organization)

    if plan_key == OrganizationPlan.BUSINESS and organization.plan == OrganizationPlan.PLUS:
        apply_successful_upgrade(
            organization,
            target_plan=OrganizationPlan.BUSINESS,
            current_period_start=snapshot.current_period_start,
            current_period_end=snapshot.current_period_end,
            external_subscription_id=snapshot.subscription_id,
            now=moment,
        )
        return get_workspace_billing(organization)

    if pending_change and plan_key != organization.plan and snapshot.current_period_end and snapshot.current_period_end > moment:
        if (plan_key, interval) != (
            billing.pending_plan or billing.subscribed_plan,
            billing.pending_interval or billing.billing_interval,
        ):
            return billing

    if pending_downgrade and plan_key == OrganizationPlan.BUSINESS:
        _org, billing = lock_workspace_billing(organization)
        billing.current_period_start = snapshot.current_period_start
        billing.current_period_end = snapshot.current_period_end
        billing.external_subscription_id = snapshot.subscription_id
        billing.external_customer_id = snapshot.customer_id
        billing.save(
            update_fields=[
                "current_period_start",
                "current_period_end",
                "external_subscription_id",
                "external_customer_id",
                "updated_at",
            ]
        )
        if snapshot.cancel_at_period_end:
            schedule_cancellation(organization, effective_at=snapshot.current_period_end)
        return get_workspace_billing(organization)

    activate_paid_subscription(
        organization,
        subscribed_plan=plan_key,
        billing_interval=interval,
        purchase_source=PurchaseSource.STRIPE,
        current_period_start=snapshot.current_period_start,
        current_period_end=snapshot.current_period_end,
        external_customer_id=snapshot.customer_id,
        external_subscription_id=snapshot.subscription_id,
        now=moment,
    )
    if snapshot.cancel_at_period_end:
        schedule_cancellation(organization, effective_at=snapshot.current_period_end)
    return get_workspace_billing(organization)
