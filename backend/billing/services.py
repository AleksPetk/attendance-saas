"""Provider-neutral billing state transitions.

These services do not call payment providers. They record commercial state
and apply Organization.plan only through apply_effective_plan().
"""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from billing.catalog import (
    PAID_INTERVALS,
    PAID_PLAN_KEYS,
    PAYMENT_GRACE_DAYS,
    PLAN_BUSINESS,
    PLAN_PLUS,
)
from billing.exceptions import BillingStateError
from billing.models import (
    BillingInterval,
    BillingStatus,
    PurchaseSource,
    WorkspaceSubscription,
)
from organizations.entitlements.catalog import PLAN_BASIC
from organizations.entitlements.transitions import apply_effective_plan
from organizations.models import Organization, OrganizationPlan

_PAID_STATUSES = frozenset({BillingStatus.ACTIVE, BillingStatus.PAST_DUE})
_ACCESS_STATUSES = frozenset(
    {BillingStatus.TRIALING, BillingStatus.ACTIVE, BillingStatus.PAST_DUE}
)


def _now(now):
    return now if now is not None else timezone.now()


def _require_paid_plan(plan_key: str) -> str:
    key = str(plan_key or "").strip().lower()
    if key not in PAID_PLAN_KEYS:
        raise BillingStateError(f"Expected a paid plan, got {plan_key!r}.")
    return key


def _require_interval(interval: str) -> str:
    key = str(interval or "").strip().lower()
    if key not in PAID_INTERVALS:
        raise BillingStateError(f"Expected monthly or yearly, got {interval!r}.")
    return key


def _require_purchase_source(source: str) -> str:
    key = str(source or "").strip().lower()
    if key not in {PurchaseSource.STRIPE, PurchaseSource.APPLE}:
        raise BillingStateError(
            "A paid purchase source (stripe or apple) is required."
        )
    return key


def _clear_pending(subscription: WorkspaceSubscription):
    subscription.pending_plan = ""
    subscription.pending_interval = ""
    subscription.pending_change_effective_at = None
    subscription.cancel_at_period_end = False


def scheduled_change_pending(billing: WorkspaceSubscription | None) -> bool:
    if billing is None or billing.cancel_at_period_end:
        return False
    if not billing.pending_change_effective_at:
        return False
    if billing.pending_plan == PLAN_BASIC:
        return False
    if billing.pending_interval:
        return True
    if billing.pending_plan and billing.pending_plan != billing.subscribed_plan:
        return True
    return False


def _clear_payment_failure(subscription: WorkspaceSubscription, *, recovered_at=None):
    subscription.payment_failure_started_at = None
    subscription.payment_grace_deadline = None
    subscription.last_payment_warning_at = None
    subscription.payment_warning_count = 0
    subscription.payment_recovered_at = recovered_at


def _access_end(subscription: WorkspaceSubscription):
    if subscription.status == BillingStatus.TRIALING:
        return subscription.trial_ends_at
    return subscription.current_period_end


@transaction.atomic
def get_workspace_billing(organization):
    """Return the billing row, or None if the workspace has none."""
    try:
        return WorkspaceSubscription.objects.get(organization_id=organization.pk)
    except WorkspaceSubscription.DoesNotExist:
        return None


@transaction.atomic
def lock_workspace_billing(organization):
    org = Organization.objects.select_for_update().get(pk=organization.pk)
    try:
        billing = WorkspaceSubscription.objects.select_for_update().get(
            organization=org
        )
    except WorkspaceSubscription.DoesNotExist:
        billing = WorkspaceSubscription.objects.create(organization=org)
        billing = WorkspaceSubscription.objects.select_for_update().get(pk=billing.pk)
    return org, billing


def _save_billing(billing: WorkspaceSubscription, fields):
    billing.save(update_fields=[*fields, "updated_at"])
    return billing


