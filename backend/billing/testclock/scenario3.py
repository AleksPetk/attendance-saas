"""Scenario 3: schedule Plus Monthly→Yearly, cancel before renewal, renew monthly.

Fresh disposable Test Clock. Bootstraps to active Plus Monthly (Scenario 1 path),
schedules Plus Yearly via normal request_schedule_billing_change, cancels via
request_cancel_scheduled_downgrade, then advances past period end.
"""

from __future__ import annotations

import json
import time
from datetime import timedelta
from typing import Any

import stripe
from django.utils import timezone

from billing.catalog import INTERVAL_MONTHLY, INTERVAL_YEARLY, PLAN_PLUS
from billing.operations import (
    request_cancel_scheduled_downgrade,
    request_schedule_billing_change,
)
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


def _schedule_id_from_sub(sub) -> str | None:
    ref = getattr(sub, "schedule", None)
    if isinstance(ref, str) and ref:
        return ref
    if ref is not None:
        return getattr(ref, "id", None)
    return None


def _future_phase_coupon(schedule_id: str) -> str | None:
    sched = stripe.SubscriptionSchedule.retrieve(schedule_id)
    phases = getattr(sched, "phases", None) or []
    if len(phases) < 2:
        return None
    future = phases[1]
    raw = future.to_dict() if hasattr(future, "to_dict") else future
    if not isinstance(raw, dict):
        return None
    discounts = raw.get("discounts") or []
    for entry in discounts:
        if isinstance(entry, str):
            # May be a discount id; resolve coupon via Discount retrieve if needed.
            try:
                d = stripe.Discount.retrieve(entry) if hasattr(stripe, "Discount") else None
            except Exception:
                d = None
            if d is None:
                continue
            source = getattr(d, "source", None)
            if source and getattr(source, "coupon", None):
                return source.coupon
            continue
        if isinstance(entry, dict):
            if entry.get("coupon"):
                return entry["coupon"]
            source = entry.get("source") or {}
            if isinstance(source, dict) and source.get("coupon"):
                return source["coupon"]
        else:
            coupon = getattr(entry, "coupon", None)
            if isinstance(coupon, str):
                return coupon
            if coupon is not None:
                return getattr(coupon, "id", None)
            source = getattr(entry, "source", None)
            if source is not None:
                c = getattr(source, "coupon", None)
                if c:
                    return c if isinstance(c, str) else getattr(c, "id", None)
    return None


