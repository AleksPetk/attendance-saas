"""Frontend-facing billing snapshot. No Stripe IDs."""

from billing.catalog import PLAN_BUSINESS, PLAN_PLUS, catalog_public_payload
from billing.models import BillingStatus, PurchaseSource
from billing.prices import stripe_api_configured
from billing.markets import (
    currency_for_market,
    market_for_existing_subscription,
    resolve_billing_market,
)
from billing.services import get_workspace_billing, scheduled_change_pending
from billing.builtin_trial import (
    builtin_trial_public_payload,
    commercial_access_active,
    expire_due_builtin_trial,
)
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
    expire_due_builtin_trial(organization)
    if organization is not None:
        organization.refresh_from_db()
    if organization is not None and organization.is_checkstation_account:
        effective = organization.plan
        market = resolve_billing_market(organization)
        empty_actions = {
            "can_checkout_plus": False,
            "can_checkout_business": False,
            "can_schedule_downgrade_to_plus": False,
            "can_cancel_scheduled_downgrade": False,
            "can_cancel_scheduled_change": False,
            "can_schedule_billing_change": False,
            "can_cancel": False,
            "can_resume_subscription": False,
            "can_upgrade_to_business": False,
            "can_open_portal": False,
            "can_change_interval": False,
        }
        return {
            "managed_by_platform": True,
            "commercial_billing_available": False,
            "effective_plan": {
                "key": effective,
                "display_name": _plan_label(effective),
            },
            "subscribed_plan": {"key": None, "display_name": None},
            "purchase_source": PurchaseSource.NONE,
            "status": BillingStatus.NONE,
            "interval": None,
            "currency": currency_for_market(market),
            "billing_market": market,
            "current_period_start": None,
            "current_period_end": None,
            "trial_started_at": None,
            "trial_ends_at": None,
            "cancel_at_period_end": False,
            "pending_plan": None,
            "pending_interval": None,
            "pending_change_effective_at": None,
            "scheduled_change": {"active": False, "kind": None},
            "payment_issue": None,
            "catalog": catalog_public_payload(organization=organization),
            "builtin_trial": builtin_trial_public_payload(organization),
            "stripe_configured": stripe_api_configured(),
            "actions": empty_actions,
        }

    billing = get_workspace_billing(organization)
    market = market_for_existing_subscription(billing, workspace=organization)
    effective = organization.plan
    source = billing.purchase_source if billing else PurchaseSource.NONE
    status = billing.status if billing else BillingStatus.NONE
    interval = billing.billing_interval if billing else "none"
    subscribed = billing.subscribed_plan if billing else ""
    stripe_ok = stripe_api_configured(market=market)
    is_stripe = source == PurchaseSource.STRIPE
    is_apple = source == PurchaseSource.APPLE
    access_active = commercial_access_active(billing)
    payment_issue = None
    if billing and status == BillingStatus.PAST_DUE:
        payment_issue = {
            "active": True,
            "started_at": _iso(billing.payment_failure_started_at),
            "grace_deadline": _iso(billing.payment_grace_deadline),
        }

    can_checkout = (not access_active) and stripe_ok and not is_apple
    cancel_scheduled = bool(billing and billing.cancel_at_period_end)
    change_scheduled = scheduled_change_pending(billing)
    pending_target_interval = None
    if billing and billing.pending_interval:
        pending_target_interval = billing.pending_interval
    elif billing and change_scheduled:
        pending_target_interval = billing.billing_interval
    downgrade_scheduled = bool(
        billing
        and billing.pending_plan == PLAN_PLUS
        and billing.subscribed_plan == PLAN_BUSINESS
        and pending_target_interval == billing.billing_interval
        and not cancel_scheduled
    )
    interval_change_scheduled = bool(
        billing
        and billing.pending_interval
        and billing.pending_plan == billing.subscribed_plan
        and billing.pending_interval != billing.billing_interval
        and not cancel_scheduled
    )
    combined_change_scheduled = bool(
        billing
        and change_scheduled
        and not downgrade_scheduled
        and not interval_change_scheduled
    )
    paid_active = status in {BillingStatus.ACTIVE, BillingStatus.PAST_DUE}
    actions = {
        "can_checkout_plus": can_checkout,
        "can_checkout_business": can_checkout,
        "can_schedule_downgrade_to_plus": (
            is_stripe
            and paid_active
            and subscribed == PLAN_BUSINESS
            and effective == OrganizationPlan.BUSINESS
            and not cancel_scheduled
            and not change_scheduled
        ),
        "can_cancel_scheduled_downgrade": (
            is_stripe
            and stripe_ok
            and paid_active
            and downgrade_scheduled
        ),
        "can_cancel_scheduled_change": (
            is_stripe and stripe_ok and change_scheduled
        ),
        "can_schedule_billing_change": (
            is_stripe
            and stripe_ok
            and paid_active
            and subscribed in {PLAN_PLUS, PLAN_BUSINESS}
            and interval in {"monthly", "yearly"}
            and not cancel_scheduled
            and not change_scheduled
        ),
        "can_cancel": is_stripe and access_active and not cancel_scheduled and not change_scheduled,
        "can_resume_subscription": (
            is_stripe
            and stripe_ok
            and access_active
            and cancel_scheduled
        ),
        "can_upgrade_to_business": (
            is_stripe
            and paid_active
            and subscribed == PLAN_PLUS
            and effective == OrganizationPlan.PLUS
            and not cancel_scheduled
            and not change_scheduled
        ),
        "can_open_portal": bool(
            is_stripe and billing and billing.external_customer_id
        ),
        "can_change_interval": (
            is_stripe
            and stripe_ok
            and paid_active
            and subscribed in {PLAN_PLUS, PLAN_BUSINESS}
            and interval in {"monthly", "yearly"}
            and not cancel_scheduled
            and not change_scheduled
        ),
    }

    pending_interval = None
    if billing and change_scheduled:
        pending_interval = billing.pending_interval or billing.billing_interval
    elif billing and billing.pending_interval:
        pending_interval = billing.pending_interval

    return {
        "managed_by_platform": False,
        "commercial_billing_available": True,
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
        "currency": currency_for_market(market),
        "billing_market": market,
        "current_period_start": _iso(billing.current_period_start) if billing else None,
        "current_period_end": _iso(billing.current_period_end) if billing else None,
        "trial_started_at": _iso(billing.trial_started_at) if billing else None,
        "trial_ends_at": _iso(billing.trial_ends_at) if billing else None,
        "cancel_at_period_end": bool(billing.cancel_at_period_end) if billing else False,
        "pending_plan": billing.pending_plan or None if billing else None,
        "pending_interval": pending_interval,
        "pending_change_effective_at": (
            _iso(billing.pending_change_effective_at) if billing else None
        ),
        "scheduled_change": {
            "active": change_scheduled,
            "kind": (
                "downgrade"
                if downgrade_scheduled
                else "interval"
                if interval_change_scheduled
                else "combined"
                if combined_change_scheduled
                else None
            ),
        },
        "payment_issue": payment_issue,
        "catalog": catalog_public_payload(organization=organization, market=market),
        "builtin_trial": builtin_trial_public_payload(organization),
        "stripe_configured": stripe_ok,
        "actions": actions,
    }