@transaction.atomic
def start_trial(
    organization,
    *,
    billing_interval,
    trial_started_at,
    trial_ends_at,
    purchase_source,
    payment_method_recorded,
    external_customer_id="",
    external_subscription_id="",
    now=None,
):
    """Start a Business trial. Card/payment method must already be recorded.

    Exact trial duration is not frozen; callers pass explicit start/end.
    """
    if not payment_method_recorded:
        raise BillingStateError(
            "A payment method must be recorded before starting a Business trial."
        )
    interval = _require_interval(billing_interval)
    source = _require_purchase_source(purchase_source)
    started = trial_started_at or _now(now)
    ends = trial_ends_at
    if ends is None or ends <= started:
        raise BillingStateError("Trial end must be after trial start.")

    org, billing = lock_workspace_billing(organization)
    if (
        billing.status == BillingStatus.TRIALING
        and billing.subscribed_plan == PLAN_BUSINESS
        and org.plan == OrganizationPlan.BUSINESS
        and billing.trial_started_at == started
        and billing.trial_ends_at == ends
        and billing.billing_interval == interval
        and not billing.cancel_at_period_end
    ):
        return billing

    if billing.status in _PAID_STATUSES:
        raise BillingStateError("Cannot start a trial while a paid subscription is active.")

    apply_effective_plan(org, PLAN_BUSINESS, source="billing.start_trial")
    billing.purchase_source = source
    billing.external_customer_id = external_customer_id or billing.external_customer_id
    billing.external_subscription_id = (
        external_subscription_id or billing.external_subscription_id
    )
    billing.status = BillingStatus.TRIALING
    billing.billing_interval = interval
    billing.subscribed_plan = PLAN_BUSINESS
    billing.trial_started_at = started
    billing.trial_ends_at = ends
    billing.current_period_start = started
    billing.current_period_end = ends
    _clear_pending(billing)
    _clear_payment_failure(billing)
    return _save_billing(
        billing,
        [
            "purchase_source",
            "external_customer_id",
            "external_subscription_id",
            "status",
            "billing_interval",
            "subscribed_plan",
            "trial_started_at",
            "trial_ends_at",
            "current_period_start",
            "current_period_end",
            "cancel_at_period_end",
            "pending_plan",
            "pending_interval",
            "pending_change_effective_at",
            "payment_failure_started_at",
            "payment_grace_deadline",
            "last_payment_warning_at",
            "payment_warning_count",
            "payment_recovered_at",
        ],
    )


@transaction.atomic
def activate_paid_subscription(
    organization,
    *,
    subscribed_plan,
    billing_interval,
    purchase_source,
    current_period_start,
    current_period_end,
    external_customer_id="",
    external_subscription_id="",
    now=None,
):
    """Activate or confirm a paid Plus/Business subscription."""
    plan = _require_paid_plan(subscribed_plan)
    interval = _require_interval(billing_interval)
    source = _require_purchase_source(purchase_source)
    period_start = current_period_start or _now(now)
    if current_period_end is None or current_period_end <= period_start:
        raise BillingStateError("Paid period end must be after period start.")

    org, billing = lock_workspace_billing(organization)
    if (
        billing.status == BillingStatus.ACTIVE
        and billing.subscribed_plan == plan
        and org.plan == plan
        and billing.billing_interval == interval
        and billing.current_period_start == period_start
        and billing.current_period_end == current_period_end
        and not billing.cancel_at_period_end
        and not billing.pending_plan
    ):
        return billing

    apply_effective_plan(org, plan, source="billing.activate_paid_subscription")
    billing.purchase_source = source
    billing.external_customer_id = external_customer_id or billing.external_customer_id
    billing.external_subscription_id = (
        external_subscription_id or billing.external_subscription_id
    )
    billing.status = BillingStatus.ACTIVE
    billing.billing_interval = interval
    billing.subscribed_plan = plan
    billing.current_period_start = period_start
    billing.current_period_end = current_period_end
    _clear_pending(billing)
    _clear_payment_failure(billing)
    return _save_billing(
        billing,
        [
            "purchase_source",
            "external_customer_id",
            "external_subscription_id",
            "status",
            "billing_interval",
            "subscribed_plan",
            "current_period_start",
            "current_period_end",
            "cancel_at_period_end",
            "pending_plan",
            "pending_interval",
            "pending_change_effective_at",
            "payment_failure_started_at",
            "payment_grace_deadline",
            "last_payment_warning_at",
            "payment_warning_count",
            "payment_recovered_at",
        ],
    )


