"""Owner billing operations. Provider calls stay in the adapter."""

from __future__ import annotations

from billing.catalog import PLAN_BUSINESS, PLAN_PLUS, PAID_INTERVALS
from billing.exceptions import BillingStateError, StripeConfigurationError, StripeProviderError
from billing.models import BillingStatus, PurchaseSource
from billing.prices import require_stripe_api
from billing.provider import get_billing_provider
from billing.reconciliation import reconcile_subscription_snapshot
from billing.services import (
    clear_pending_cancellation,
    clear_pending_downgrade,
    clear_pending_scheduled_change,
    get_workspace_billing,
    schedule_billing_change,
    schedule_cancellation,
)
from core.mail import frontend_url


def _deny_checkstation_billing(organization):
    if organization is not None and organization.is_checkstation_account:
        raise BillingStateError(
            "This workspace is managed by CheckStation and does not use customer billing.",
            code="checkstation_managed_account",
        )


def _require_stripe_source(billing):
    if billing is None or billing.purchase_source != PurchaseSource.STRIPE:
        raise BillingStateError(
            "This workspace is not on Stripe-managed billing.",
            code="purchase_source_not_stripe",
        )


def _return_urls():
    success = f"{frontend_url('account', 'subscription')}?checkout=success"
    cancel = f"{frontend_url('account', 'subscription')}?checkout=cancelled"
    portal = f"{frontend_url('account', 'billing')}?portal=return"
    return success, cancel, portal


def start_paid_checkout(organization, owner, *, plan_key, interval):
    _deny_checkstation_billing(organization)
    require_stripe_api()
    plan = str(plan_key or "").strip().lower()
    interval_key = str(interval or "").strip().lower()
    if plan not in {PLAN_PLUS, PLAN_BUSINESS}:
        raise BillingStateError("Checkout plan must be plus or business.")
    if interval_key not in PAID_INTERVALS:
        raise BillingStateError("Checkout interval must be monthly or yearly.")
    billing = get_workspace_billing(organization)
    if billing and billing.purchase_source == PurchaseSource.APPLE:
        raise BillingStateError(
            "Apple-managed subscriptions cannot use Stripe Checkout.",
            code="purchase_source_apple",
        )
    if billing and billing.status in {
        BillingStatus.TRIALING,
        BillingStatus.ACTIVE,
        BillingStatus.PAST_DUE,
    }:
        raise BillingStateError("This workspace already has an active subscription.")
    from billing.builtin_trial import billing_start_at_for_checkout
    from billing.coupons import resolve_checkout_coupon

    coupon_id, coupon_slot = resolve_checkout_coupon(
        organization=organization,
        plan_key=plan,
        interval=interval_key,
    )
    success_url, cancel_url, _portal = _return_urls()
    provider = get_billing_provider()
    return provider.create_checkout_session(
        organization=organization,
        owner=owner,
        plan_key=plan,
        interval=interval_key,
        success_url=success_url,
        cancel_url=cancel_url,
        billing_start_at=billing_start_at_for_checkout(organization),
        coupon_id=coupon_id,
        coupon_slot=coupon_slot,
    )


def preview_upgrade_to_business(organization):
    _deny_checkstation_billing(organization)
    require_stripe_api()
    billing = get_workspace_billing(organization)
    _require_stripe_source(billing)
    if billing.subscribed_plan != PLAN_PLUS:
        raise BillingStateError("Only Plus can preview an upgrade to Business.")
    interval = billing.billing_interval
    provider = get_billing_provider()
    return provider.preview_upgrade(
        subscription_id=billing.external_subscription_id,
        target_plan=PLAN_BUSINESS,
        target_interval=interval,
    )


def apply_upgrade_to_business(organization):
    _deny_checkstation_billing(organization)
    require_stripe_api()
    billing = get_workspace_billing(organization)
    _require_stripe_source(billing)
    if billing.subscribed_plan != PLAN_PLUS:
        raise BillingStateError("Only Plus can upgrade to Business.")
    if not billing.external_subscription_id:
        raise BillingStateError("No Stripe subscription is on file.")
    provider = get_billing_provider()
    snapshot = provider.apply_upgrade(
        subscription_id=billing.external_subscription_id,
        target_plan=PLAN_BUSINESS,
        target_interval=billing.billing_interval,
    )
    reconcile_subscription_snapshot(organization, snapshot)
    organization.refresh_from_db()
    return get_workspace_billing(organization)


def request_downgrade_to_plus(organization, *, interval=None):
    _deny_checkstation_billing(organization)
    require_stripe_api()
    billing = get_workspace_billing(organization)
    _require_stripe_source(billing)
    if billing.subscribed_plan != PLAN_BUSINESS:
        raise BillingStateError("Only Business can schedule a downgrade to Plus.")
    if not billing.external_subscription_id:
        raise BillingStateError("No Stripe subscription is on file.")
    if interval is None or str(interval).strip() == "":
        target_interval = billing.billing_interval
    else:
        target_interval = str(interval).strip().lower()
    if target_interval not in PAID_INTERVALS:
        raise BillingStateError("Downgrade interval must be monthly or yearly.")
    # Same-interval Business→Plus uses this endpoint; interval changes use schedule change.
    if target_interval != billing.billing_interval:
        raise BillingStateError(
            "Interval-changing Business→Plus must use schedule billing change.",
            code="use_schedule_billing_change",
        )
    provider = get_billing_provider()
    provider.schedule_downgrade(
        subscription_id=billing.external_subscription_id,
        target_plan=PLAN_PLUS,
        target_interval=target_interval,
    )
    return schedule_billing_change(
        organization,
        target_plan=PLAN_PLUS,
        target_interval=target_interval,
    )


