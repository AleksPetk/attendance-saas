"""Scenario 7: schedule Business→Plus Monthly downgrade and let it execute.

Fresh Test Clock. Bootstraps to Business Monthly (Plus-after-trial + upgrade),
schedules Plus Monthly via request_downgrade_to_plus, advances past effective
date, reconciles.
"""

from __future__ import annotations

import json
import time
from datetime import timedelta
from typing import Any

import stripe
from django.utils import timezone

from billing.catalog import INTERVAL_MONTHLY, PLAN_BUSINESS, PLAN_PLUS
from billing.operations import apply_upgrade_to_business, request_downgrade_to_plus
from billing.prices import price_id_for
from billing.markets import MARKET_GLOBAL
from billing.reconciliation import reconcile_subscription_snapshot
from billing.services import get_workspace_billing, scheduled_change_pending
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
from billing.testclock.scenario3 import _schedule_id_from_sub

BUSINESS_MONTHLY_CENTS = 1499


def _future_pending_on_schedule(schedule_id: str | None) -> bool:
    if not schedule_id:
        return False
    try:
        sched_obj = stripe.SubscriptionSchedule.retrieve(schedule_id)
        status = getattr(sched_obj, "status", None)
        if status in {"released", "canceled", "completed"}:
            return False
        if status != "active":
            return True
        phases = list(getattr(sched_obj, "phases", None) or [])
        current = getattr(sched_obj, "current_phase", None)
        if current is None or not phases:
            return True
        cur_start = getattr(current, "start_date", None)
        last = phases[-1]
        last_raw = last.to_dict() if hasattr(last, "to_dict") else last
        last_start = (
            last_raw.get("start_date")
            if isinstance(last_raw, dict)
            else getattr(last, "start_date", None)
        )
        return (
            cur_start is not None
            and last_start is not None
            and int(cur_start) != int(last_start)
        )
    except Exception:
        return False