@transaction.atomic
def apply_successful_upgrade(
    organization,
    *,
    target_plan,
    current_period_start=None,
    current_period_end=None,
    external_subscription_id="",
    now=None,
):
    """Immediate paid-tier upgrade. Does not calculate money."""
    target = _require_paid_plan(target_plan)
    org, billing = lock_workspace_billing(organization)
    if billing.status not in _PAID_STATUSES:
        raise BillingStateError("Upgrades require an active paid subscription.")
    current = billing.subscribed_plan
    if current == target and org.plan == target and not billing.pending_plan:
        return billing
    rank = {PLAN_PLUS: 1, PLAN_BUSINESS: 2}
    if rank.get(target, 0) <= rank.get(current, 0):
        raise BillingStateError("Target plan is not a paid upgrade.")

    apply_effective_plan(org, target, source="billing.apply_successful_upgrade")
    billing.subscribed_plan = target
    billing.status = BillingStatus.ACTIVE
    if current_period_start is not None:
        billing.current_period_start = current_period_start
    if current_period_end is not None:
        billing.current_period_end = current_period_end
    if external_subscription_id:
        billing.external_subscription_id = external_subscription_id
    _clear_pending(billing)
    _clear_payment_failure(billing)
    _ = now
    return _save_billing(
        billing,
        [
            "subscribed_plan",
            "status",
            "current_period_start",
            "current_period_end",
            "external_subscription_id",
            "cancel_at_period_end",
            "pending_plan",
            "pending_interval",
            "pending_change_effective_at",
            "payment_failure_started_at",
            "payment_grace_deadline",
            "last_payment_warning_at",
            "payment_warning_count",
            "payment_recovered_at",
        ],
    )


@transaction.atomic
def schedule_billing_change(
    organization,
    *,
    target_plan,
    target_interval,
    effective_at=None,
):
    """Schedule a plan and/or interval change at period end. No immediate charge."""
    target = _require_paid_plan(target_plan)
    interval = _require_interval(target_interval)
    org, billing = lock_workspace_billing(organization)
    if billing.status not in _PAID_STATUSES:
        raise BillingStateError("Scheduled changes require an active paid subscription.")
    if billing.cancel_at_period_end:
        raise BillingStateError(
            "Clear cancellation before scheduling a billing change.",
            code="cancellation_pending",
        )
    when = effective_at or billing.current_period_end
    if when is None:
        raise BillingStateError("A billing change effective time is required.")
    if (
        target == PLAN_BUSINESS
        and billing.subscribed_plan == PLAN_PLUS
        and interval == billing.billing_interval
    ):
        raise BillingStateError(
            "Same-interval tier upgrades use immediate upgrade.",
            code="use_immediate_upgrade",
        )
    if target == billing.subscribed_plan and interval == billing.billing_interval:
        raise BillingStateError("Target plan and interval match the current subscription.")

    # Always persist the explicit target interval (including same-interval downgrades).
    pending_interval = interval
    if (
        billing.pending_plan == target
        and billing.pending_interval == pending_interval
        and billing.pending_change_effective_at == when
        and not billing.cancel_at_period_end
    ):
        return billing
    if scheduled_change_pending(billing):
        raise BillingStateError(
            "A billing change is already scheduled.",
            code="scheduled_change_pending",
        )

    billing.pending_plan = target
    billing.pending_interval = pending_interval
    billing.pending_change_effective_at = when
    billing.cancel_at_period_end = False
    return _save_billing(
        billing,
        [
            "pending_plan",
            "pending_interval",
            "pending_change_effective_at",
            "cancel_at_period_end",
        ],
    )


@transaction.atomic
def schedule_downgrade(organization, *, target_plan, effective_at=None):
    """Schedule a paid downgrade. Does not change Organization.plan yet."""
    target = _require_paid_plan(target_plan)
    if target != PLAN_PLUS:
        raise BillingStateError("V1 paid downgrade destination is Plus.")
    org, billing = lock_workspace_billing(organization)
    if billing.subscribed_plan != PLAN_BUSINESS or org.plan != OrganizationPlan.BUSINESS:
        raise BillingStateError("Only Business can be scheduled down to Plus.")
    return schedule_billing_change(
        organization,
        target_plan=target,
        target_interval=billing.billing_interval,
        effective_at=effective_at,
    )


@transaction.atomic
def schedule_cancellation(organization, *, effective_at=None):
    """Cancel at trial end or paid period end. Access stays until then."""
    org, billing = lock_workspace_billing(organization)
    _ = org
    if billing.status not in _ACCESS_STATUSES:
        raise BillingStateError("There is no active subscription to cancel.")
    when = effective_at or _access_end(billing)
    if when is None:
        raise BillingStateError("A cancellation effective time is required.")
    if (
        billing.cancel_at_period_end
        and billing.pending_change_effective_at == when
        and billing.pending_plan in {"", PLAN_BASIC}
    ):
        return billing

    billing.cancel_at_period_end = True
    billing.pending_plan = PLAN_BASIC
    billing.pending_change_effective_at = when
    return _save_billing(
        billing,
        ["cancel_at_period_end", "pending_plan", "pending_change_effective_at"],
    )