def request_cancellation(organization):
    _deny_checkstation_billing(organization)
    require_stripe_api()
    billing = get_workspace_billing(organization)
    _require_stripe_source(billing)
    if not billing.external_subscription_id:
        raise BillingStateError("No Stripe subscription is on file.")
    provider = get_billing_provider()
    snapshot = provider.cancel_at_period_end(
        subscription_id=billing.external_subscription_id
    )
    effective = snapshot.trial_end if billing.status == BillingStatus.TRIALING else snapshot.current_period_end
    return schedule_cancellation(organization, effective_at=effective)


def request_resume_subscription(organization):
    """Remove cancel-at-period-end on the existing Stripe subscription."""
    _deny_checkstation_billing(organization)
    require_stripe_api()
    billing = get_workspace_billing(organization)
    _require_stripe_source(billing)
    if billing.status not in {
        BillingStatus.TRIALING,
        BillingStatus.ACTIVE,
        BillingStatus.PAST_DUE,
    }:
        raise BillingStateError("There is no active subscription to resume.")
    if not billing.cancel_at_period_end:
        return billing
    if not billing.external_subscription_id:
        raise BillingStateError("No Stripe subscription is on file.")
    provider = get_billing_provider()
    snapshot = provider.resume_subscription(
        subscription_id=billing.external_subscription_id
    )
    if snapshot.cancel_at_period_end:
        raise StripeProviderError(
            "Stripe did not clear cancel-at-period-end.",
            code="stripe_resume_incomplete",
        )
    return clear_pending_cancellation(organization)


def request_cancel_scheduled_downgrade(organization):
    """Release a scheduled period-end change; keep the current subscription."""
    _deny_checkstation_billing(organization)
    require_stripe_api()
    billing = get_workspace_billing(organization)
    _require_stripe_source(billing)
    if not billing.external_subscription_id:
        raise BillingStateError("No Stripe subscription is on file.")
    from billing.services import scheduled_change_pending

    if not scheduled_change_pending(billing):
        return billing
    provider = get_billing_provider()
    provider.cancel_scheduled_downgrade(
        subscription_id=billing.external_subscription_id
    )
    return clear_pending_scheduled_change(organization)


def request_schedule_billing_change(organization, *, plan, interval):
    _deny_checkstation_billing(organization)
    require_stripe_api()
    billing = get_workspace_billing(organization)
    _require_stripe_source(billing)
    if billing.status not in {BillingStatus.ACTIVE, BillingStatus.PAST_DUE}:
        raise BillingStateError("Scheduled changes require an active paid subscription.")
    if not billing.external_subscription_id:
        raise BillingStateError("No Stripe subscription is on file.")
    plan_key = str(plan or billing.subscribed_plan or "").strip().lower()
    interval_key = str(interval or billing.billing_interval or "").strip().lower()
    if plan_key not in {PLAN_PLUS, PLAN_BUSINESS}:
        raise BillingStateError("Scheduled plan must be plus or business.")
    if interval_key not in PAID_INTERVALS:
        raise BillingStateError("Scheduled interval must be monthly or yearly.")
    from billing.coupons import resolve_schedule_coupon

    coupon_id, coupon_slot = resolve_schedule_coupon(
        organization=organization,
        target_plan=plan_key,
        target_interval=interval_key,
    )
    provider = get_billing_provider()
    provider.schedule_downgrade(
        subscription_id=billing.external_subscription_id,
        target_plan=plan_key,
        target_interval=interval_key,
        coupon_id=coupon_id,
        coupon_slot=coupon_slot,
    )
    return schedule_billing_change(
        organization,
        target_plan=plan_key,
        target_interval=interval_key,
    )


def open_customer_portal(organization):
    _deny_checkstation_billing(organization)
    require_stripe_api()
    billing = get_workspace_billing(organization)
    _require_stripe_source(billing)
    if not billing.external_customer_id:
        raise StripeConfigurationError(
            "No Stripe customer is on file for this workspace.",
            code="stripe_customer_missing",
        )
    _success, _cancel, portal_return = _return_urls()
    provider = get_billing_provider()
    return provider.create_portal_session(
        customer_id=billing.external_customer_id,
        return_url=portal_return,
    )


def list_customer_invoices(organization, *, limit=10):
    _deny_checkstation_billing(organization)
    require_stripe_api()
    billing = get_workspace_billing(organization)
    _require_stripe_source(billing)
    if not billing.external_customer_id:
        raise StripeConfigurationError(
            "No Stripe customer is on file for this workspace.",
            code="stripe_customer_missing",
        )
    provider = get_billing_provider()
    return provider.list_invoices(
        customer_id=billing.external_customer_id,
        limit=limit,
    )
