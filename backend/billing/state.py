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
    builtin_trial_is_active,
    builtin_trial_public_payload,
    commercial_access_active,
    expire_due_builtin_trial,
)
from organizations.entitlements.catalog import PLAN_DISPLAY_NAMES


def _iso(value):
    if value is None:
        return None
    return value.isoformat()


def _plan_label(key):
    if not key:
        return None
    return PLAN_DISPLAY_NAMES.get(key, key)


def _future_paid_plan_payload(billing):
    """Deferred paid choice during built-in trial (commercially still Basic)."""
    if not billing:
        return None
    if billing.cancel_at_period_end:
        return None
    if billing.status != BillingStatus.TRIALING:
        return None
    plan = billing.subscribed_plan
    interval = billing.billing_interval
    if plan not in {PLAN_PLUS, PLAN_BUSINESS}:
        return None
    if interval not in {"monthly", "yearly"}:
        return None
    return {
        "key": plan,
        "display_name": _plan_label(plan),
        "interval": interval,
        "starts_at": _iso(billing.trial_ends_at),
    }


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
            "future_paid_plan": None,
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
    builtin_active = builtin_trial_is_active(organization)
    payment_issue = None
    if billing and status == BillingStatus.PAST_DUE:
        payment_issue = {
            "active": True,
            "started_at": _iso(billing.payment_failure_started_at),
            "grace_deadline": _iso(billing.payment_grace_deadline),
        }

    cancel_scheduled = bool(billing and billing.cancel_at_period_end)
    change_scheduled = scheduled_change_pending(billing)
    future_paid = _future_paid_plan_payload(billing) if builtin_active else None

    # During built-in trial the customer is commercially Basic. Plan cards are
    # always the four future-paid choices; cancel clears the deferred selection.
    if builtin_active:
        actions = {
            "can_checkout_plus": bool(stripe_ok and not is_apple),
            "can_checkout_business": bool(stripe_ok and not is_apple),
            "can_schedule_downgrade_to_plus": False,
            "can_cancel_scheduled_downgrade": False,
            "can_cancel_scheduled_change": False,
            "can_schedule_billing_change": False,
            "can_cancel": bool(
                is_stripe
                and stripe_ok
                and future_paid is not None
            ),
            "can_resume_subscription": False,
            "can_upgrade_to_business": False,
            "can_open_portal": bool(
                is_stripe and billing and billing.external_customer_id
            ),
            "can_change_interval": False,
        }
        return {
            "managed_by_platform": False,
            "commercial_billing_available": True,
            "effective_plan": {
                "key": effective,
                "display_name": _plan_label(effective),
            },
            # Commercially Basic during built-in trial — do not surface Stripe
            # deferred selection as the current subscribed commercial plan.
            "subscribed_plan": {"key": None, "display_name": None},
            "future_paid_plan": future_paid,
            "purchase_source": source,
            "status": status,
            "interval": None,
            "currency": currency_for_market(market),
            "billing_market": market,
            "current_period_start": None,
            "current_period_end": None,
            "trial_started_at": _iso(billing.trial_started_at) if billing else None,
            "trial_ends_at": (
                future_paid.get("starts_at")
                if future_paid
                else (_iso(billing.trial_ends_at) if billing else None)
            ),
            # Never expose cancel-at-period-end / Resume during built-in trial.
            "cancel_at_period_end": False,
            "pending_plan": None,
            "pending_interval": None,
            "pending_change_effective_at": None,
            "scheduled_change": {"active": False, "kind": None},
            "payment_issue": payment_issue,
            "catalog": catalog_public_payload(organization=organization, market=market),
            "builtin_trial": builtin_trial_public_payload(organization),
            "stripe_configured": stripe_ok,
            "actions": actions,
        }

    # Pending cancel during provider trialing (deferred paid start) is treated as
    # commercially Basic for plan reselection — not as a live paid commitment.
    reselect_after_trial_cancel = bool(
        cancel_scheduled and status == BillingStatus.TRIALING
    )
    can_checkout = (
        stripe_ok
        and not is_apple
        and ((not access_active) or reselect_after_trial_cancel)
    )
    # Committed commercial subscription that can be changed (not cancel-pending).
    commercial_changeable = bool(
        is_stripe
        and status in {BillingStatus.TRIALING, BillingStatus.ACTIVE, BillingStatus.PAST_DUE}
        and subscribed in {PLAN_PLUS, PLAN_BUSINESS}
        and interval in {"monthly", "yearly"}
        and not cancel_scheduled
        and not change_scheduled
    )
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
    actions = {
        "can_checkout_plus": can_checkout,
        "can_checkout_business": can_checkout,
        "can_schedule_downgrade_to_plus": (
            commercial_changeable and subscribed == PLAN_BUSINESS
        ),
        "can_cancel_scheduled_downgrade": (
            is_stripe
            and stripe_ok
            and status in {BillingStatus.TRIALING, BillingStatus.ACTIVE, BillingStatus.PAST_DUE}
            and downgrade_scheduled
        ),
        "can_cancel_scheduled_change": (
            is_stripe and stripe_ok and change_scheduled
        ),
        "can_schedule_billing_change": bool(stripe_ok and commercial_changeable),
        "can_cancel": is_stripe and access_active and not cancel_scheduled and not change_scheduled,
        "can_resume_subscription": (
            is_stripe
            and stripe_ok
            and access_active
            and cancel_scheduled
        ),
        # Commercial upgrade uses subscribed Plus — not effective entitlement
        # (built-in Business trial must not hide Plus → Business).
        "can_upgrade_to_business": (
            commercial_changeable and subscribed == PLAN_PLUS
        ),
        "can_open_portal": bool(
            is_stripe and billing and billing.external_customer_id
        ),
        "can_change_interval": bool(stripe_ok and commercial_changeable),
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
        "future_paid_plan": None,
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
