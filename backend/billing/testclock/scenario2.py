"""Scenario 2: first full Plus Monthly renewal after discounted first paid month.

Fresh disposable Test Clock / customer / workspace. Bootstraps through the
Scenario 1 architecture to active Plus (discounted first invoice), then advances
past the next period boundary and verifies a full-price renewal.
"""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

import stripe
from django.utils import timezone

from billing.catalog import INTERVAL_MONTHLY, PLAN_PLUS
from billing.reconciliation import reconcile_subscription_snapshot
from billing.testclock.common import (
    PLUS_MONTHLY_CENTS,
    bring_to_active_plus_after_trial,
    capture_local_state,
    discount_coupon_id,
    dt_from_ts,
    iso,
    paid_nonzero_invoices,
    poll_clock_ready,
    snapshot_invoices,
    subscription_period_bounds,
    ts,
)
from billing.testclock.guards import assert_test_clock_environment_allowed


def run_scenario2(*, explicit_ack: bool, log=print) -> dict[str, Any]:
    secret = assert_test_clock_environment_allowed(explicit_ack=explicit_ack)
    stripe.api_key = secret

    stamp = timezone.now().strftime("%Y%m%d%H%M%S")
    report: dict[str, Any] = {
        "scenario": 2,
        "product_code_changed": False,
        "test_only_files": [
            "backend/billing/testclock/common.py",
            "backend/billing/testclock/scenario2.py",
            "backend/billing/management/commands/billing_test_clock_scenario2.py",
        ],
    }

    ctx = bring_to_active_plus_after_trial(
        scenario_tag="scenario2",
        stamp=stamp,
        log=log,
    )
    organization = ctx["organization"]
    customer_id = ctx["customer_id"]
    sub_id = ctx["subscription_id"]
    clock_id = ctx["clock_id"]
    provider = ctx["provider"]
    period_end_ts = ctx["period_end_ts"]
    period_start_ts = ctx["period_start_ts"]

    report["test_clock_id"] = clock_id
    report["test_customer_id"] = customer_id
    report["workspace_id"] = organization.workspace_id
    report["subscription_id"] = sub_id
    report["previous_discounted_invoice"] = ctx["first_paid_invoice"]
    report["coupon_id"] = ctx["coupon_id"]

    # Re-fetch Stripe after first paid month for pre-renewal snapshot.
    stripe_before = stripe.Subscription.retrieve(
        sub_id, expand=["latest_invoice", "discounts", "schedule"]
    )
    local_before = capture_local_state(organization)
    invoices_before = snapshot_invoices(customer_id)
    paid_before = paid_nonzero_invoices(invoices_before)
    active_discount = discount_coupon_id(stripe_before)

    cps_b, cpe_b = subscription_period_bounds(stripe_before)
    report["state_before_renewal"] = {
        "local": local_before,
        "stripe_status": stripe_before.status,
        "stripe_schedule": getattr(stripe_before, "schedule", None),
        "stripe_active_discount_coupon": active_discount,
        "stripe_period_start": iso(dt_from_ts(cps_b)) if cps_b else None,
        "stripe_period_end": iso(dt_from_ts(cpe_b)) if cpe_b else None,
        "paid_invoice_count": len(paid_before),
        "subscription_count": len(
            stripe.Subscription.list(customer=customer_id, limit=10).data
        ),
    }

    pre_ok = (
        stripe_before.status == "active"
        and local_before["billing_subscribed_plan"] == PLAN_PLUS
        and local_before["org_plan"] == PLAN_PLUS
        and local_before["billing_interval"] == INTERVAL_MONTHLY
        and local_before["billing_status"] == "active"
        and not local_before["cancel_at_period_end"]
        and not (local_before["pending_plan"] or "").strip()
        and not (local_before["pending_interval"] or "").strip()
        and getattr(stripe_before, "schedule", None) is None
        and len(paid_before) == 1
        and paid_before[0]["total"] == ctx["first_paid_invoice"]["total"]
        and report["state_before_renewal"]["subscription_count"] == 1
        # Once-only coupon must not still sit on the subscription for renewal.
        and active_discount is None
    )
    report["preconditions_ok"] = pre_ok
    if not pre_ok:
        log("FAIL: preconditions before renewal not met.")
        report["scenario2_pass"] = False
        report["safe_to_continue"] = False
        return report

    advance_to = dt_from_ts(period_end_ts) + timedelta(hours=1)
    report["clock_advanced_to"] = iso(advance_to)
    log(f"Advancing Test Clock past renewal boundary to {report['clock_advanced_to']}…")
    stripe.test_helpers.TestClock.advance(clock_id, frozen_time=ts(advance_to))
    poll_clock_ready(clock_id)

    # Wait until a second non-zero paid invoice appears (renewal).
    renewal = None
    deadline_s = 120.0
    import time

    end_wait = time.time() + deadline_s
    while time.time() < end_wait:
        invoices_after = snapshot_invoices(customer_id)
        paid_after = paid_nonzero_invoices(invoices_after)
        if len(paid_after) >= 2:
            renewal = paid_after[-1] if paid_after[0]["id"] == paid_before[0]["id"] else None
            # Prefer the invoice that is not the known discounted first.
            for inv in paid_after:
                if inv["id"] != paid_before[0]["id"]:
                    renewal = inv
                    break
            if renewal is not None:
                break
        time.sleep(1.5)
    if renewal is None:
        raise TimeoutError("Renewal invoice did not appear after clock advance.")

    stripe_after = stripe.Subscription.retrieve(
        sub_id, expand=["latest_invoice", "discounts", "schedule"]
    )
    snapshot = provider.retrieve_subscription(sub_id)
    reconcile_subscription_snapshot(organization, snapshot, now=advance_to)
    organization.refresh_from_db()
    local_after = capture_local_state(organization)

    invoices_final = snapshot_invoices(customer_id)
    paid_final = paid_nonzero_invoices(invoices_final)
    subs_after = stripe.Subscription.list(customer=customer_id, limit=10).data
    payments = stripe.PaymentIntent.list(customer=customer_id, limit=20).data
    succeeded_payments = [
        p for p in payments if getattr(p, "status", None) == "succeeded"
        and int(getattr(p, "amount", 0) or 0) > 0
    ]

    cps_a, cpe_a = subscription_period_bounds(stripe_after)
    stripe_period_start = iso(dt_from_ts(cps_a)) if cps_a else None
    stripe_period_end = iso(dt_from_ts(cpe_a)) if cpe_a else None
    discount_on_renewal = bool(
        renewal.get("discount_amounts")
        and any((d.get("amount") or 0) > 0 for d in renewal["discount_amounts"])
    )
    post_discount = discount_coupon_id(stripe_after)

    items = getattr(stripe_after, "items", None)
    item_data = getattr(items, "data", None) if items is not None else None
    renewal_unit = None
    if item_data:
        price = getattr(item_data[0], "price", None)
        renewal_unit = getattr(price, "unit_amount", None) if price else None

    unexpected_pending = bool(
        local_after["cancel_at_period_end"]
        or (local_after["pending_plan"] or "").strip()
        or (local_after["pending_interval"] or "").strip()
        or getattr(stripe_after, "schedule", None)
        or local_after["subscription_state"].get("pending_plan")
        or local_after["subscription_state"].get("pending_interval")
        or local_after["subscription_state"].get("cancel_at_period_end")
    )

    # Exactly one new non-zero invoice beyond the discounted first.
    new_paid = [inv for inv in paid_final if inv["id"] != paid_before[0]["id"]]
    duplicate_invoice = len(new_paid) != 1
    # Duplicate payment: more than one succeeded PI for the renewal amount
    # beyond the discounted first (499) — expect one 499 + one 999.
    amounts = sorted(int(getattr(p, "amount", 0) or 0) for p in succeeded_payments)
    duplicate_payment = amounts.count(PLUS_MONTHLY_CENTS) != 1 or len(succeeded_payments) != 2

    periods_advanced = (
        cps_a is not None
        and cpe_a is not None
        and int(cps_a) == int(period_end_ts)
        and int(cps_a) > int(period_start_ts)
        and int(cpe_a) > int(cps_a)
    )
    local_stripe_match = (
        local_after["current_period_start"] == stripe_period_start
        and local_after["current_period_end"] == stripe_period_end
    )

    report["renewal_invoice_id"] = renewal["id"]
    report["renewal_invoice_amount"] = renewal["total"]
    report["discount_applied_on_renewal"] = discount_on_renewal
    report["stripe_subscription_status"] = stripe_after.status
    report["commercial_plan_after_renewal"] = local_after["billing_subscribed_plan"]
    report["effective_plan_after_renewal"] = local_after["org_plan"]
    report["new_period_start"] = stripe_period_start
    report["new_period_end"] = stripe_period_end
    report["local_period_start"] = local_after["current_period_start"]
    report["local_period_end"] = local_after["current_period_end"]
    report["local_stripe_periods_match"] = local_stripe_match
    report["duplicate_subscription"] = len(subs_after) != 1
    report["duplicate_invoice"] = duplicate_invoice
    report["duplicate_payment"] = duplicate_payment
    report["unexpected_pending_state"] = unexpected_pending
    report["stripe_discount_after_renewal"] = post_discount
    report["renewal_unit_amount"] = renewal_unit
    report["succeeded_payment_amounts"] = amounts
    report["state_after_renewal"] = {
        "local": local_after,
        "stripe_status": stripe_after.status,
        "stripe_schedule": getattr(stripe_after, "schedule", None),
        "invoices": invoices_final,
        "paid_invoices": paid_final,
        "subscription_count": len(subs_after),
        "periods_advanced": periods_advanced,
    }

    post_ok = (
        stripe_after.status == "active"
        and local_after["billing_subscribed_plan"] == PLAN_PLUS
        and local_after["org_plan"] == PLAN_PLUS
        and local_after["billing_interval"] == INTERVAL_MONTHLY
        and local_after["billing_status"] == "active"
        and renewal["total"] == PLUS_MONTHLY_CENTS
        and not discount_on_renewal
        and post_discount is None
        and renewal_unit == PLUS_MONTHLY_CENTS
        and periods_advanced
        and local_stripe_match
        and not report["duplicate_subscription"]
        and not duplicate_invoice
        and not duplicate_payment
        and not unexpected_pending
        and len(paid_final) == 2
    )
    report["scenario2_pass"] = bool(post_ok)
    report["safe_to_continue"] = bool(post_ok)

    log(
        f"After renewal: stripe={stripe_after.status} "
        f"renewal_total={renewal['total']} discount={discount_on_renewal} "
        f"PASS={report['scenario2_pass']}"
    )
    return report


def report_as_text(report: dict[str, Any]) -> str:
    return json.dumps(report, indent=2, default=str)
