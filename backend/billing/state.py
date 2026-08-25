"""Frontend-facing billing snapshot. No Stripe IDs."""

from billing.catalog import PLAN_BUSINESS, PLAN_PLUS, catalog_public_payload
from billing.models import BillingStatus, PurchaseSource
from billing.prices import stripe_api_configured, trial_is_configured
from billing.services import get_workspace_billing
from organizations.entitlements.catalog import PLAN_DISPLAY_NAMES
from organizations.models import OrganizationPlan


def _iso(value):
    if value is None:
        return None
    return value.isoformat()


def _plan_label(key):
    if not key:
        return None
    return PLAN_DISPLAY_NAMES.get(key, key)


def build_billing_state(organization):
    billing = get_workspace_billing(organization)
    effective = organization.plan
    source = billing.purchase_source if billing else PurchaseSource.NONE
    status = billing.status if billing else BillingStatus.NONE
    interval = billing.billing_interval if billing else "none"
    subscribed = billing.subscribed_plan if billing else ""
    stripe_ok = stripe_api_configured()
    trial_ok = trial_is_configured() and stripe_ok
    is_stripe = source == PurchaseSource.STRIPE
    is_apple = source == PurchaseSource.APPLE
    access_active = status in {
        BillingStatus.TRIALING,
        BillingStatus.ACTIVE,
        BillingStatus.PAST_DUE,
    }
    basic_like = effective == OrganizationPlan.BASIC and not access_active
    payment_issue = None
    if billing and status == BillingStatus.PAST_DUE:
        payment_issue = {
            "active": True,
            "started_at": _iso(billing.payment_failure_started_at),
            "grace_deadline": _iso(billing.payment_grace_deadline),
        }

    can_checkout = basic_like and stripe_ok and not is_apple
    cancel_scheduled = bool(billing and billing.cancel_at_period_end)
    downgrade_scheduled = bool(
        billing and billing.pending_plan == PLAN_PLUS and not cancel_scheduled
    )
    actions = {
        "can_checkout_plus": can_checkout,
        "can_checkout_business": can_checkout,
        "can_start_trial": can_checkout and trial_ok,
        "can_schedule_downgrade_to_plus": (
            is_stripe
            and status in {BillingStatus.ACTIVE, BillingStatus.PAST_DUE}
            and subscribed == PLAN_BUSINESS
            and effective == OrganizationPlan.BUSINESS
            and not cancel_scheduled
            and not downgrade_scheduled
        ),
        "can_cancel_scheduled_downgrade": (
            is_stripe
            and stripe_ok
            and status in {BillingStatus.ACTIVE, BillingStatus.PAST_DUE}
            and subscribed == PLAN_BUSINESS
            and effective == OrganizationPlan.BUSINESS
            and downgrade_scheduled
        ),
        "can_cancel": is_stripe and access_active and not cancel_scheduled,
        "can_resume_subscription": (
            is_stripe
            and stripe_ok
            and access_active
            and cancel_scheduled
        ),
        "can_upgrade_to_business": (
            is_stripe
            and status in {BillingStatus.ACTIVE, BillingStatus.PAST_DUE}
            and subscribed == PLAN_PLUS
            and effective == OrganizationPlan.PLUS
            and not cancel_scheduled
        ),
        "can_open_portal": bool(
            is_stripe and billing and billing.external_customer_id
        ),
        "can_change_interval": False,
    }

    return {
        "effective_plan": {
            "key": effective,
            "display_name": _plan_label(effective),
        },
        "subscribed_plan": {
            "key": subscribed or None,
            "display_name": _plan_label(subscribed) if subscribed else None,
        },
        "purchase_source": source,
        "status": status,
        "interval": interval if interval != "none" else None,
        "currency": (billing.currency if billing else "usd"),
        "current_period_start": _iso(billing.current_period_start) if billing else None,
        "current_period_end": _iso(billing.current_period_end) if billing else None,
        "trial_started_at": _iso(billing.trial_started_at) if billing else None,
        "trial_ends_at": _iso(billing.trial_ends_at) if billing else None,
        "cancel_at_period_end": bool(billing.cancel_at_period_end) if billing else False,
        "pending_plan": billing.pending_plan or None if billing else None,
        "pending_change_effective_at": (
            _iso(billing.pending_change_effective_at) if billing else None
        ),
        "payment_issue": payment_issue,
        "catalog": catalog_public_payload(),
        "trial_available": trial_ok,
        "stripe_configured": stripe_ok,
        "actions": actions,
    }