@transaction.atomic
def clear_pending_cancellation(organization):
    """Revoke a scheduled cancellation while access is still active."""
    org, billing = lock_workspace_billing(organization)
    _ = org
    if not billing.cancel_at_period_end:
        return billing
    if billing.status not in _ACCESS_STATUSES:
        raise BillingStateError("Cannot clear cancellation after access has ended.")
    billing.cancel_at_period_end = False
    if billing.pending_plan == PLAN_BASIC:
        billing.pending_plan = ""
        billing.pending_change_effective_at = None
    return _save_billing(
        billing,
        ["cancel_at_period_end", "pending_plan", "pending_change_effective_at"],
    )


@transaction.atomic
def clear_pending_scheduled_change(organization):
    """Revoke a scheduled plan/interval change while the current subscription stays active."""
    org, billing = lock_workspace_billing(organization)
    if billing.cancel_at_period_end:
        raise BillingStateError(
            "Clear cancellation before clearing a scheduled billing change.",
            code="cancellation_pending",
        )
    if not scheduled_change_pending(billing):
        return billing
    if billing.status not in _PAID_STATUSES:
        raise BillingStateError(
            "Cannot clear a scheduled change after paid access has ended."
        )
    billing.pending_plan = ""
    billing.pending_interval = ""
    billing.pending_change_effective_at = None
    return _save_billing(
        billing,
        ["pending_plan", "pending_interval", "pending_change_effective_at"],
    )


@transaction.atomic
def clear_pending_downgrade(organization):
    """Revoke a scheduled Business→Plus downgrade while Business remains active."""
    org, billing = lock_workspace_billing(organization)
    same_interval_downgrade = (
        billing.pending_plan == PLAN_PLUS
        and billing.subscribed_plan == PLAN_BUSINESS
        and (
            not billing.pending_interval
            or billing.pending_interval == billing.billing_interval
        )
    )
    if not same_interval_downgrade:
        if scheduled_change_pending(billing):
            return clear_pending_scheduled_change(organization)
        return billing
    if billing.status not in _PAID_STATUSES:
        raise BillingStateError("Cannot clear a downgrade after paid access has ended.")
    if billing.subscribed_plan != PLAN_BUSINESS or org.plan != OrganizationPlan.BUSINESS:
        raise BillingStateError(
            "Scheduled downgrade can only be cleared while Business remains active."
        )
    if billing.cancel_at_period_end:
        raise BillingStateError(
            "Clear cancellation before clearing a scheduled downgrade.",
            code="cancellation_pending",
        )
    return clear_pending_scheduled_change(organization)


@transaction.atomic
def mark_payment_failure(organization, *, failed_at=None, grace_deadline=None, now=None):
    """Enter payment-failure grace without changing Organization.plan."""
    org, billing = lock_workspace_billing(organization)
    _ = org
    if billing.status == BillingStatus.TRIALING:
        raise BillingStateError("Trial payment failure is handled by the provider later.")
    if billing.status not in _PAID_STATUSES:
        raise BillingStateError("Payment failure requires an active paid subscription.")
    moment = failed_at or _now(now)
    if billing.status == BillingStatus.PAST_DUE and billing.payment_grace_deadline:
        return billing

    deadline = grace_deadline or (moment + timedelta(days=PAYMENT_GRACE_DAYS))
    billing.status = BillingStatus.PAST_DUE
    billing.payment_failure_started_at = moment
    billing.payment_grace_deadline = deadline
    billing.payment_recovered_at = None
    return _save_billing(
        billing,
        [
            "status",
            "payment_failure_started_at",
            "payment_grace_deadline",
            "payment_recovered_at",
        ],
    )


@transaction.atomic
def record_payment_warning(organization, *, warned_at=None, now=None):
    """Record that a payment-failure warning was issued. Does not send email."""
    org, billing = lock_workspace_billing(organization)
    _ = org
    if billing.status != BillingStatus.PAST_DUE:
        raise BillingStateError("Payment warnings apply during grace only.")
    billing.last_payment_warning_at = warned_at or _now(now)
    billing.payment_warning_count = int(billing.payment_warning_count or 0) + 1
    return _save_billing(
        billing,
        ["last_payment_warning_at", "payment_warning_count"],
    )


