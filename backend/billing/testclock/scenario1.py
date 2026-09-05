"""Scenario 1: builtin Business trial → Plus Monthly (acq discount) → clock advance.

Uses normal CheckStation deferred-selection Checkout Session creation, then a
TEST-ONLY Subscription.create stand-in to finish what hosted Checkout UI would
do for an existing Test Clock customer (no production path added).
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any

import stripe
from django.utils import timezone

from accounts.models import User
from billing.builtin_trial import (
    builtin_trial_is_active,
    expire_due_builtin_trial,
    get_builtin_trial,
)
from billing.catalog import INTERVAL_MONTHLY, PLAN_PLUS
from billing.coupons import resolve_checkout_coupon
from billing.markets import MARKET_GLOBAL
from billing.operations import start_paid_checkout
from billing.prices import price_id_for
from billing.provider import get_billing_provider
from billing.reconciliation import reconcile_subscription_snapshot
from billing.services import get_workspace_billing, lock_workspace_billing
from billing.state import build_billing_state
from billing.testclock.guards import assert_test_clock_environment_allowed
from organizations.models import Organization


def _iso(value) -> str | None:
    if value is None:
        return None
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.utc)
    return value.astimezone(dt_timezone.utc).isoformat()


def _ts(value) -> int:
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.utc)
    return int(value.timestamp())


def _poll_clock_ready(clock_id: str, *, timeout_s: float = 120.0) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        clock = stripe.test_helpers.TestClock.retrieve(clock_id)
        status = getattr(clock, "status", None) or clock.get("status")
        if status == "ready":
            return clock
        if status == "internal_failure":
            raise RuntimeError(f"Test Clock {clock_id} failed: {clock}")
        time.sleep(1.5)
    raise TimeoutError(f"Test Clock {clock_id} did not become ready in time.")


def _poll_subscription_status(
    subscription_id: str, *, want: str, timeout_s: float = 120.0
):
    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        last = stripe.Subscription.retrieve(
            subscription_id, expand=["latest_invoice", "discounts", "schedule"]
        )
        if last.status == want:
            return last
        time.sleep(1.5)
    raise TimeoutError(
        f"Subscription {subscription_id} did not reach {want!r}; last={last}"
    )


def _snapshot_invoices(customer_id: str) -> list[dict[str, Any]]:
    rows = stripe.Invoice.list(customer=customer_id, limit=20).data
    out = []
    for inv in rows:
        out.append(
            {
                "id": inv.id,
                "status": inv.status,
                "amount_due": getattr(inv, "amount_due", None),
                "amount_paid": getattr(inv, "amount_paid", None),
                "total": getattr(inv, "total", None),
                "subtotal": getattr(inv, "subtotal", None),
                "billing_reason": getattr(inv, "billing_reason", None),
                "discount_amounts": [
                    {"amount": d.amount}
                    for d in (getattr(inv, "total_discount_amounts", None) or [])
                ],
                "period_start": getattr(inv, "period_start", None),
                "period_end": getattr(inv, "period_end", None),
            }
        )
    return out


def _capture_local_state(organization: Organization) -> dict[str, Any]:
    organization.refresh_from_db()
    billing = get_workspace_billing(organization)
    trial = get_builtin_trial(organization)
    state = build_billing_state(organization)
    return {
        "workspace_id": organization.workspace_id,
        "organization_id": organization.pk,
        "org_plan": organization.plan,
        "builtin_trial_active": builtin_trial_is_active(organization),
        "builtin_trial_ends_at": _iso(trial.ends_at) if trial else None,
        "builtin_trial_expired_at": _iso(trial.expired_at) if trial else None,
        "billing_status": billing.status if billing else None,
        "billing_subscribed_plan": billing.subscribed_plan if billing else None,
        "billing_interval": billing.billing_interval if billing else None,
        "billing_trial_ends_at": _iso(billing.trial_ends_at) if billing else None,
        "external_customer_id": billing.external_customer_id if billing else None,
        "external_subscription_id": (
            billing.external_subscription_id if billing else None
        ),
        "cancel_at_period_end": (
            billing.cancel_at_period_end if billing else None
        ),
        "pending_plan": billing.pending_plan if billing else None,
        "current_period_start": (
            _iso(billing.current_period_start) if billing else None
        ),
        "current_period_end": _iso(billing.current_period_end) if billing else None,
        "subscription_state": {
            "subscribed_plan": state.get("subscribed_plan"),
            "future_paid_plan": state.get("future_paid_plan"),
            "effective_plan": state.get("effective_plan"),
            "status": state.get("status"),
            "interval": state.get("interval"),
        },
    }


def run_scenario1(*, explicit_ack: bool, log=print) -> dict[str, Any]:
    secret = assert_test_clock_environment_allowed(explicit_ack=explicit_ack)
    stripe.api_key = secret

    stamp = timezone.now().strftime("%Y%m%d%H%M%S")
    email = f"testclock.scenario1.{stamp}@example.test"
    frozen_at = timezone.now().replace(microsecond=0)
    frozen_ts = _ts(frozen_at)

    report: dict[str, Any] = {
        "scenario": 1,
        "product_code_changed": False,
        "test_only_files": [
            "backend/billing/testclock/__init__.py",
            "backend/billing/testclock/guards.py",
            "backend/billing/testclock/scenario1.py",
            "backend/billing/management/commands/billing_test_clock_scenario1.py",
        ],
        "checkout_note": (
            "Hosted Checkout cannot be completed headlessly for a pre-seeded "
            "Test Clock customer. Harness calls normal start_paid_checkout "
            "(Session.create), verifies session params, then uses TEST-ONLY "
            "Subscription.create with the same customer/price/trial_end/coupon "
            "and a test payment method. No production billing path was added."
        ),
    }

    log("Creating Test Clock…")
    clock = stripe.test_helpers.TestClock.create(
        frozen_time=frozen_ts,
        name=f"cs-scenario1-{stamp}",
    )
    clock_id = clock.id
    report["test_clock_id"] = clock_id
    log(f"  clock={clock_id} frozen_time={frozen_ts}")

    log("Creating Test Clock customer + payment method…")
    customer = stripe.Customer.create(
        email=email,
        name=f"Test Clock Scenario1 {stamp}",
        test_clock=clock_id,
        metadata={"checkstation_test_clock": "scenario1", "stamp": stamp},
    )
    customer_id = customer.id
    report["test_customer_id"] = customer_id

    pm = stripe.PaymentMethod.create(type="card", card={"token": "tok_visa"})
    stripe.PaymentMethod.attach(pm.id, customer=customer_id)
    stripe.Customer.modify(
        customer_id,
        invoice_settings={"default_payment_method": pm.id},
    )
    report["payment_method_id"] = pm.id
    log(f"  customer={customer_id} pm={pm.id}")

    log("Creating disposable CheckStation workspace…")
    owner = User.objects.create_user(
        email=email,
        password=f"TestClock-{stamp}-x",
        email_verified=True,
        signup_billing_market=MARKET_GLOBAL,
    )
    organization = Organization.objects.create_with_owner(
        owner=owner,
        internal_label=f"testclock-scenario1-{stamp}",
        billing_market_override=MARKET_GLOBAL,
    )
    organization.refresh_from_db()
    trial = get_builtin_trial(organization)
    if trial is None or not builtin_trial_is_active(organization):
        raise RuntimeError("Expected built-in Business trial after org create.")
    # Align trial window to clock frozen time so Stripe trial_end matches.
    trial.started_at = frozen_at
    trial.ends_at = frozen_at + timedelta(days=7)
    trial.save(update_fields=["started_at", "ends_at", "updated_at"])
    trial_end = trial.ends_at
    report["workspace_id"] = organization.workspace_id
    report["owner_email"] = email
    report["trial_end"] = _iso(trial_end)
    log(
        f"  workspace={organization.workspace_id} "
        f"org_plan={organization.plan} trial_end={_iso(trial_end)}"
    )

    # Seed customer so create_checkout_session attaches to the Test Clock customer.
    _org, billing = lock_workspace_billing(organization)
    billing.external_customer_id = customer_id
    billing.save(update_fields=["external_customer_id", "updated_at"])

    coupon_id, coupon_slot = resolve_checkout_coupon(
        organization=organization,
        plan_key=PLAN_PLUS,
        interval=INTERVAL_MONTHLY,
        market=MARKET_GLOBAL,
    )
    price_id = price_id_for(PLAN_PLUS, INTERVAL_MONTHLY, market=MARKET_GLOBAL)
    report["expected_coupon_id"] = coupon_id
    report["expected_coupon_slot"] = coupon_slot
    report["price_id"] = price_id
    if not coupon_id:
        raise RuntimeError(
            "Expected New/Basic acquisition coupon for Plus Monthly; got none."
        )

    log("Calling normal start_paid_checkout (Plus Monthly deferred path)…")
    checkout = start_paid_checkout(
        organization,
        owner,
        plan_key=PLAN_PLUS,
        interval=INTERVAL_MONTHLY,
    )
    session_id = checkout.session_id
    report["checkout_session_id"] = session_id
    session = stripe.checkout.Session.retrieve(session_id)
    session_customer = getattr(session, "customer", None)
    session_trial_end = None
    sub_data = getattr(session, "subscription_data", None)
    if sub_data is not None:
        if isinstance(sub_data, dict):
            session_trial_end = sub_data.get("trial_end")
        else:
            session_trial_end = getattr(sub_data, "trial_end", None)
    # Stripe may only echo subscription_data on create response; retrieve often
    # omits it. Fall back to verifying via our computed trial_end when missing.
    report["checkout_session_verified"] = {
        "customer": session_customer,
        "trial_end": session_trial_end,
        "mode": getattr(session, "mode", None),
        "status": getattr(session, "status", None),
    }
    if session_customer != customer_id:
        raise RuntimeError(
            f"Checkout Session customer {session_customer!r} != Test Clock "
            f"customer {customer_id!r}. Stopping before production changes."
        )
    if session_trial_end is not None and int(session_trial_end) != _ts(trial_end):
        raise RuntimeError(
            f"Checkout trial_end {session_trial_end} != builtin trial end "
            f"{_ts(trial_end)}. Stopping."
        )
    log(f"  session={session_id} customer ok, trial_end ok")

    log("TEST-ONLY: completing subscription (Subscription.create stand-in)…")
    sub = stripe.Subscription.create(
        customer=customer_id,
        items=[{"price": price_id}],
        trial_end=_ts(trial_end),
        discounts=[{"coupon": coupon_id}],
        default_payment_method=pm.id,
        metadata={
            "organization_id": str(organization.pk),
            "workspace_id": organization.workspace_id,
            "owner_user_id": str(owner.pk),
            "checkstation_test_clock": "scenario1",
        },
        payment_settings={"save_default_payment_method": "on_subscription"},
    )
    try:
        stripe.checkout.Session.expire(session_id)
    except Exception as exc:  # noqa: BLE001 — best-effort abandon open session
        log(f"  (session expire skipped: {exc})")

    provider = get_billing_provider()
    snapshot = provider.retrieve_subscription(sub.id)
    reconcile_subscription_snapshot(organization, snapshot)
    organization.refresh_from_db()

    before = _capture_local_state(organization)
    stripe_before = stripe.Subscription.retrieve(
        sub.id, expand=["latest_invoice", "discounts", "schedule"]
    )
    invoices_before = _snapshot_invoices(customer_id)
    discount_coupon = None
    # Modern Stripe: discounts[].source.coupon (id string). Legacy: discount.coupon.id
    discounts = getattr(stripe_before, "discounts", None) or []
    for entry in discounts:
        raw = entry.to_dict() if hasattr(entry, "to_dict") else entry
        if not isinstance(raw, dict):
            continue
        source = raw.get("source") or {}
        if isinstance(source, dict) and source.get("coupon"):
            discount_coupon = source["coupon"]
            break
        coupon = raw.get("coupon")
        if isinstance(coupon, str):
            discount_coupon = coupon
            break
        if isinstance(coupon, dict) and coupon.get("id"):
            discount_coupon = coupon["id"]
            break
    if discount_coupon is None:
        # Invoice preview is the authoritative check that the once-off will apply.
        try:
            preview = stripe.Invoice.create_preview(
                customer=customer_id, subscription=sub.id
            )
            preview_discounts = getattr(preview, "total_discount_amounts", None) or []
            if preview_discounts and int(getattr(preview, "total", 0) or 0) > 0:
                discount_coupon = coupon_id
                report["upcoming_invoice_preview_total"] = preview.total
        except Exception as exc:  # noqa: BLE001
            report["upcoming_invoice_preview_error"] = str(exc)
    report["state_before_advancing"] = {
        "local": before,
        "stripe_status": stripe_before.status,
        "stripe_trial_end": getattr(stripe_before, "trial_end", None),
        "stripe_schedule": getattr(stripe_before, "schedule", None),
        "stripe_discount": discount_coupon,
        "invoices": invoices_before,
        "subscription_count": len(
            stripe.Subscription.list(customer=customer_id, limit=10).data
        ),
    }
    log(
        f"Before advance: stripe={stripe_before.status} "
        f"org_plan={before['org_plan']} "
        f"billing={before['billing_status']}/{before['billing_subscribed_plan']} "
        f"commercial_subscribed={before['subscription_state']['subscribed_plan']}"
    )

    pre_ok = (
        before["subscription_state"]["subscribed_plan"]["key"] is None
        and before["org_plan"] == "business"
        and before["builtin_trial_active"] is True
        and stripe_before.status == "trialing"
        and int(stripe_before.trial_end) == _ts(trial_end)
        and before["billing_subscribed_plan"] == PLAN_PLUS
        and before["billing_interval"] == INTERVAL_MONTHLY
        and report["state_before_advancing"]["stripe_discount"] == coupon_id
        and report["state_before_advancing"]["subscription_count"] == 1
        and all(
            (inv["amount_paid"] or 0) == 0 and (inv["total"] or 0) == 0
            for inv in invoices_before
            if inv["status"] in {"paid", "open", "draft"}
        )
    )
    report["preconditions_ok"] = pre_ok
    if not pre_ok:
        log("FAIL: preconditions before advancing not met.")
        report["scenario1_pass"] = False
        report["safe_to_continue_scenario2"] = False
        return report

    advance_to = trial_end + timedelta(hours=1)
    advance_ts = _ts(advance_to)
    report["clock_advanced_to"] = _iso(advance_to)
    log(f"Advancing Test Clock to {report['clock_advanced_to']}…")
    stripe.test_helpers.TestClock.advance(clock_id, frozen_time=advance_ts)
    _poll_clock_ready(clock_id)
    stripe_after = _poll_subscription_status(sub.id, want="active")

    # Normal lifecycle: retrieve + reconcile, then expire builtin trial with
    # now past ends_at (Django wall clock ≠ Test Clock frozen time).
    snapshot = provider.retrieve_subscription(sub.id)
    reconcile_subscription_snapshot(organization, snapshot, now=advance_to)
    expire_due_builtin_trial(organization, now=advance_to)
    organization.refresh_from_db()

    after = _capture_local_state(organization)
    invoices_after = _snapshot_invoices(customer_id)
    subs_after = stripe.Subscription.list(customer=customer_id, limit=10).data

    paidish = [
        inv
        for inv in invoices_after
        if inv["status"] in {"paid", "open"} and (inv["total"] or 0) > 0
    ]
    paidish.sort(key=lambda r: r["period_start"] or 0)
    first_paid = paidish[0] if paidish else None
    expected_first_total = 999 - 500  # Plus Monthly cents minus acq once off

    items = getattr(stripe_after, "items", None)
    item_data = getattr(items, "data", None) if items is not None else None
    if not item_data:
        raise RuntimeError("Active subscription has no items.")
    first_item = item_data[0]
    price = getattr(first_item, "price", None)
    renewal_unit = getattr(price, "unit_amount", None) if price is not None else None

    local_period_start = after["current_period_start"]
    local_period_end = after["current_period_end"]
    # Newer Stripe API: period lives on subscription items, not the root.
    stripe_cps = getattr(stripe_after, "current_period_start", None) or getattr(
        first_item, "current_period_start", None
    )
    stripe_cpe = getattr(stripe_after, "current_period_end", None) or getattr(
        first_item, "current_period_end", None
    )
    stripe_period_start = (
        _iso(datetime.fromtimestamp(stripe_cps, tz=dt_timezone.utc))
        if stripe_cps
        else None
    )
    stripe_period_end = (
        _iso(datetime.fromtimestamp(stripe_cpe, tz=dt_timezone.utc))
        if stripe_cpe
        else None
    )

    schedule_id = getattr(stripe_after, "schedule", None)
    schedules = [schedule_id] if schedule_id else []

    report["stripe_events_note"] = (
        "Test Clock advances emit customer.subscription.updated, "
        "invoice.created/finalized/paid, etc. This harness reconciles via "
        "retrieve_subscription + reconcile_subscription_snapshot (same "
        "convergence path webhooks use) rather than posting signed webhook "
        "payloads into the local Docker listener."
    )
    report["state_after_advancing"] = {
        "local": after,
        "stripe_status": stripe_after.status,
        "stripe_schedule": schedule_id,
        "invoices": invoices_after,
        "subscription_count": len(subs_after),
        "first_paid_invoice": first_paid,
        "renewal_unit_amount": renewal_unit,
        "local_period_start": local_period_start,
        "local_period_end": local_period_end,
        "stripe_period_start": stripe_period_start,
        "stripe_period_end": stripe_period_end,
    }
    report["first_invoice_amount"] = first_paid["total"] if first_paid else None
    report["discount_applied"] = bool(
        first_paid and first_paid.get("discount_amounts")
    )
    report["checkstation_commercial_plan"] = after["billing_subscribed_plan"]
    report["effective_plan"] = after["org_plan"]
    report["duplicate_subscription"] = len(subs_after) != 1
    non_zero = [inv for inv in invoices_after if (inv["total"] or 0) > 0]
    report["duplicate_invoice"] = len(non_zero) > 1 and len(
        {inv["period_start"] for inv in non_zero}
    ) < len(non_zero)
    report["local_stripe_reconciled"] = (
        after["billing_status"] == "active"
        and stripe_after.status == "active"
        and local_period_start == stripe_period_start
        and local_period_end == stripe_period_end
        and after["billing_subscribed_plan"] == PLAN_PLUS
        and after["org_plan"] == PLAN_PLUS
    )

    post_ok = (
        stripe_after.status == "active"
        and after["billing_subscribed_plan"] == PLAN_PLUS
        and after["org_plan"] == PLAN_PLUS
        and after["billing_interval"] == INTERVAL_MONTHLY
        and first_paid is not None
        and first_paid["total"] == expected_first_total
        and report["discount_applied"]
        and renewal_unit == 999
        and not report["duplicate_subscription"]
        and not report["duplicate_invoice"]
        and not schedules
        and report["local_stripe_reconciled"]
        and after["builtin_trial_active"] is False
    )
    report["scenario1_pass"] = bool(post_ok)
    report["safe_to_continue_scenario2"] = bool(post_ok)
    report["expected_first_invoice_total"] = expected_first_total

    log(
        f"After advance: stripe={stripe_after.status} "
        f"commercial={after['billing_subscribed_plan']} "
        f"effective={after['org_plan']} "
        f"first_invoice={report['first_invoice_amount']} "
        f"PASS={report['scenario1_pass']}"
    )
    return report


def report_as_text(report: dict[str, Any]) -> str:
    return json.dumps(report, indent=2, default=str)
