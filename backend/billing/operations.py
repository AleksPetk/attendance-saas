"""Owner billing operations. Provider calls stay in the adapter."""

from __future__ import annotations

from billing.catalog import PLAN_BUSINESS, PLAN_PLUS, PAID_INTERVALS
from billing.exceptions import BillingStateError, StripeConfigurationError
from billing.models import BillingStatus, PurchaseSource
from billing.prices import (
    business_trial_days,
    require_stripe_api,
)
from billing.provider import get_billing_provider
from billing.reconciliation import reconcile_subscription_snapshot
from billing.services import (
    clear_pending_cancellation,
    clear_pending_downgrade,
    get_workspace_billing,
    schedule_cancellation,
    schedule_downgrade,
)
from core.mail import frontend_url
from organizations.models import OrganizationPlan


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
    if organization.plan != OrganizationPlan.BASIC:
        if not billing or billing.status not in {BillingStatus.NONE, BillingStatus.CANCELED}:
            if billing and billing.status in {
                BillingStatus.TRIALING,
                BillingStatus.ACTIVE,
                BillingStatus.PAST_DUE,
            }:
                raise BillingStateError("This workspace already has an active subscription.")
    success_url, cancel_url, _portal = _return_urls()
    provider = get_billing_provider()
    return provider.create_checkout_session(
        organization=organization,
        owner=owner,
        plan_key=plan,
        interval=interval_key,
        success_url=success_url,
        cancel_url=cancel_url,
        trial_days=None,
    )


def start_trial_checkout(organization, owner, *, interval):
    require_stripe_api()
    days = business_trial_days()
    if days is None:
        raise StripeConfigurationError(
            "Business trial is not offered until BUSINESS_TRIAL_DAYS is configured.",
            code="trial_not_configured",
        )
    interval_key = str(interval or "").strip().lower()
    if interval_key not in PAID_INTERVALS:
        raise BillingStateError("Trial interval must be monthly or yearly.")
    if organization.plan != OrganizationPlan.BASIC:
        billing = get_workspace_billing(organization)
        if billing and billing.status in {
            BillingStatus.TRIALING,
            BillingStatus.ACTIVE,
            BillingStatus.PAST_DUE,
        }:
            raise BillingStateError("This workspace already has an active subscription.")
    success_url, cancel_url, _portal = _return_urls()
    provider = get_billing_provider()
    return provider.create_checkout_session(
        organization=organization,
        owner=owner,
        plan_key=PLAN_BUSINESS,
        interval=interval_key,
        success_url=success_url,
        cancel_url=cancel_url,
        trial_days=days,
    )


def preview_upgrade_to_business(organization):
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


def request_downgrade_to_plus(organization):
    require_stripe_api()
    billing = get_workspace_billing(organization)
    _require_stripe_source(billing)
    if billing.subscribed_plan != PLAN_BUSINESS:
        raise BillingStateError("Only Business can schedule a downgrade to Plus.")
    if not billing.external_subscription_id:
        raise BillingStateError("No Stripe subscription is on file.")
    provider = get_billing_provider()
    provider.schedule_downgrade(
        subscription_id=billing.external_subscription_id,
        target_plan=PLAN_PLUS,
        target_interval=billing.billing_interval,
    )
    return schedule_downgrade(organization, target_plan=PLAN_PLUS)


def request_cancellation(organization):
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
    """Release a scheduled Business→Plus change; keep the Business subscription."""
    require_stripe_api()
    billing = get_workspace_billing(organization)
    _require_stripe_source(billing)
    if billing.pending_plan != PLAN_PLUS:
        return billing
    if billing.subscribed_plan != PLAN_BUSINESS:
        raise BillingStateError("Only a Business subscription can clear a Plus downgrade.")
    if not billing.external_subscription_id:
        raise BillingStateError("No Stripe subscription is on file.")
    provider = get_billing_provider()
    provider.cancel_scheduled_downgrade(
        subscription_id=billing.external_subscription_id
    )
    return clear_pending_downgrade(organization)


def open_customer_portal(organization):
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
