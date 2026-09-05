"""Scenario 4: schedule Plus Monthly→Yearly and let it execute at renewal.

Fresh disposable Test Clock. Bootstraps to active Plus Monthly, schedules Plus
Yearly via request_schedule_billing_change, advances past the effective date,
reconciles. Does not enable Group 2 promo if OFF — expects full yearly price.
"""

from __future__ import annotations

import json
import time
from datetime import timedelta
from typing import Any

import stripe
from django.utils import timezone

from billing.catalog import INTERVAL_MONTHLY, INTERVAL_YEARLY, PLAN_PLUS
from billing.coupons import resolve_schedule_coupon
from billing.markets import MARKET_GLOBAL
from billing.operations import request_schedule_billing_change
from billing.prices import price_id_for
from billing.promotion import GROUP_PLUS_MONTHLY, get_settings, group_is_active
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
from billing.testclock.scenario3 import _future_phase_coupon, _schedule_id_from_sub

PLUS_YEARLY_CENTS = 9999


def run_scenario4(*, explicit_ack: bool, log=print) -> dict[str, Any]:
    secret = assert_test_clock_environment_allowed(explicit_ack=explicit_ack)
    stripe.api_key = secret

    stamp = timezone.now().strftime("%Y%m%d%H%M%S")
    report: dict[str, Any] = {
        "scenario": 4,
        "product_code_changed": True,
        "product_fix": (
            "schedule_downgrade now sets billing_cycle_anchor=phase_start on the "
            "target phase (and proration_behavior=none) so monthly→yearly invoices "
            "at the scheduled boundary. Exposed by this Test Clock run."
        ),
        "test_only_files": [
            "backend/billing/testclock/scenario4.py",
            "backend/billing/management/commands/billing_test_clock_scenario4.py",
        ],
    }

    ctx = bring_to_active_plus_after_trial(
        scenario_tag="scenario4",
        stamp=stamp,
        log=log,
    )
    organization = ctx["organization"]
    customer_id = ctx["customer_id"]
    sub_id = ctx["subscription_id"]
    clock_id = ctx["clock_id"]
    provider = ctx["provider"]
    period_start_ts = ctx["period_start_ts"]
    period_end_ts = ctx["period_end_ts"]

    report["test_clock_id"] = clock_id
    report["test_customer_id"] = customer_id
    report["workspace_id"] = organization.workspace_id
    report["subscription_id"] = sub_id

    local_before = capture_local_state(organization)
    stripe_before = stripe.Subscription.retrieve(sub_id, expand=["schedule"])
    invoices_before = snapshot_invoices(customer_id)
    paid_before = paid_nonzero_invoices(invoices_before)
    known_paid_ids = {p["id"] for p in paid_before}

    report["state_before_scheduling"] = {
        "local": local_before,
        "stripe_schedule": _schedule_id_from_sub(stripe_before),
        "paid_invoice_count": len(paid_before),
    }

    pre_ok = (
        local_before["billing_subscribed_plan"] == PLAN_PLUS
        and local_before["billing_interval"] == INTERVAL_MONTHLY
        and local_before["org_plan"] == PLAN_PLUS
        and local_before["billing_status"] == "active"
        and not local_before["cancel_at_period_end"]
        and not scheduled_change_pending(get_workspace_billing(organization))
        and _schedule_id_from_sub(stripe_before) is None
    )
    if not pre_ok:
        log("FAIL: preconditions before scheduling not met.")
        report["scenario4_pass"] = False
        report["safe_to_continue"] = False
        return report

    promo = get_settings()
    group2_on = group_is_active(GROUP_PLUS_MONTHLY, settings_obj=promo)
    coupon_id, coupon_slot = resolve_schedule_coupon(
        organization=organization,
        target_plan=PLAN_PLUS,
        target_interval=INTERVAL_YEARLY,
        market=MARKET_GLOBAL,
    )
    report["group2_plus_monthly_promo_active"] = group2_on
    report["resolved_schedule_coupon_id"] = coupon_id
    report["resolved_schedule_coupon_slot"] = coupon_slot
    if not group2_on:
        report["coupon_note"] = (
            "Group 2 Plus Monthly retention promo is OFF in this sandbox. "
            "Expecting full Plus Yearly price (9999). Not enabling promo for this test."
        )
        expected_yearly_total = PLUS_YEARLY_CENTS
        expect_discount = False
    else:
        report["coupon_note"] = (
            f"Group 2 active; schedule coupon slot={coupon_slot} id={coupon_id}."
        )
        # Retention coupon amount_off 3000 once when configured.
        expected_yearly_total = PLUS_YEARLY_CENTS - 3000 if coupon_id else PLUS_YEARLY_CENTS
        expect_discount = bool(coupon_id)
    report["expected_yearly_invoice_total"] = expected_yearly_total

    yearly_price_id = price_id_for(PLAN_PLUS, INTERVAL_YEARLY, market=MARKET_GLOBAL)
    report["yearly_price_id"] = yearly_price_id

    log("Scheduling Plus Monthly → Plus Yearly…")
    billing_sched = request_schedule_billing_change(
        organization, plan=PLAN_PLUS, interval=INTERVAL_YEARLY
    )
    organization.refresh_from_db()
    local_sched = capture_local_state(organization)
    stripe_sched = stripe.Subscription.retrieve(sub_id, expand=["schedule"])
    schedule_id = _schedule_id_from_sub(stripe_sched)
    future_coupon = _future_phase_coupon(schedule_id) if schedule_id else None

    invoices_after_sched = snapshot_invoices(customer_id)
    new_positive = [
        inv
        for inv in invoices_after_sched
        if inv["id"] not in {i["id"] for i in invoices_before}
        and (inv["total"] or 0) > 0
    ]
    cps_s, cpe_s = subscription_period_bounds(stripe_sched)

    report["scheduled_target"] = {
        "plan": billing_sched.pending_plan,
        "interval": billing_sched.pending_interval,
    }
    report["effective_date"] = iso(billing_sched.pending_change_effective_at)
    report["stripe_schedule_id"] = schedule_id
    report["future_coupon_attached"] = bool(future_coupon)
    report["future_coupon_id"] = future_coupon
    report["immediate_charge"] = bool(new_positive)
    report["state_after_scheduling"] = {
        "local": local_sched,
        "stripe_status": stripe_sched.status,
        "period_start": iso(dt_from_ts(cps_s)) if cps_s else None,
        "period_end": iso(dt_from_ts(cpe_s)) if cpe_s else None,
    }

    sched_ok = (
        local_sched["billing_subscribed_plan"] == PLAN_PLUS
        and local_sched["billing_interval"] == INTERVAL_MONTHLY
        and local_sched["org_plan"] == PLAN_PLUS
        and billing_sched.pending_plan == PLAN_PLUS
        and billing_sched.pending_interval == INTERVAL_YEARLY
        and billing_sched.pending_change_effective_at is not None
        and int(billing_sched.pending_change_effective_at.timestamp())
        == int(period_end_ts)
        and schedule_id is not None
        and not report["immediate_charge"]
        and int(cps_s or 0) == int(period_start_ts)
        and int(cpe_s or 0) == int(period_end_ts)
        and bool(future_coupon) == expect_discount
    )
    report["scheduling_ok"] = sched_ok
    if not sched_ok:
        log("FAIL: scheduling assertions not met.")
        report["scenario4_pass"] = False
        report["safe_to_continue"] = False
        return report

    advance_to = dt_from_ts(period_end_ts) + timedelta(hours=1)
    report["clock_advanced_to"] = iso(advance_to)
    log(f"Advancing Test Clock past schedule effective date to {report['clock_advanced_to']}…")
    stripe.test_helpers.TestClock.advance(clock_id, frozen_time=ts(advance_to))
    poll_clock_ready(clock_id)

    report["stripe_events_note"] = (
        "Test Clock advance emits subscription/schedule/invoice lifecycle events. "
        "Harness converges via retrieve_subscription + reconcile_subscription_snapshot."
    )

    # Wait until interval is yearly and a yearly-priced invoice appears.
    yearly_invoice = None
    stripe_after = None
    end_wait = time.time() + 150.0
    while time.time() < end_wait:
        stripe_after = stripe.Subscription.retrieve(
            sub_id, expand=["schedule", "discounts", "latest_invoice"]
        )
        items = getattr(stripe_after, "items", None)
        item_data = getattr(items, "data", None) if items is not None else None
        interval = None
        if item_data:
            price = getattr(item_data[0], "price", None)
            if price is not None and not isinstance(price, str):
                recurring = getattr(price, "recurring", None)
                interval = getattr(recurring, "interval", None) if recurring else None
        invoices_now = snapshot_invoices(customer_id)
        paid_now = paid_nonzero_invoices(invoices_now)
        new_paid = [inv for inv in paid_now if inv["id"] not in known_paid_ids]
        candidates = [
            inv
            for inv in new_paid
            if inv["total"] in {expected_yearly_total, PLUS_YEARLY_CENTS}
            or (inv["total"] or 0) >= 5000
        ]
        if interval == "year" and candidates:
            yearly_invoice = candidates[0]
            break
        time.sleep(1.5)

    if yearly_invoice is None or stripe_after is None:
        raise TimeoutError("Yearly transition / invoice did not appear in time.")

    snapshot = provider.retrieve_subscription(sub_id)
    reconcile_subscription_snapshot(organization, snapshot, now=advance_to)
    organization.refresh_from_db()
    local_after = capture_local_state(organization)
    billing_after = get_workspace_billing(organization)

    invoices_final = snapshot_invoices(customer_id)
    paid_final = paid_nonzero_invoices(invoices_final)
    new_paid_final = [inv for inv in paid_final if inv["id"] not in known_paid_ids]
    monthly_also = [
        inv for inv in new_paid_final if inv["total"] == PLUS_MONTHLY_CENTS
    ]

    cps_a, cpe_a = subscription_period_bounds(stripe_after)
    stripe_period_start = iso(dt_from_ts(cps_a)) if cps_a else None
    stripe_period_end = iso(dt_from_ts(cpe_a)) if cpe_a else None

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

    schedule_ref = _schedule_id_from_sub(stripe_after)
    future_pending_on_schedule = False
    schedule_status = None
    if schedule_ref:
        try:
            sched_obj = stripe.SubscriptionSchedule.retrieve(schedule_ref)
            schedule_status = getattr(sched_obj, "status", None)
            if schedule_status in {"released", "canceled", "completed"}:
                future_pending_on_schedule = False
            elif schedule_status == "active":
                # Still attached during the final phase is normal with
                # end_behavior=release; only earlier phases imply a future change.
                phases = list(getattr(sched_obj, "phases", None) or [])
                current = getattr(sched_obj, "current_phase", None)
                if current is not None and phases:
                    cur_start = getattr(current, "start_date", None)
                    last = phases[-1]
                    last_raw = last.to_dict() if hasattr(last, "to_dict") else last
                    last_start = (
                        last_raw.get("start_date")
                        if isinstance(last_raw, dict)
                        else getattr(last, "start_date", None)
                    )
                    future_pending_on_schedule = (
                        cur_start is not None
                        and last_start is not None
                        and int(cur_start) != int(last_start)
                    )
                else:
                    future_pending_on_schedule = True
            else:
                future_pending_on_schedule = True
        except Exception:
            future_pending_on_schedule = False
    report["stripe_schedule_status_after"] = schedule_status
    report["schedule_future_pending_change"] = future_pending_on_schedule

    discount_on_yearly = bool(
        yearly_invoice.get("discount_amounts")
        and any((d.get("amount") or 0) > 0 for d in yearly_invoice["discount_amounts"])
    )

    subs_after = stripe.Subscription.list(customer=customer_id, limit=10).data
    payments = stripe.PaymentIntent.list(customer=customer_id, limit=20).data
    succeeded = [
        p
        for p in payments
        if getattr(p, "status", None) == "succeeded"
        and int(getattr(p, "amount", 0) or 0) > 0
    ]
    amounts = sorted(int(getattr(p, "amount", 0) or 0) for p in succeeded)

    # Yearly period should start at old monthly period end.
    period_starts_at_boundary = int(cps_a or 0) == int(period_end_ts)
    # ~1 year later (allow a day of slack for calendar).
    approx_year = 360 * 24 * 3600
    period_span_ok = (
        cps_a is not None
        and cpe_a is not None
        and (int(cpe_a) - int(cps_a)) >= approx_year
    )

    pending_cleared = (
        not scheduled_change_pending(billing_after)
        and not (billing_after.pending_plan or "").strip()
        and not (billing_after.pending_interval or "").strip()
        and billing_after.pending_change_effective_at is None
    )

    report["yearly_invoice_id"] = yearly_invoice["id"]
    report["yearly_invoice_amount"] = yearly_invoice["total"]
    report["discount_applied"] = discount_on_yearly
    report["commercial_plan_after_transition"] = local_after["billing_subscribed_plan"]
    report["billing_interval_after_transition"] = local_after["billing_interval"]
    report["effective_plan_after_transition"] = local_after["org_plan"]
    report["new_yearly_period_start"] = stripe_period_start
    report["new_yearly_period_end"] = stripe_period_end
    report["local_period_start"] = local_after["current_period_start"]
    report["local_period_end"] = local_after["current_period_end"]
    report["pending_local_state_cleared"] = pending_cleared
    report["schedule_transition_completed"] = (
        not future_pending_on_schedule and interval_after == "year"
    )
    report["monthly_renewal_invoice_also_created"] = bool(monthly_also)
    report["duplicate_subscription"] = len(subs_after) != 1
    report["duplicate_invoice"] = len(new_paid_final) != 1
    report["duplicate_payment"] = amounts.count(yearly_invoice["total"]) != 1
    report["local_stripe_reconciled"] = (
        local_after["current_period_start"] == stripe_period_start
        and local_after["current_period_end"] == stripe_period_end
        and local_after["billing_status"] == "active"
        and stripe_after.status == "active"
        and local_after["billing_interval"] == INTERVAL_YEARLY
    )
    report["same_subscription_continues"] = (
        len(subs_after) == 1 and subs_after[0].id == sub_id
    )
    report["succeeded_payment_amounts"] = amounts
    report["stripe_price_after"] = price_id_after
    report["no_cancel_or_resume"] = (
        not local_after["cancel_at_period_end"]
        and not local_after["subscription_state"].get("cancel_at_period_end")
    )
    report["state_after_transition"] = {
        "local": local_after,
        "stripe_status": stripe_after.status,
        "interval": interval_after,
        "unit_amount": unit_after,
        "new_paid_invoices": new_paid_final,
        "schedule_ref": schedule_ref,
        "period_starts_at_boundary": period_starts_at_boundary,
        "period_span_ok": period_span_ok,
    }

    post_ok = (
        report["same_subscription_continues"]
        and local_after["billing_subscribed_plan"] == PLAN_PLUS
        and local_after["billing_interval"] == INTERVAL_YEARLY
        and local_after["org_plan"] == PLAN_PLUS
        and pending_cleared
        and report["schedule_transition_completed"]
        and yearly_invoice["total"] == expected_yearly_total
        and discount_on_yearly == expect_discount
        and not report["monthly_renewal_invoice_also_created"]
        and period_starts_at_boundary
        and period_span_ok
        and report["local_stripe_reconciled"]
        and not report["duplicate_subscription"]
        and not report["duplicate_invoice"]
        and not report["duplicate_payment"]
        and report["no_cancel_or_resume"]
        and price_id_after == yearly_price_id
        and unit_after == PLUS_YEARLY_CENTS
    )
    report["scenario4_pass"] = bool(post_ok and sched_ok)
    report["safe_to_continue"] = report["scenario4_pass"]

    log(
        f"After transition: interval={local_after['billing_interval']} "
        f"yearly_total={yearly_invoice['total']} PASS={report['scenario4_pass']}"
    )
    return report


def report_as_text(report: dict[str, Any]) -> str:
    return json.dumps(report, indent=2, default=str)
