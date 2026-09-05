"""Scenario 9: cancel paid Plus at period end and let it become Basic.

Fresh Test Clock. Bootstraps to active Plus Monthly, cancels via
request_cancellation (no resume), advances past period end, reconciles.
"""

from __future__ import annotations

import json
import time
from datetime import timedelta
from typing import Any

import stripe
from django.utils import timezone

from billing.catalog import INTERVAL_MONTHLY, PLAN_PLUS
from billing.operations import request_cancellation
from billing.promotion import resolve_audience
from billing.reconciliation import reconcile_subscription_snapshot
from billing.services import (
    apply_due_billing_transitions,
    get_workspace_billing,
    scheduled_change_pending,
)
from billing.state import build_billing_state
from billing.testclock.common import (
    PLUS_MONTHLY_CENTS,
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
from organizations.entitlements.catalog import PLAN_BASIC


def run_scenario9(*, explicit_ack: bool, log=print) -> dict[str, Any]:
    secret = assert_test_clock_environment_allowed(explicit_ack=explicit_ack)
    stripe.api_key = secret

    stamp = timezone.now().strftime("%Y%m%d%H%M%S")
    report: dict[str, Any] = {
        "scenario": 9,
        "product_code_changed": False,
        "additional_product_bug_found": False,
        "files_changed": [
            "backend/billing/testclock/scenario9.py",
            "backend/billing/management/commands/billing_test_clock_scenario9.py",
        ],
        "test_only_files": [
            "backend/billing/testclock/scenario9.py",
            "backend/billing/management/commands/billing_test_clock_scenario9.py",
        ],
    }

    ctx = bring_to_active_plus_after_trial(
        scenario_tag="scenario9",
        stamp=stamp,
        log=log,
    )
    organization = ctx["organization"]
    customer_id = ctx["customer_id"]
    sub_id = ctx["subscription_id"]
    clock_id = ctx["clock_id"]
    provider = ctx["provider"]
    period_end_ts = int(ctx["period_end_ts"])

    report["test_clock_id"] = clock_id
    report["test_customer_id"] = customer_id
    report["workspace_id"] = organization.workspace_id
    report["subscription_id"] = sub_id

    local_before = capture_local_state(organization)
    state_before = build_billing_state(organization)
    stripe_before = stripe.Subscription.retrieve(sub_id, expand=["schedule"])
    report["state_before_cancellation"] = {
        "local": local_before,
        "stripe_status": stripe_before.status,
        "stripe_cancel_at_period_end": bool(
            getattr(stripe_before, "cancel_at_period_end", False)
        ),
        "stripe_schedule": _schedule_id_from_sub(stripe_before),
        "actions": state_before.get("actions"),
    }

    pre_ok = (
        local_before["billing_subscribed_plan"] == PLAN_PLUS
        and local_before["org_plan"] == PLAN_PLUS
        and local_before["billing_interval"] == INTERVAL_MONTHLY
        and stripe_before.status == "active"
        and not local_before["cancel_at_period_end"]
        and not scheduled_change_pending(get_workspace_billing(organization))
        and _schedule_id_from_sub(stripe_before) is None
    )
    if not pre_ok:
        log("FAIL: preconditions before cancellation not met.")
        report["scenario9_pass"] = False
        report["safe_to_continue"] = False
        return report

    paid_before = paid_nonzero_invoices(snapshot_invoices(customer_id))
    all_known_ids = {inv["id"] for inv in snapshot_invoices(customer_id)}

    log("Cancelling paid Plus Monthly (no resume)…")
    billing_cancel = request_cancellation(organization)
    organization.refresh_from_db()
    local_cancel = capture_local_state(organization)
    state_cancel = build_billing_state(organization)
    stripe_cancel = stripe.Subscription.retrieve(sub_id)
    _cps, cpe = subscription_period_bounds(stripe_cancel)
    if cpe:
        period_end_ts = int(cpe)

    payments = stripe.PaymentIntent.list(customer=customer_id, limit=20).data
    pi_ids = {getattr(p, "id", None) for p in payments}
    refund_on_cancel = False
    for r in stripe.Refund.list(limit=30).data:
        pi = getattr(r, "payment_intent", None)
        pi_id = pi if isinstance(pi, str) else getattr(pi, "id", None)
        if pi_id and pi_id in pi_ids:
            refund_on_cancel = True
            break

    report["cancel_effective_date"] = iso(billing_cancel.pending_change_effective_at)
    report["stripe_cancel_at_period_end"] = bool(
        getattr(stripe_cancel, "cancel_at_period_end", False)
    )
    report["resume_available_before_end"] = bool(
        state_cancel["actions"].get("can_resume_subscription")
    )
    report["state_after_cancel"] = {
        "local": local_cancel,
        "actions": state_cancel.get("actions"),
        "period_end": iso(dt_from_ts(period_end_ts)),
    }

    cancel_ok = (
        report["stripe_cancel_at_period_end"]
        and billing_cancel.pending_plan == PLAN_BASIC
        and local_cancel["org_plan"] == PLAN_PLUS
        and local_cancel["billing_subscribed_plan"] == PLAN_PLUS
        and report["resume_available_before_end"]
        and not refund_on_cancel
        and int(billing_cancel.pending_change_effective_at.timestamp())
        == int(period_end_ts)
    )
    report["cancellation_ok"] = cancel_ok
    if not cancel_ok:
        log("FAIL: cancellation assertions not met.")
        report["scenario9_pass"] = False
        report["safe_to_continue"] = False
        return report

    advance_to = dt_from_ts(period_end_ts) + timedelta(hours=1)
    report["clock_advanced_to"] = iso(advance_to)
    log(f"Advancing Test Clock past period end to {report['clock_advanced_to']}…")
    stripe.test_helpers.TestClock.advance(clock_id, frozen_time=ts(advance_to))
    poll_clock_ready(clock_id)

    # Wait for Stripe subscription to end.
    stripe_final = None
    end_wait = time.time() + 180.0
    while time.time() < end_wait:
        stripe_final = stripe.Subscription.retrieve(sub_id, expand=["schedule"])
        if stripe_final.status in {"canceled", "unpaid", "incomplete_expired"}:
            break
        time.sleep(1.5)
    if stripe_final is None or stripe_final.status not in {
        "canceled",
        "unpaid",
        "incomplete_expired",
    }:
        raise TimeoutError(
            f"Subscription did not end; status={getattr(stripe_final, 'status', None)}"
        )

    # Normal reconciliation path (ended statuses → finalize).
    snapshot = provider.retrieve_subscription(sub_id)
    reconcile_subscription_snapshot(organization, snapshot, now=advance_to)
    # Also run due transitions for cancel-at-period-end local convergence.
    apply_due_billing_transitions(organization, now=advance_to)
    organization.refresh_from_db()

    local_after = capture_local_state(organization)
    state_after = build_billing_state(organization)
    billing_after = get_workspace_billing(organization)
    audience = resolve_audience(organization=organization, billing=billing_after)

    invoices_after = snapshot_invoices(customer_id)
    new_paid = [
        inv
        for inv in paid_nonzero_invoices(invoices_after)
        if inv["id"] not in {p["id"] for p in paid_before}
    ]
    renewal_created = any(
        inv["id"] not in all_known_ids
        and (inv["total"] or 0) == PLUS_MONTHLY_CENTS
        and inv["status"] in {"paid", "open", "draft"}
        for inv in invoices_after
    )

    subs = stripe.Subscription.list(customer=customer_id, status="all", limit=10).data
    active_subs = [
        s
        for s in subs
        if getattr(s, "status", None) in {"active", "trialing", "past_due"}
    ]
    payments_final = stripe.PaymentIntent.list(customer=customer_id, limit=20).data
    succeeded = [
        p
        for p in payments_final
        if getattr(p, "status", None) == "succeeded"
        and int(getattr(p, "amount", 0) or 0) > 0
    ]
    amounts = sorted(int(getattr(p, "amount", 0) or 0) for p in succeeded)

    unexpected_refund = False
    pi_ids_final = {getattr(p, "id", None) for p in payments_final}
    for r in stripe.Refund.list(limit=30).data:
        pi = getattr(r, "payment_intent", None)
        pi_id = pi if isinstance(pi, str) else getattr(pi, "id", None)
        if pi_id and pi_id in pi_ids_final:
            unexpected_refund = True
            break

    schedule_ref = _schedule_id_from_sub(stripe_final)
    schedule_active = False
    if schedule_ref:
        try:
            st = getattr(
                stripe.SubscriptionSchedule.retrieve(schedule_ref), "status", None
            )
            schedule_active = st in {"active", "not_started"}
        except Exception:
            schedule_active = False

    pending_cleared = (
        not billing_after.cancel_at_period_end
        and not (billing_after.pending_plan or "").strip()
        and not (billing_after.pending_interval or "").strip()
        and billing_after.pending_change_effective_at is None
        and not scheduled_change_pending(billing_after)
    )

    report["final_stripe_subscription_status"] = stripe_final.status
    report["renewal_invoice_created"] = renewal_created
    report["commercial_plan_after_end"] = (
        local_after["billing_subscribed_plan"] or None
    )
    report["effective_plan_after_end"] = local_after["org_plan"]
    report["local_subscription_status"] = local_after["billing_status"]
    report["pending_state_cleared"] = pending_cleared
    report["resume_available_after_end"] = bool(
        state_after["actions"].get("can_resume_subscription")
    )
    report["promotion_audience_after_end"] = audience
    report["actions_after_end"] = state_after.get("actions")
    report["duplicate_subscription"] = len(active_subs) != 0
    report["duplicate_invoice"] = len(new_paid) != 0
    report["duplicate_payment"] = PLUS_MONTHLY_CENTS in amounts[1:]  # only first paid 499
    # Better: no second 999 payment for a cancelled renewal
    report["duplicate_payment"] = amounts.count(PLUS_MONTHLY_CENTS) != 0
    report["unexpected_refund"] = unexpected_refund
    report["schedule_remains"] = schedule_active
    report["local_stripe_reconciled"] = (
        stripe_final.status in {"canceled", "unpaid", "incomplete_expired"}
        and local_after["billing_status"] == "canceled"
        and local_after["org_plan"] == PLAN_BASIC
        and not (local_after["billing_subscribed_plan"] or "").strip()
        and pending_cleared
    )
    report["succeeded_payment_amounts"] = amounts
    report["can_checkout_again"] = bool(
        state_after["actions"].get("can_checkout_plus")
        and state_after["actions"].get("can_checkout_business")
    )
    report["paid_change_ui_hidden"] = (
        not state_after["actions"].get("can_upgrade_to_business")
        and not state_after["actions"].get("can_schedule_billing_change")
        and not state_after["actions"].get("can_cancel")
        and not state_after["actions"].get("can_resume_subscription")
    )

    post_ok = (
        report["local_stripe_reconciled"]
        and not renewal_created
        and not report["duplicate_subscription"]
        and not report["duplicate_invoice"]
        and not report["duplicate_payment"]
        and not unexpected_refund
        and not schedule_active
        and not report["resume_available_after_end"]
        and audience == "basic"
        and report["can_checkout_again"]
        and report["paid_change_ui_hidden"]
    )
    report["scenario9_pass"] = bool(post_ok and cancel_ok)
    report["safe_to_continue"] = report["scenario9_pass"]

    log(
        f"After end: stripe={stripe_final.status} "
        f"effective={local_after['org_plan']} audience={audience} "
        f"PASS={report['scenario9_pass']}"
    )
    return report


def report_as_text(report: dict[str, Any]) -> str:
    return json.dumps(report, indent=2, default=str)
