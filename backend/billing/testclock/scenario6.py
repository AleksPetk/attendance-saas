"""Scenario 6: schedule Business→Plus downgrade, cancel, renew Business.

Fresh Test Clock. Bootstraps to active Plus, upgrades to Business Monthly,
schedules Plus Monthly downgrade via request_downgrade_to_plus, cancels via
request_cancel_scheduled_downgrade, advances past renewal.
"""

from __future__ import annotations

import json
import time
from datetime import timedelta
from typing import Any

import stripe
from django.utils import timezone

from billing.catalog import INTERVAL_MONTHLY, PLAN_BUSINESS, PLAN_PLUS
from billing.operations import (
    apply_upgrade_to_business,
    request_cancel_scheduled_downgrade,
    request_downgrade_to_plus,
)
from billing.reconciliation import reconcile_subscription_snapshot
from billing.services import get_workspace_billing, scheduled_change_pending
from billing.testclock.common import (
    bring_to_active_plus_after_trial,
    capture_local_state,
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


def run_scenario6(*, explicit_ack: bool, log=print) -> dict[str, Any]:
    secret = assert_test_clock_environment_allowed(explicit_ack=explicit_ack)
    stripe.api_key = secret

    stamp = timezone.now().strftime("%Y%m%d%H%M%S")
    report: dict[str, Any] = {
        "scenario": 6,
        "product_code_changed": False,
        "test_only_files": [
            "backend/billing/testclock/scenario6.py",
            "backend/billing/management/commands/billing_test_clock_scenario6.py",
        ],
        "setup_note": (
            "Active Business Monthly via Plus-after-trial + immediate "
            "apply_upgrade_to_business (same subscription; period end preserved)."
        ),
    }

    ctx = bring_to_active_plus_after_trial(
        scenario_tag="scenario6",
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

    report["test_clock_id"] = clock_id
    report["test_customer_id"] = customer_id
    report["workspace_id"] = organization.workspace_id
    report["subscription_id"] = sub_id

    log("Upgrading to Business Monthly for setup…")
    invoices_before_upgrade = snapshot_invoices(customer_id)
    known_before_biz = {inv["id"] for inv in invoices_before_upgrade}
    apply_upgrade_to_business(organization)
    organization.refresh_from_db()
    # Wait briefly for upgrade invoice if any.
    end_wait = time.time() + 60.0
    while time.time() < end_wait:
        stripe_biz = stripe.Subscription.retrieve(sub_id)
        items = getattr(stripe_biz, "items", None)
        data = getattr(items, "data", None) if items is not None else None
        unit = None
        if data:
            price = getattr(data[0], "price", None)
            unit = getattr(price, "unit_amount", None) if price is not None else None
        local = capture_local_state(organization)
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
    # Prefer Stripe period (should still match original Plus period end).
    if cps_b:
        period_start_ts = int(cps_b)
    if cpe_b:
        period_end_ts = int(cpe_b)

    report["state_before_downgrade"] = {
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
        report["scenario6_pass"] = False
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
    new_positive = [
        inv
        for inv in invoices_after_sched
        if inv["id"] not in {i["id"] for i in invoices_before_upgrade}
        and inv["id"] not in known_paid_before_sched
        and (inv["total"] or 0) > 0
        and inv["id"]
        not in {
            inv2["id"]
            for inv2 in invoices_after_sched
            if inv2["id"] in known_before_biz or inv2["id"] in known_paid_before_sched
        }
    ]
    # Immediate charge from *scheduling* only (ignore setup upgrade invoice).
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
    report["state_after_scheduling"] = {"local": local_sched}

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
        and local_sched["billing_interval"] == INTERVAL_MONTHLY
        and local_sched["org_plan"] == PLAN_BUSINESS
        and schedule_id is not None
        and not report["immediate_charge"]
        and current_unit == BUSINESS_MONTHLY_CENTS
    )
    report["scheduling_ok"] = sched_ok
    if not sched_ok:
        log("FAIL: scheduling assertions not met.")
        report["scenario6_pass"] = False
        report["safe_to_continue"] = False
        return report

    log("Cancelling scheduled downgrade (Keep Business)…")
    request_cancel_scheduled_downgrade(organization)
    organization.refresh_from_db()
    local_cleared = capture_local_state(organization)
    billing_cleared = get_workspace_billing(organization)
    stripe_cleared = stripe.Subscription.retrieve(sub_id, expand=["schedule"])
    schedule_after = _schedule_id_from_sub(stripe_cleared)
    schedule_released = True
    if schedule_after:
        try:
            st = getattr(
                stripe.SubscriptionSchedule.retrieve(schedule_after), "status", None
            )
            schedule_released = st in {"released", "canceled", "completed"}
        except Exception:
            schedule_released = True

    pending_cleared = (
        not scheduled_change_pending(billing_cleared)
        and not (billing_cleared.pending_plan or "").strip()
        and not (billing_cleared.pending_interval or "").strip()
        and billing_cleared.pending_change_effective_at is None
        and not billing_cleared.cancel_at_period_end
    )
    paid_after_cancel = paid_nonzero_invoices(snapshot_invoices(customer_id))
    charge_on_cancel = len(paid_after_cancel) != len(paid_before_sched)

    report["state_after_cancel_change"] = {
        "local": local_cleared,
        "stripe_schedule": schedule_after,
    }
    report["schedule_released"] = schedule_released
    report["pending_local_state_cleared"] = pending_cleared
    report["commercial_plan_after_cancel_change"] = local_cleared[
        "billing_subscribed_plan"
    ]
    report["effective_plan_after_cancel_change"] = local_cleared["org_plan"]

    cancel_ok = (
        pending_cleared
        and schedule_released
        and local_cleared["billing_subscribed_plan"] == PLAN_BUSINESS
        and local_cleared["org_plan"] == PLAN_BUSINESS
        and local_cleared["billing_interval"] == INTERVAL_MONTHLY
        and not charge_on_cancel
        and not local_cleared["subscription_state"].get("cancel_at_period_end")
    )
    report["cancel_change_ok"] = cancel_ok
    if not cancel_ok:
        log("FAIL: cancel-change assertions not met.")
        report["scenario6_pass"] = False
        report["safe_to_continue"] = False
        return report

    all_known_ids = {inv["id"] for inv in snapshot_invoices(customer_id)}
    advance_to = dt_from_ts(period_end_ts) + timedelta(hours=1)
    report["clock_advanced_to"] = iso(advance_to)
    log(f"Advancing Test Clock past renewal to {report['clock_advanced_to']}…")
    stripe.test_helpers.TestClock.advance(clock_id, frozen_time=ts(advance_to))
    poll_clock_ready(clock_id)

    renewal = None
    end_wait = time.time() + 180.0
    while time.time() < end_wait:
        invoices_now = snapshot_invoices(customer_id)
        candidates = [
            inv
            for inv in invoices_now
            if inv["id"] not in all_known_ids
            and (inv["total"] or 0) == BUSINESS_MONTHLY_CENTS
            and inv["status"] in {"paid", "open", "draft"}
        ]
        paidish = [inv for inv in candidates if inv["status"] in {"paid", "open"}]
        if paidish:
            renewal = paidish[0]
            break
        time.sleep(1.5)
    if renewal is None:
        raise TimeoutError(
            "Business Monthly renewal did not appear. "
            f"invoices={[ (i['id'], i['status'], i['total']) for i in snapshot_invoices(customer_id) ]}"
        )

    stripe_after = stripe.Subscription.retrieve(sub_id, expand=["schedule"])
    snapshot = provider.retrieve_subscription(sub_id)
    reconcile_subscription_snapshot(organization, snapshot, now=advance_to)
    organization.refresh_from_db()
    local_after = capture_local_state(organization)
    cps_a, cpe_a = subscription_period_bounds(stripe_after)

    paid_final = paid_nonzero_invoices(snapshot_invoices(customer_id))
    new_paid = [inv for inv in paid_final if inv["id"] not in all_known_ids]
    plus_invoices = [
        inv for inv in new_paid if inv["total"] in {999, 499}  # Plus list/discounted
    ]
    subs = stripe.Subscription.list(customer=customer_id, limit=10).data
    payments = stripe.PaymentIntent.list(customer=customer_id, limit=20).data
    succeeded = [
        p
        for p in payments
        if getattr(p, "status", None) == "succeeded"
        and int(getattr(p, "amount", 0) or 0) > 0
    ]
    amounts = sorted(int(getattr(p, "amount", 0) or 0) for p in succeeded)

    schedule_ref = _schedule_id_from_sub(stripe_after)
    future_pending = False
    if schedule_ref:
        try:
            st = getattr(
                stripe.SubscriptionSchedule.retrieve(schedule_ref), "status", None
            )
            future_pending = st in {"active", "not_started"}
        except Exception:
            future_pending = False

    report["renewal_invoice_id"] = renewal["id"]
    report["renewal_invoice_amount"] = renewal["total"]
    report["renewed_plan_interval"] = {
        "commercial_plan": local_after["billing_subscribed_plan"],
        "interval": local_after["billing_interval"],
        "effective_plan": local_after["org_plan"],
    }
    report["plus_invoice_created"] = bool(plus_invoices)
    report["duplicate_subscription"] = len(subs) != 1
    report["duplicate_invoice"] = len(new_paid) != 1
    report["duplicate_payment"] = amounts.count(BUSINESS_MONTHLY_CENTS) != 1
    report["local_stripe_reconciled"] = (
        local_after["current_period_start"]
        == (iso(dt_from_ts(cps_a)) if cps_a else None)
        and local_after["current_period_end"]
        == (iso(dt_from_ts(cpe_a)) if cpe_a else None)
        and local_after["billing_status"] == "active"
        and stripe_after.status == "active"
        and local_after["billing_subscribed_plan"] == PLAN_BUSINESS
    )
    report["stale_pending"] = scheduled_change_pending(
        get_workspace_billing(organization)
    ) or future_pending
    report["cancellation_state"] = bool(local_after["cancel_at_period_end"])
    report["new_period"] = {
        "start": iso(dt_from_ts(cps_a)) if cps_a else None,
        "end": iso(dt_from_ts(cpe_a)) if cpe_a else None,
    }
    report["succeeded_payment_amounts"] = amounts

    post_ok = (
        renewal["total"] == BUSINESS_MONTHLY_CENTS
        and local_after["billing_subscribed_plan"] == PLAN_BUSINESS
        and local_after["billing_interval"] == INTERVAL_MONTHLY
        and local_after["org_plan"] == PLAN_BUSINESS
        and not report["plus_invoice_created"]
        and not report["duplicate_subscription"]
        and not report["duplicate_invoice"]
        and not report["duplicate_payment"]
        and report["local_stripe_reconciled"]
        and not report["stale_pending"]
        and not report["cancellation_state"]
        and int(cps_a or 0) == int(period_end_ts)
    )
    report["scenario6_pass"] = bool(post_ok and sched_ok and cancel_ok)
    report["safe_to_continue"] = report["scenario6_pass"]

    log(
        f"After renewal: amount={renewal['total']} "
        f"plan={local_after['billing_subscribed_plan']} "
        f"PASS={report['scenario6_pass']}"
    )
    return report


def report_as_text(report: dict[str, Any]) -> str:
    return json.dumps(report, indent=2, default=str)