def run_scenario7(*, explicit_ack: bool, log=print) -> dict[str, Any]:
    secret = assert_test_clock_environment_allowed(explicit_ack=explicit_ack)
    stripe.api_key = secret

    stamp = timezone.now().strftime("%Y%m%d%H%M%S")
    report: dict[str, Any] = {
        "scenario": 7,
        "product_code_changed": True,
        "product_fix": (
            "reconcile_subscription_snapshot: when Stripe already reports Plus, "
            "apply Business→Plus immediately. The old hold on "
            "pending_downgrade && period_end > now blocked post-schedule "
            "downgrades because the new Plus period_end is always in the future."
        ),
        "test_only_files": [
            "backend/billing/testclock/scenario7.py",
            "backend/billing/management/commands/billing_test_clock_scenario7.py",
        ],
        "setup_note": (
            "Active Business Monthly via Plus-after-trial + immediate "
            "apply_upgrade_to_business (same subscription; period end preserved)."
        ),
    }

    ctx = bring_to_active_plus_after_trial(
        scenario_tag="scenario7",
        stamp=stamp,
        log=log,
    )
    organization = ctx["organization"]
    customer_id = ctx["customer_id"]
    sub_id = ctx["subscription_id"]
    clock_id = ctx["clock_id"]
    provider = ctx["provider"]
    period_start_ts = int(ctx["period_start_ts"])
    period_end_ts = int(ctx["period_end_ts"])
    plus_price_id = price_id_for(PLAN_PLUS, INTERVAL_MONTHLY, market=MARKET_GLOBAL)

    report["test_clock_id"] = clock_id
    report["test_customer_id"] = customer_id
    report["workspace_id"] = organization.workspace_id
    report["subscription_id"] = sub_id

    log("Upgrading to Business Monthly for setup…")
    apply_upgrade_to_business(organization)
    organization.refresh_from_db()
    end_wait = time.time() + 60.0
    while time.time() < end_wait:
        local = capture_local_state(organization)
        stripe_biz = stripe.Subscription.retrieve(sub_id)
        items = getattr(stripe_biz, "items", None)
        data = getattr(items, "data", None) if items is not None else None
        unit = None
        if data:
            price = getattr(data[0], "price", None)
            unit = getattr(price, "unit_amount", None) if price is not None else None
        if (
            local["billing_subscribed_plan"] == PLAN_BUSINESS
            and local["org_plan"] == PLAN_BUSINESS
            and unit == BUSINESS_MONTHLY_CENTS
        ):
            break
        snapshot = provider.retrieve_subscription(sub_id)
        reconcile_subscription_snapshot(
            organization, snapshot, now=dt_from_ts(period_start_ts + 60)
        )
        organization.refresh_from_db()
        time.sleep(1.0)

    local_before = capture_local_state(organization)
    stripe_before = stripe.Subscription.retrieve(sub_id, expand=["schedule"])
    cps_b, cpe_b = subscription_period_bounds(stripe_before)
    if cps_b:
        period_start_ts = int(cps_b)
    if cpe_b:
        period_end_ts = int(cpe_b)

    report["state_before_scheduling"] = {
        "local": local_before,
        "stripe_status": stripe_before.status,
        "stripe_schedule": _schedule_id_from_sub(stripe_before),
        "period_start": iso(dt_from_ts(period_start_ts)),
        "period_end": iso(dt_from_ts(period_end_ts)),
    }

    pre_ok = (
        local_before["billing_subscribed_plan"] == PLAN_BUSINESS
        and local_before["billing_interval"] == INTERVAL_MONTHLY
        and local_before["org_plan"] == PLAN_BUSINESS
        and local_before["billing_status"] == "active"
        and not local_before["cancel_at_period_end"]
        and not scheduled_change_pending(get_workspace_billing(organization))
        and _schedule_id_from_sub(stripe_before) is None
    )
    if not pre_ok:
        log("FAIL: Business Monthly preconditions not met.")
        report["scenario7_pass"] = False
        report["safe_to_continue"] = False
        return report

    paid_before_sched = paid_nonzero_invoices(snapshot_invoices(customer_id))
    known_paid_before_sched = {p["id"] for p in paid_before_sched}

    log("Scheduling Business Monthly → Plus Monthly…")
    billing_sched = request_downgrade_to_plus(organization, interval=INTERVAL_MONTHLY)
    organization.refresh_from_db()
    local_sched = capture_local_state(organization)
    stripe_sched = stripe.Subscription.retrieve(sub_id, expand=["schedule"])
    schedule_id = _schedule_id_from_sub(stripe_sched)

    invoices_after_sched = snapshot_invoices(customer_id)
    sched_charge = [
        inv
        for inv in invoices_after_sched
        if inv["id"] not in known_paid_before_sched and (inv["total"] or 0) > 0
    ]

    report["scheduled_target"] = {
        "plan": billing_sched.pending_plan,
        "interval": billing_sched.pending_interval,
    }
    report["effective_date"] = iso(billing_sched.pending_change_effective_at)
    report["stripe_schedule_id"] = schedule_id
    report["immediate_charge"] = bool(sched_charge)

    items = getattr(stripe_sched, "items", None)
    item_data = getattr(items, "data", None) if items is not None else None
    current_unit = None
    if item_data:
        price = getattr(item_data[0], "price", None)
        current_unit = getattr(price, "unit_amount", None) if price else None

    sched_ok = (
        billing_sched.pending_plan == PLAN_PLUS
        and billing_sched.pending_interval == INTERVAL_MONTHLY
        and billing_sched.pending_change_effective_at is not None
        and int(billing_sched.pending_change_effective_at.timestamp())
        == int(period_end_ts)
        and local_sched["billing_subscribed_plan"] == PLAN_BUSINESS
        and local_sched["org_plan"] == PLAN_BUSINESS
        and local_sched["billing_interval"] == INTERVAL_MONTHLY
        and schedule_id is not None
        and not report["immediate_charge"]
        and current_unit == BUSINESS_MONTHLY_CENTS
    )
    report["scheduling_ok"] = sched_ok
    if not sched_ok:
        log("FAIL: scheduling assertions not met.")
        report["scenario7_pass"] = False
        report["safe_to_continue"] = False
        return report

    all_known_ids = {inv["id"] for inv in snapshot_invoices(customer_id)}
    advance_to = dt_from_ts(period_end_ts) + timedelta(hours=1)
    report["clock_advanced_to"] = iso(advance_to)
    log(f"Advancing Test Clock past downgrade effective date to {report['clock_advanced_to']}…")
    stripe.test_helpers.TestClock.advance(clock_id, frozen_time=ts(advance_to))
    poll_clock_ready(clock_id)

    plus_invoice = None
    stripe_after = None
    end_wait = time.time() + 180.0
    while time.time() < end_wait:
        stripe_after = stripe.Subscription.retrieve(
            sub_id, expand=["schedule", "discounts"]
        )
        items = getattr(stripe_after, "items", None)
        item_data = getattr(items, "data", None) if items is not None else None
        interval = None
        unit = None
        price_id = None
        if item_data:
            price = getattr(item_data[0], "price", None)
            if isinstance(price, str):
                price_id = price
            elif price is not None:
                price_id = getattr(price, "id", None)
                unit = getattr(price, "unit_amount", None)
                recurring = getattr(price, "recurring", None)
                interval = getattr(recurring, "interval", None) if recurring else None

        invoices_now = snapshot_invoices(customer_id)
        candidates = [
            inv
            for inv in invoices_now
            if inv["id"] not in all_known_ids
            and (inv["total"] or 0) == PLUS_MONTHLY_CENTS
            and inv["status"] in {"paid", "open", "draft"}
        ]
        paidish = [inv for inv in candidates if inv["status"] in {"paid", "open"}]
        if (
            interval == "month"
            and unit == PLUS_MONTHLY_CENTS
            and price_id == plus_price_id
            and paidish
        ):
            plus_invoice = paidish[0]
            break
        time.sleep(1.5)

    if plus_invoice is None or stripe_after is None:
        raise TimeoutError(
            "Plus Monthly transition/invoice did not appear. "
            f"invoices={[ (i['id'], i['status'], i['total']) for i in snapshot_invoices(customer_id) ]}"
        )

    snapshot = provider.retrieve_subscription(sub_id)
    reconcile_subscription_snapshot(organization, snapshot, now=advance_to)
    organization.refresh_from_db()
    local_after = capture_local_state(organization)
    billing_after = get_workspace_billing(organization)
    cps_a, cpe_a = subscription_period_bounds(stripe_after)

    paid_final = paid_nonzero_invoices(snapshot_invoices(customer_id))
    new_paid = [inv for inv in paid_final if inv["id"] not in all_known_ids]
    business_also = [
        inv for inv in new_paid if inv["total"] == BUSINESS_MONTHLY_CENTS
    ]

    schedule_ref = _schedule_id_from_sub(stripe_after)
    future_pending = _future_pending_on_schedule(schedule_ref)
    pending_cleared = (
        not scheduled_change_pending(billing_after)
        and not (billing_after.pending_plan or "").strip()
        and not (billing_after.pending_interval or "").strip()
        and billing_after.pending_change_effective_at is None
    )

    items = getattr(stripe_after, "items", None)
    item_data = getattr(items, "data", None) if items is not None else None
    unit_after = None
    interval_after = None
    price_id_after = None
    if item_data:
        price = getattr(item_data[0], "price", None)
        if isinstance(price, str):
            price_id_after = price
        elif price is not None:
            price_id_after = getattr(price, "id", None)
            unit_after = getattr(price, "unit_amount", None)
            recurring = getattr(price, "recurring", None)
            interval_after = (
                getattr(recurring, "interval", None) if recurring else None
            )

    discount_on_plus = bool(
        plus_invoice.get("discount_amounts")
        and any((d.get("amount") or 0) > 0 for d in plus_invoice["discount_amounts"])
    )
    post_discount = discount_coupon_id(stripe_after)

    subs = stripe.Subscription.list(customer=customer_id, limit=10).data
    payments = stripe.PaymentIntent.list(customer=customer_id, limit=20).data
    succeeded = [
        p
        for p in payments
        if getattr(p, "status", None) == "succeeded"
        and int(getattr(p, "amount", 0) or 0) > 0
    ]
    amounts = sorted(int(getattr(p, "amount", 0) or 0) for p in succeeded)

    # Unexpected refund: any refund tied to this customer's payment intents.
    customer_pi_ids = {getattr(p, "id", None) for p in payments}
    unexpected_refund = False
    for r in stripe.Refund.list(limit=30).data:
        pi = getattr(r, "payment_intent", None)
        pi_id = pi if isinstance(pi, str) else getattr(pi, "id", None)
        if pi_id and pi_id in customer_pi_ids:
            unexpected_refund = True
            break

    report["renewal_invoice_id"] = plus_invoice["id"]
    report["renewal_invoice_amount"] = plus_invoice["total"]
    report["commercial_plan_after_transition"] = local_after["billing_subscribed_plan"]
    report["effective_plan_after_transition"] = local_after["org_plan"]
    report["billing_interval_after_transition"] = local_after["billing_interval"]
    report["business_renewal_invoice_also_created"] = bool(business_also)
    report["pending_local_state_cleared"] = pending_cleared
    report["schedule_transition_completed"] = (
        not future_pending and interval_after == "month" and unit_after == PLUS_MONTHLY_CENTS
    )
    report["duplicate_subscription"] = len(subs) != 1 or subs[0].id != sub_id
    report["duplicate_invoice"] = len(new_paid) != 1
    report["duplicate_payment"] = amounts.count(PLUS_MONTHLY_CENTS) != 1
    report["local_stripe_reconciled"] = (
        local_after["current_period_start"]
        == (iso(dt_from_ts(cps_a)) if cps_a else None)
        and local_after["current_period_end"]
        == (iso(dt_from_ts(cpe_a)) if cpe_a else None)
        and local_after["billing_status"] == "active"
        and stripe_after.status == "active"
        and local_after["billing_subscribed_plan"] == PLAN_PLUS
        and local_after["billing_interval"] == INTERVAL_MONTHLY
    )
    report["unexpected_refund"] = unexpected_refund
    report["unexpected_coupon"] = bool(discount_on_plus or post_discount)
    report["no_cancel_or_resume"] = (
        not local_after["cancel_at_period_end"]
        and not local_after["subscription_state"].get("cancel_at_period_end")
    )
    report["new_period"] = {
        "start": iso(dt_from_ts(cps_a)) if cps_a else None,
        "end": iso(dt_from_ts(cpe_a)) if cpe_a else None,
    }
    report["succeeded_payment_amounts"] = amounts
    report["stripe_price_after"] = price_id_after

    post_ok = (
        local_after["billing_subscribed_plan"] == PLAN_PLUS
        and local_after["org_plan"] == PLAN_PLUS
        and local_after["billing_interval"] == INTERVAL_MONTHLY
        and plus_invoice["total"] == PLUS_MONTHLY_CENTS
        and not report["business_renewal_invoice_also_created"]
        and pending_cleared
        and report["schedule_transition_completed"]
        and report["local_stripe_reconciled"]
        and not report["duplicate_subscription"]
        and not report["duplicate_invoice"]
        and not report["duplicate_payment"]
        and not report["unexpected_refund"]
        and not report["unexpected_coupon"]
        and report["no_cancel_or_resume"]
        and price_id_after == plus_price_id
        and int(cps_a or 0) == int(period_end_ts)
    )
    report["scenario7_pass"] = bool(post_ok and sched_ok)
    report["safe_to_continue"] = report["scenario7_pass"]

    log(
        f"After transition: plan={local_after['billing_subscribed_plan']} "
        f"amount={plus_invoice['total']} PASS={report['scenario7_pass']}"
    )
    return report


def report_as_text(report: dict[str, Any]) -> str:
    return json.dumps(report, indent=2, default=str)