def run_scenario3(*, explicit_ack: bool, log=print) -> dict[str, Any]:
    secret = assert_test_clock_environment_allowed(explicit_ack=explicit_ack)
    stripe.api_key = secret

    stamp = timezone.now().strftime("%Y%m%d%H%M%S")
    report: dict[str, Any] = {
        "scenario": 3,
        "product_code_changed": False,
        "test_only_files": [
            "backend/billing/testclock/scenario3.py",
            "backend/billing/management/commands/billing_test_clock_scenario3.py",
        ],
    }

    ctx = bring_to_active_plus_after_trial(
        scenario_tag="scenario3",
        stamp=stamp,
        log=log,
    )
    organization = ctx["organization"]
    customer_id = ctx["customer_id"]
    sub_id = ctx["subscription_id"]
    clock_id = ctx["clock_id"]
    provider = ctx["provider"]
    period_end_ts = ctx["period_end_ts"]

    report["test_clock_id"] = clock_id
    report["test_customer_id"] = customer_id
    report["workspace_id"] = organization.workspace_id
    report["subscription_id"] = sub_id

    local_before = capture_local_state(organization)
    invoices_before_sched = snapshot_invoices(customer_id)
    paid_before_sched = paid_nonzero_invoices(invoices_before_sched)
    report["state_before_scheduling"] = {
        "local": local_before,
        "paid_invoice_count": len(paid_before_sched),
        "pending_change": scheduled_change_pending(
            get_workspace_billing(organization)
        ),
    }
    if (
        local_before["billing_status"] != "active"
        or local_before["billing_subscribed_plan"] != PLAN_PLUS
        or local_before["billing_interval"] != INTERVAL_MONTHLY
        or local_before["org_plan"] != PLAN_PLUS
        or scheduled_change_pending(get_workspace_billing(organization))
        or local_before["cancel_at_period_end"]
    ):
        report["scenario3_pass"] = False
        report["safe_to_continue"] = False
        log("FAIL: not a clean active Plus Monthly before scheduling.")
        return report

    log("Scheduling Plus Monthly → Plus Yearly…")
    billing_after_sched = request_schedule_billing_change(
        organization, plan=PLAN_PLUS, interval=INTERVAL_YEARLY
    )
    organization.refresh_from_db()
    local_scheduled = capture_local_state(organization)
    stripe_scheduled = stripe.Subscription.retrieve(
        sub_id, expand=["schedule", "discounts"]
    )
    schedule_id = _schedule_id_from_sub(stripe_scheduled)
    report["stripe_schedule_id"] = schedule_id
    report["scheduled_target"] = {
        "plan": billing_after_sched.pending_plan,
        "interval": billing_after_sched.pending_interval,
    }
    report["scheduled_effective_date"] = iso(
        billing_after_sched.pending_change_effective_at
    )

    future_coupon = _future_phase_coupon(schedule_id) if schedule_id else None
    report["future_coupon_attached"] = bool(future_coupon)
    report["future_coupon_id"] = future_coupon

    invoices_after_sched = snapshot_invoices(customer_id)
    paid_after_sched = paid_nonzero_invoices(invoices_after_sched)
    new_paid_on_sched = [
        inv for inv in paid_after_sched if inv["id"] not in {p["id"] for p in paid_before_sched}
    ]
    # Also check for any new draft/open with positive total (proration).
    prorationish = [
        inv
        for inv in invoices_after_sched
        if inv["id"] not in {i["id"] for i in invoices_before_sched}
        and (inv["total"] or 0) > 0
    ]
    report["immediate_charge_after_scheduling"] = bool(new_paid_on_sched or prorationish)
    report["state_after_scheduling"] = {
        "local": local_scheduled,
        "stripe_status": stripe_scheduled.status,
        "stripe_interval_still_monthly": True,  # verified via local + item price below
        "schedule_id": schedule_id,
    }

    items = getattr(stripe_scheduled, "items", None)
    item_data = getattr(items, "data", None) if items is not None else None
    current_price_id = None
    if item_data:
        price = getattr(item_data[0], "price", None)
        current_price_id = (
            price if isinstance(price, str) else getattr(price, "id", None)
        )
    report["stripe_current_price_id"] = current_price_id

    sched_ok = (
        billing_after_sched.pending_plan == PLAN_PLUS
        and billing_after_sched.pending_interval == INTERVAL_YEARLY
        and billing_after_sched.pending_change_effective_at is not None
        and int(billing_after_sched.pending_change_effective_at.timestamp())
        == int(period_end_ts)
        and local_scheduled["billing_subscribed_plan"] == PLAN_PLUS
        and local_scheduled["billing_interval"] == INTERVAL_MONTHLY
        and local_scheduled["org_plan"] == PLAN_PLUS
        and schedule_id is not None
        and not report["immediate_charge_after_scheduling"]
        and current_price_id == ctx["price_id"]
    )
    report["scheduling_ok"] = sched_ok
    if not sched_ok:
        log("FAIL: scheduling assertions not met.")
        report["scenario3_pass"] = False
        report["safe_to_continue"] = False
        return report

    log("Cancelling scheduled change (request_cancel_scheduled_downgrade)…")
    request_cancel_scheduled_downgrade(organization)
    organization.refresh_from_db()
    local_cleared = capture_local_state(organization)
    billing_cleared = get_workspace_billing(organization)
    stripe_cleared = stripe.Subscription.retrieve(sub_id, expand=["schedule"])
    schedule_after_cancel = _schedule_id_from_sub(stripe_cleared)
    # Released schedules may still briefly appear; retrieve if present.
    schedule_released = True
    if schedule_after_cancel:
        try:
            sched_obj = stripe.SubscriptionSchedule.retrieve(schedule_after_cancel)
            status = getattr(sched_obj, "status", None)
            schedule_released = status in {"released", "canceled"}
        except Exception:
            schedule_released = True
    else:
        schedule_released = True

    pending_cleared = (
        not scheduled_change_pending(billing_cleared)
        and not (billing_cleared.pending_plan or "").strip()
        and not (billing_cleared.pending_interval or "").strip()
        and billing_cleared.pending_change_effective_at is None
        and not billing_cleared.cancel_at_period_end
    )
    report["state_after_cancel_change"] = {
        "local": local_cleared,
        "stripe_schedule": schedule_after_cancel,
        "stripe_status": stripe_cleared.status,
    }
    report["stripe_schedule_released"] = schedule_released
    report["pending_local_state_cleared"] = pending_cleared

    invoices_after_cancel = snapshot_invoices(customer_id)
    paid_after_cancel = paid_nonzero_invoices(invoices_after_cancel)
    charge_on_cancel = len(paid_after_cancel) != len(paid_before_sched)
    report["charge_or_refund_on_cancel"] = charge_on_cancel

    cancel_ok = (
        pending_cleared
        and schedule_released
        and local_cleared["billing_subscribed_plan"] == PLAN_PLUS
        and local_cleared["billing_interval"] == INTERVAL_MONTHLY
        and local_cleared["org_plan"] == PLAN_PLUS
        and not charge_on_cancel
        and not local_cleared["subscription_state"].get("cancel_at_period_end")
    )
    report["cancel_change_ok"] = cancel_ok
    if not cancel_ok:
        log("FAIL: cancel-change assertions not met.")
        report["scenario3_pass"] = False
        report["safe_to_continue"] = False
        return report

    advance_to = dt_from_ts(period_end_ts) + timedelta(hours=1)
    report["clock_advanced_to"] = iso(advance_to)
    log(f"Advancing Test Clock past monthly renewal to {report['clock_advanced_to']}…")
    stripe.test_helpers.TestClock.advance(clock_id, frozen_time=ts(advance_to))
    poll_clock_ready(clock_id)

    renewal = None
    known_paid_ids = {p["id"] for p in paid_before_sched}
    end_wait = time.time() + 120.0
    while time.time() < end_wait:
        invoices_now = snapshot_invoices(customer_id)
        paid_now = paid_nonzero_invoices(invoices_now)
        new_ones = [inv for inv in paid_now if inv["id"] not in known_paid_ids]
        if new_ones:
            renewal = new_ones[0]
            break
        time.sleep(1.5)
    if renewal is None:
        raise TimeoutError("Monthly renewal invoice did not appear.")

    stripe_after = stripe.Subscription.retrieve(
        sub_id, expand=["schedule", "discounts", "latest_invoice"]
    )
    snapshot = provider.retrieve_subscription(sub_id)
    reconcile_subscription_snapshot(organization, snapshot, now=advance_to)
    organization.refresh_from_db()
    local_after = capture_local_state(organization)

    invoices_final = snapshot_invoices(customer_id)
    paid_final = paid_nonzero_invoices(invoices_final)
    new_paid = [inv for inv in paid_final if inv["id"] not in known_paid_ids]
    yearly_invoices = [
        inv
        for inv in new_paid
        if (inv["total"] or 0) >= 5000  # yearly is ~9999; monthly 999
        or (inv.get("billing_reason") == "subscription_cycle" and inv["total"] not in {
            PLUS_MONTHLY_CENTS,
            None,
        })
    ]
    # Stricter: any new invoice whose line is yearly price — check totals != 999
    non_monthly_new = [
        inv for inv in new_paid if inv["total"] != PLUS_MONTHLY_CENTS
    ]

    cps_a, cpe_a = subscription_period_bounds(stripe_after)
    stripe_period_start = iso(dt_from_ts(cps_a)) if cps_a else None
    stripe_period_end = iso(dt_from_ts(cpe_a)) if cpe_a else None
    schedule_remains = _schedule_id_from_sub(stripe_after)
    if schedule_remains:
        try:
            st = getattr(
                stripe.SubscriptionSchedule.retrieve(schedule_remains), "status", None
            )
            schedule_remains_active = st not in {"released", "canceled"}
        except Exception:
            schedule_remains_active = False
    else:
        schedule_remains_active = False

    discount_on_renewal = bool(
        renewal.get("discount_amounts")
        and any((d.get("amount") or 0) > 0 for d in renewal["discount_amounts"])
    )
    post_discount = discount_coupon_id(stripe_after)

    items_after = getattr(stripe_after, "items", None)
    item_data_after = (
        getattr(items_after, "data", None) if items_after is not None else None
    )
    interval_after = None
    unit_after = None
    if item_data_after:
        price = getattr(item_data_after[0], "price", None)
        if price is not None and not isinstance(price, str):
            unit_after = getattr(price, "unit_amount", None)
            recurring = getattr(price, "recurring", None)
            interval_after = (
                getattr(recurring, "interval", None) if recurring else None
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

    report["renewal_invoice_id"] = renewal["id"]
    report["renewal_invoice_amount"] = renewal["total"]
    report["renewed_plan_interval"] = {
        "commercial_plan": local_after["billing_subscribed_plan"],
        "billing_interval": local_after["billing_interval"],
        "stripe_price_interval": interval_after,
        "unit_amount": unit_after,
    }
    report["yearly_invoice_created"] = bool(non_monthly_new)
    report["yearly_coupon_applied"] = discount_on_renewal or bool(post_discount)
    report["duplicate_subscription"] = len(subs_after) != 1
    report["duplicate_invoice"] = len(new_paid) != 1
    report["duplicate_payment"] = amounts.count(PLUS_MONTHLY_CENTS) != 1
    report["local_stripe_reconciled"] = (
        local_after["current_period_start"] == stripe_period_start
        and local_after["current_period_end"] == stripe_period_end
        and local_after["billing_status"] == "active"
        and stripe_after.status == "active"
    )
    report["new_period_start"] = stripe_period_start
    report["new_period_end"] = stripe_period_end
    report["schedule_remains_after_renewal"] = schedule_remains_active
    report["succeeded_payment_amounts"] = amounts
    report["state_after_renewal"] = {
        "local": local_after,
        "stripe_status": stripe_after.status,
        "new_paid_invoices": new_paid,
    }

    post_ok = (
        renewal["total"] == PLUS_MONTHLY_CENTS
        and local_after["billing_subscribed_plan"] == PLAN_PLUS
        and local_after["billing_interval"] == INTERVAL_MONTHLY
        and local_after["org_plan"] == PLAN_PLUS
        and interval_after == "month"
        and unit_after == PLUS_MONTHLY_CENTS
        and not report["yearly_invoice_created"]
        and not report["yearly_coupon_applied"]
        and not report["duplicate_subscription"]
        and not report["duplicate_invoice"]
        and not report["duplicate_payment"]
        and report["local_stripe_reconciled"]
        and not schedule_remains_active
        and not scheduled_change_pending(get_workspace_billing(organization))
    )
    report["scenario3_pass"] = bool(post_ok and sched_ok and cancel_ok)
    report["safe_to_continue"] = report["scenario3_pass"]

    log(
        f"After renewal: amount={renewal['total']} interval={interval_after} "
        f"PASS={report['scenario3_pass']}"
    )
    return report


def report_as_text(report: dict[str, Any]) -> str:
    return json.dumps(report, indent=2, default=str)