@transaction.atomic
def mark_payment_recovered(organization, *, recovered_at=None, now=None):
    """Clear grace after payment succeeds. Entitlement plan is unchanged."""
    org, billing = lock_workspace_billing(organization)
    _ = org
    if billing.status != BillingStatus.PAST_DUE:
        return billing
    billing.status = BillingStatus.ACTIVE
    _clear_payment_failure(billing, recovered_at=recovered_at or _now(now))
    return _save_billing(
        billing,
        [
            "status",
            "payment_failure_started_at",
            "payment_grace_deadline",
            "last_payment_warning_at",
            "payment_warning_count",
            "payment_recovered_at",
        ],
    )


@transaction.atomic
def finalize_subscription_end(organization, *, ended_at=None, now=None):
    """End paid/trial access and transition entitlement to Basic."""
    org, billing = lock_workspace_billing(organization)
    _ = ended_at
    _ = now
    if (
        billing.status in {BillingStatus.NONE, BillingStatus.CANCELED}
        and org.plan == OrganizationPlan.BASIC
        and not billing.cancel_at_period_end
        and not billing.pending_plan
    ):
        return billing

    apply_effective_plan(org, PLAN_BASIC, source="billing.finalize_subscription_end")
    billing.status = BillingStatus.CANCELED
    billing.purchase_source = PurchaseSource.NONE
    billing.billing_interval = BillingInterval.NONE
    billing.subscribed_plan = ""
    _clear_pending(billing)
    _clear_payment_failure(billing)
    return _save_billing(
        billing,
        [
            "status",
            "purchase_source",
            "billing_interval",
            "subscribed_plan",
            "cancel_at_period_end",
            "pending_plan",
            "pending_interval",
            "pending_change_effective_at",
            "payment_failure_started_at",
            "payment_grace_deadline",
            "last_payment_warning_at",
            "payment_warning_count",
            "payment_recovered_at",
        ],
    )


@transaction.atomic
def apply_due_billing_transitions(organization, *, now=None):
    """Apply scheduled cancellation, downgrade, trial conversion, or grace end.

    Safe to call more than once. Does not invent provider period lengths.
    """
    moment = _now(now)
    org, billing = lock_workspace_billing(organization)

    if billing.status == BillingStatus.PAST_DUE and billing.payment_grace_deadline:
        if moment >= billing.payment_grace_deadline:
            return finalize_subscription_end(org, ended_at=moment, now=moment)

    if billing.status == BillingStatus.TRIALING and billing.trial_ends_at:
        if moment >= billing.trial_ends_at:
            if billing.cancel_at_period_end:
                return finalize_subscription_end(org, ended_at=moment, now=moment)
            apply_effective_plan(
                org, PLAN_BUSINESS, source="billing.convert_trial_to_paid"
            )
            paid_period_end = billing.current_period_end
            if paid_period_end is None or paid_period_end <= billing.trial_ends_at:
                paid_period_end = None
            billing.status = BillingStatus.ACTIVE
            billing.subscribed_plan = PLAN_BUSINESS
            billing.current_period_start = billing.trial_ends_at
            billing.current_period_end = paid_period_end
            _clear_pending(billing)
            return _save_billing(
                billing,
                [
                    "status",
                    "subscribed_plan",
                    "current_period_start",
                    "current_period_end",
                    "cancel_at_period_end",
                    "pending_plan",
                    "pending_change_effective_at",
                ],
            )

    if billing.cancel_at_period_end and billing.pending_change_effective_at:
        if moment >= billing.pending_change_effective_at:
            return finalize_subscription_end(org, ended_at=moment, now=moment)

    if (
        billing.pending_change_effective_at
        and moment >= billing.pending_change_effective_at
        and not billing.cancel_at_period_end
        and billing.pending_plan
        and billing.pending_plan != PLAN_BASIC
    ):
        target_plan = billing.pending_plan
        target_interval = billing.pending_interval or billing.billing_interval
        plan_changes = target_plan != billing.subscribed_plan
        if plan_changes:
            apply_effective_plan(
                org, target_plan, source="billing.apply_due_scheduled_change"
            )
        billing.subscribed_plan = target_plan
        billing.billing_interval = target_interval
        billing.status = BillingStatus.ACTIVE
        billing.current_period_start = billing.pending_change_effective_at
        _clear_pending(billing)
        return _save_billing(
            billing,
            [
                "subscribed_plan",
                "billing_interval",
                "status",
                "current_period_start",
                "cancel_at_period_end",
                "pending_plan",
                "pending_interval",
                "pending_change_effective_at",
            ],
        )

    return billing
