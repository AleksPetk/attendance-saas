"""Scenario 5: mid-period Plus→Business upgrade after discounted first Plus month.

Fresh Test Clock. Bootstraps to active discounted Plus Monthly, advances to
mid-period, previews/applies immediate Business upgrade via normal operations,
then advances to the next renewal.
"""

from __future__ import annotations

import json
import time
from datetime import timedelta
from typing import Any

import stripe
from django.utils import timezone

from billing.catalog import INTERVAL_MONTHLY, PLAN_BUSINESS, PLAN_PLUS
from billing.operations import apply_upgrade_to_business, preview_upgrade_to_business
from billing.reconciliation import reconcile_subscription_snapshot
from billing.services import get_workspace_billing, scheduled_change_pending
from billing.testclock.common import (
    FIRST_PAID_DISCOUNTED_CENTS,
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
from billing.upgrade_amount import immediate_upgrade_amount_cents

BUSINESS_MONTHLY_CENTS = 1499


def _line_breakdown(invoice) -> dict[str, Any]:
    lines = []
    raw_lines = getattr(invoice, "lines", None)
    data = getattr(raw_lines, "data", None) if raw_lines is not None else None
    if data is None and isinstance(invoice, dict):
        data = ((invoice.get("lines") or {}).get("data")) or []
    unused_credit = 0
    business_proration = 0
    tax_total = 0
    for line in data or []:
        raw = line.to_dict() if hasattr(line, "to_dict") else line
        if not isinstance(raw, dict):
            continue
        amount = int(raw.get("amount") or 0)
        desc = str(raw.get("description") or "")
        parent = raw.get("parent") or {}
        details = parent.get("subscription_item_details") or {}
        is_proration = bool(details.get("proration"))
        lines.append(
            {
                "description": desc,
                "amount": amount,
                "proration": is_proration,
                "period": raw.get("period"),
            }
        )
        if is_proration and amount < 0:
            unused_credit += amount
        elif is_proration and amount > 0:
            business_proration += amount
        taxes = raw.get("taxes") or []
        for tax in taxes:
            if isinstance(tax, dict):
                tax_total += int(tax.get("amount") or 0)
    return {
        "lines": lines,
        "unused_plus_credit_cents": unused_credit,
        "business_prorated_charge_cents": business_proration,
        "tax_cents": tax_total,
        "invoice_amount_due": getattr(invoice, "amount_due", None)
        if not isinstance(invoice, dict)
        else invoice.get("amount_due"),
        "invoice_total": getattr(invoice, "total", None)
        if not isinstance(invoice, dict)
        else invoice.get("total"),
        "invoice_subtotal": getattr(invoice, "subtotal", None)
        if not isinstance(invoice, dict)
        else invoice.get("subtotal"),
    }


def run_scenario5(*, explicit_ack: bool, log=print) -> dict[str, Any]:
    secret = assert_test_clock_environment_allowed(explicit_ack=explicit_ack)
    stripe.api_key = secret

    stamp = timezone.now().strftime("%Y%m%d%H%M%S")
    report: dict[str, Any] = {
        "scenario": 5,
        "product_code_changed": True,
        "product_fix": (
            "preview_upgrade/apply_upgrade now use Test Clock frozen_time for "
            "proration_date when the subscription has a test_clock (Live still "
            "uses wall clock). Required for mid-period Test Clock upgrades."
        ),
        "test_only_files": [
            "backend/billing/testclock/scenario5.py",
            "backend/billing/management/commands/billing_test_clock_scenario5.py",
        ],
    }

    ctx = bring_to_active_plus_after_trial(
        scenario_tag="scenario5",
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
    first_paid = ctx["first_paid_invoice"]

    report["test_clock_id"] = clock_id
    report["test_customer_id"] = customer_id
    report["workspace_id"] = organization.workspace_id
    report["subscription_id"] = sub_id
    report["first_plus_invoice_amount"] = first_paid["total"]
    report["acquisition_discount_applied"] = bool(
        first_paid.get("discount_amounts")
        and any((d.get("amount") or 0) > 0 for d in first_paid["discount_amounts"])
    )
    report["paid_period_start"] = iso(dt_from_ts(period_start_ts))
    report["paid_period_end"] = iso(dt_from_ts(period_end_ts))

    local_paid = capture_local_state(organization)
    stripe_paid = stripe.Subscription.retrieve(sub_id, expand=["discounts", "schedule"])
    if (
        local_paid["billing_subscribed_plan"] != PLAN_PLUS
        or local_paid["billing_interval"] != INTERVAL_MONTHLY
        or local_paid["org_plan"] != PLAN_PLUS
        or stripe_paid.status != "active"
        or first_paid["total"] != FIRST_PAID_DISCOUNTED_CENTS
        or discount_coupon_id(stripe_paid) is not None
        or _schedule_id_from_sub(stripe_paid) is not None
        or scheduled_change_pending(get_workspace_billing(organization))
        or local_paid["cancel_at_period_end"]
    ):
        log("FAIL: post-first-invoice Plus Monthly preconditions not met.")
        report["scenario5_pass"] = False
        report["safe_to_continue"] = False
        return report

    midpoint_ts = period_start_ts + (period_end_ts - period_start_ts) // 2
    advance_mid = dt_from_ts(midpoint_ts)
    report["clock_position_when_upgraded"] = iso(advance_mid)
    report["remaining_seconds_at_upgrade"] = period_end_ts - midpoint_ts
    log(f"Advancing Test Clock to mid-period {report['clock_position_when_upgraded']}…")
    stripe.test_helpers.TestClock.advance(clock_id, frozen_time=midpoint_ts)
    poll_clock_ready(clock_id)

    log("Previewing Plus Monthly → Business Monthly (normal path)…")
    preview = preview_upgrade_to_business(organization)

    # Raw Stripe preview lines for credit/charge reporting (same params as provider).
    item_id = provider._item_id(sub_id)
    from billing.prices import price_id_for
    from billing.markets import MARKET_GLOBAL

    biz_price = price_id_for(PLAN_BUSINESS, INTERVAL_MONTHLY, market=MARKET_GLOBAL)
    raw_preview = stripe.Invoice.create_preview(
        customer=customer_id,
        subscription=sub_id,
        subscription_details={
            "items": [{"id": item_id, "price": biz_price}],
            "proration_behavior": "always_invoice",
            "proration_date": midpoint_ts,
            "billing_cycle_anchor": "unchanged",
        },
    )
    breakdown = _line_breakdown(raw_preview)
    derived_due = immediate_upgrade_amount_cents(
        raw_preview, current_period_end_ts=period_end_ts
    )
    report["upgrade_preview"] = {
        "checkstation_amount_due_cents": preview.amount_due_cents,
        "checkstation_recurring_cents": preview.recurring_cents,
        "checkstation_next_renewal_at": iso(preview.next_renewal_at),
        "stripe_derived_immediate_cents": derived_due,
        "breakdown": breakdown,
    }
    report["unused_plus_credit"] = breakdown["unused_plus_credit_cents"]
    report["business_prorated_charge"] = breakdown["business_prorated_charge_cents"]
    report["final_amount_due"] = preview.amount_due_cents

    # Explain discount effect without assuming 999 vs 499.
    credit_abs = abs(int(breakdown["unused_plus_credit_cents"] or 0))
    full_half_plus = PLUS_MONTHLY_CENTS // 2  # ~500 if based on list price
    discounted_half_plus = FIRST_PAID_DISCOUNTED_CENTS // 2  # ~250 if based on paid
    if credit_abs == 0:
        discount_effect = "Stripe returned no unused Plus credit."
    elif abs(credit_abs - full_half_plus) <= 15:
        discount_effect = (
            f"Unused Plus credit (~{credit_abs}) is near half of list Plus "
            f"({PLUS_MONTHLY_CENTS}); Stripe appears to credit unused time from "
            f"the list/catalog price, not the discounted {FIRST_PAID_DISCOUNTED_CENTS} "
            f"actually paid."
        )
    elif abs(credit_abs - discounted_half_plus) <= 15:
        discount_effect = (
            f"Unused Plus credit (~{credit_abs}) is near half of the discounted "
            f"amount paid ({FIRST_PAID_DISCOUNTED_CENTS}); Stripe appears to credit "
            f"based on what was actually charged."
        )
    else:
        discount_effect = (
            f"Unused Plus credit is {credit_abs} cents (Stripe actual). "
            f"For reference: half list≈{full_half_plus}, half paid≈{discounted_half_plus}."
        )
    report["how_previous_plus_discount_affected_proration"] = discount_effect

    if preview.amount_due_cents != derived_due:
        log("FAIL: CheckStation preview amount != Stripe-derived immediate amount.")
        report["scenario5_pass"] = False
        report["safe_to_continue"] = False
        return report

    invoices_before_upgrade = snapshot_invoices(customer_id)
    paid_before_upgrade = paid_nonzero_invoices(invoices_before_upgrade)
    known_paid_ids = {p["id"] for p in paid_before_upgrade}
    cps_before, cpe_before = subscription_period_bounds(
        stripe.Subscription.retrieve(sub_id)
    )

    log("Applying immediate upgrade (normal path)…")
    apply_upgrade_to_business(organization)
    organization.refresh_from_db()

    # Ensure proration invoice is paid / visible.
    end_wait = time.time() + 90.0
    upgrade_invoice = None
    while time.time() < end_wait:
        paid_now = paid_nonzero_invoices(snapshot_invoices(customer_id))
        new_ones = [inv for inv in paid_now if inv["id"] not in known_paid_ids]
        if new_ones:
            upgrade_invoice = new_ones[0]
            break
        time.sleep(1.0)
    if upgrade_invoice is None:
        # Open/paid drafts with positive total
        for inv in snapshot_invoices(customer_id):
            if inv["id"] not in known_paid_ids and (inv["total"] or 0) > 0:
                upgrade_invoice = inv
                break

    stripe_after_up = stripe.Subscription.retrieve(
        sub_id, expand=["schedule", "latest_invoice", "discounts"]
    )
    snapshot = provider.retrieve_subscription(sub_id)
    reconcile_subscription_snapshot(
        organization, snapshot, now=advance_mid
    )
    organization.refresh_from_db()
    local_after_up = capture_local_state(organization)
    cps_after, cpe_after = subscription_period_bounds(stripe_after_up)

    upgrade_paid_ok = bool(
        upgrade_invoice
        and upgrade_invoice.get("status") in {"paid", "open"}
        and abs(int(upgrade_invoice.get("total") or 0) - preview.amount_due_cents) <= 1
    )
    # If open, try to confirm payment intent succeeded via PaymentIntent list.
    payments = stripe.PaymentIntent.list(customer=customer_id, limit=20).data
    succeeded_amounts = sorted(
        int(getattr(p, "amount", 0) or 0)
        for p in payments
        if getattr(p, "status", None) == "succeeded"
        and int(getattr(p, "amount", 0) or 0) > 0
    )

    report["upgrade_invoice"] = upgrade_invoice
    report["upgrade_payment_succeeded"] = bool(
        upgrade_invoice
        and (
            upgrade_invoice.get("status") == "paid"
            or preview.amount_due_cents in succeeded_amounts
        )
    )
    report["same_stripe_subscription"] = stripe_after_up.id == sub_id
    report["commercial_plan_immediately_after_upgrade"] = local_after_up[
        "billing_subscribed_plan"
    ]
    report["effective_plan_immediately_after_upgrade"] = local_after_up["org_plan"]
    report["interval_after_upgrade"] = local_after_up["billing_interval"]
    report["billing_cycle_anchor_preserved"] = int(cpe_after or 0) == int(
        cpe_before or -1
    )
    report["schedule_created"] = _schedule_id_from_sub(stripe_after_up) is not None
    report["period_after_upgrade"] = {
        "start": iso(dt_from_ts(cps_after)) if cps_after else None,
        "end": iso(dt_from_ts(cpe_after)) if cpe_after else None,
    }

    upgrade_ok = (
        report["upgrade_payment_succeeded"]
        and report["same_stripe_subscription"]
        and local_after_up["billing_subscribed_plan"] == PLAN_BUSINESS
        and local_after_up["org_plan"] == PLAN_BUSINESS
        and local_after_up["billing_interval"] == INTERVAL_MONTHLY
        and report["billing_cycle_anchor_preserved"]
        and not report["schedule_created"]
        and not scheduled_change_pending(get_workspace_billing(organization))
        and not local_after_up["cancel_at_period_end"]
    )
    report["upgrade_ok"] = upgrade_ok
    if not upgrade_ok:
        log("FAIL: immediate upgrade assertions not met.")
        report["scenario5_pass"] = False
        report["safe_to_continue"] = False
        return report

    known_after_upgrade = {
        p["id"] for p in paid_nonzero_invoices(snapshot_invoices(customer_id))
    }
    # Also remember all invoice ids (including $0) so we only look for brand-new ones.
    all_known_ids = {inv["id"] for inv in snapshot_invoices(customer_id)}

    advance_renewal = dt_from_ts(period_end_ts) + timedelta(hours=1)
    report["clock_advanced_to_renewal"] = iso(advance_renewal)
    log(f"Advancing Test Clock past monthly renewal to {report['clock_advanced_to_renewal']}…")
    stripe.test_helpers.TestClock.advance(clock_id, frozen_time=ts(advance_renewal))
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
        if candidates:
            # Prefer paid; otherwise keep polling until paid/open.
            paidish = [inv for inv in candidates if inv["status"] in {"paid", "open"}]
            renewal = paidish[0] if paidish else None
            if renewal is not None:
                break
        time.sleep(1.5)
    if renewal is None:
        # Last-chance dump for debugging
        leftover = snapshot_invoices(customer_id)
        raise TimeoutError(
            "Business Monthly renewal invoice did not appear. "
            f"invoices={[ (i['id'], i['status'], i['total']) for i in leftover ]}"
        )

    stripe_final = stripe.Subscription.retrieve(sub_id, expand=["schedule", "discounts"])
    snapshot = provider.retrieve_subscription(sub_id)
    reconcile_subscription_snapshot(organization, snapshot, now=advance_renewal)
    organization.refresh_from_db()
    local_final = capture_local_state(organization)
    cps_f, cpe_f = subscription_period_bounds(stripe_final)

    paid_final = paid_nonzero_invoices(snapshot_invoices(customer_id))
    new_at_renewal = [inv for inv in paid_final if inv["id"] not in known_after_upgrade]
    discount_on_renewal = bool(
        renewal.get("discount_amounts")
        and any((d.get("amount") or 0) > 0 for d in renewal["discount_amounts"])
    )
    subs = stripe.Subscription.list(customer=customer_id, limit=10).data
    payments = stripe.PaymentIntent.list(customer=customer_id, limit=20).data
    succeeded = [
        p
        for p in payments
        if getattr(p, "status", None) == "succeeded"
        and int(getattr(p, "amount", 0) or 0) > 0
    ]
    amounts = sorted(int(getattr(p, "amount", 0) or 0) for p in succeeded)

    report["next_renewal_invoice_id"] = renewal["id"]
    report["next_renewal_invoice_amount"] = renewal["total"]
    report["renewal_plan_interval"] = {
        "commercial_plan": local_final["billing_subscribed_plan"],
        "interval": local_final["billing_interval"],
        "effective_plan": local_final["org_plan"],
    }
    report["acquisition_coupon_on_renewal"] = discount_on_renewal
    report["duplicate_subscription"] = len(subs) != 1
    report["duplicate_invoice"] = len(new_at_renewal) != 1
    report["duplicate_payment"] = amounts.count(BUSINESS_MONTHLY_CENTS) != 1
    report["local_stripe_reconciled"] = (
        local_final["current_period_start"]
        == (iso(dt_from_ts(cps_f)) if cps_f else None)
        and local_final["current_period_end"]
        == (iso(dt_from_ts(cpe_f)) if cpe_f else None)
        and local_final["billing_status"] == "active"
        and stripe_final.status == "active"
        and local_final["billing_subscribed_plan"] == PLAN_BUSINESS
        and local_final["billing_interval"] == INTERVAL_MONTHLY
    )
    report["new_period_after_renewal"] = {
        "start": iso(dt_from_ts(cps_f)) if cps_f else None,
        "end": iso(dt_from_ts(cpe_f)) if cpe_f else None,
    }
    report["succeeded_payment_amounts"] = amounts

    renewal_ok = (
        renewal["total"] == BUSINESS_MONTHLY_CENTS
        and not discount_on_renewal
        and local_final["billing_subscribed_plan"] == PLAN_BUSINESS
        and local_final["billing_interval"] == INTERVAL_MONTHLY
        and local_final["org_plan"] == PLAN_BUSINESS
        and not report["duplicate_subscription"]
        and not report["duplicate_invoice"]
        and not report["duplicate_payment"]
        and report["local_stripe_reconciled"]
        and int(cps_f or 0) == int(period_end_ts)
    )
    report["scenario5_pass"] = bool(upgrade_ok and renewal_ok)
    report["safe_to_continue"] = report["scenario5_pass"]

    log(
        f"After renewal: amount={renewal['total']} plan={local_final['billing_subscribed_plan']} "
        f"PASS={report['scenario5_pass']}"
    )
    return report


def report_as_text(report: dict[str, Any]) -> str:
    return json.dumps(report, indent=2, default=str)
