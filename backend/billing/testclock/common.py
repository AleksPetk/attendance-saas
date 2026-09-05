"""Shared Stripe Test Clock helpers — TEST/DEV ONLY."""

from __future__ import annotations

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
from billing.catalog import INTERVAL_MONTHLY, INTERVAL_YEARLY, PLAN_PLUS
from billing.coupons import resolve_checkout_coupon
from billing.markets import MARKET_GLOBAL
from billing.operations import start_paid_checkout
from billing.prices import price_id_for
from billing.provider import get_billing_provider
from billing.reconciliation import reconcile_subscription_snapshot
from billing.services import get_workspace_billing, lock_workspace_billing
from billing.state import build_billing_state
from organizations.models import Organization

PLUS_MONTHLY_CENTS = 999
ACQ_ONCE_OFF_CENTS = 500
FIRST_PAID_DISCOUNTED_CENTS = PLUS_MONTHLY_CENTS - ACQ_ONCE_OFF_CENTS  # 499
PLUS_YEARLY_CENTS = 9999
ACQ_YEARLY_ONCE_OFF_CENTS = 3000
PLUS_YEARLY_FIRST_DISCOUNTED_CENTS = (
    PLUS_YEARLY_CENTS - ACQ_YEARLY_ONCE_OFF_CENTS
)  # 6999


def iso(value) -> str | None:
    if value is None:
        return None
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.utc)
    return value.astimezone(dt_timezone.utc).isoformat()


def ts(value) -> int:
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.utc)
    return int(value.timestamp())


def poll_clock_ready(clock_id: str, *, timeout_s: float = 120.0) -> dict:
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


def advance_test_clock_to(
    clock_id: str,
    target,
    *,
    log=print,
    step_days: int = 55,
    timeout_s: float = 300.0,
) -> None:
    """Advance a Test Clock to ``target``, stepping if Stripe caps the jump.

    Stripe only allows advancing up to two billing intervals at a time (based on
    the shortest subscription interval on the clock). Yearly clocks often still
    cap near ~2 months in practice — step until we reach the target.
    """
    target_ts = ts(target) if not isinstance(target, int) else int(target)
    while True:
        clock = poll_clock_ready(clock_id, timeout_s=timeout_s)
        frozen = int(getattr(clock, "frozen_time", None) or clock["frozen_time"])
        if frozen >= target_ts:
            return
        next_ts = min(target_ts, frozen + step_days * 24 * 3600)
        log(f"  Test Clock step advance → {iso(dt_from_ts(next_ts))}")
        try:
            stripe.test_helpers.TestClock.advance(clock_id, frozen_time=next_ts)
        except stripe.error.InvalidRequestError as exc:
            # Shrink step if Stripe still rejects (interval-cap).
            msg = str(exc)
            if "two intervals" in msg.lower() or "advance" in msg.lower():
                if step_days <= 7:
                    raise
                step_days = max(7, step_days // 2)
                log(f"  (shrink advance step to {step_days} days: {exc})")
                continue
            raise
        poll_clock_ready(clock_id, timeout_s=timeout_s)

def poll_subscription_status(
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


def snapshot_invoices(customer_id: str) -> list[dict[str, Any]]:
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


def capture_local_state(organization: Organization) -> dict[str, Any]:
    organization.refresh_from_db()
    billing = get_workspace_billing(organization)
    trial = get_builtin_trial(organization)
    state = build_billing_state(organization)
    return {
        "workspace_id": organization.workspace_id,
        "organization_id": organization.pk,
        "org_plan": organization.plan,
        "builtin_trial_active": builtin_trial_is_active(organization),
        "builtin_trial_ends_at": iso(trial.ends_at) if trial else None,
        "builtin_trial_expired_at": iso(trial.expired_at) if trial else None,
        "billing_status": billing.status if billing else None,
        "billing_subscribed_plan": billing.subscribed_plan if billing else None,
        "billing_interval": billing.billing_interval if billing else None,
        "billing_trial_ends_at": iso(billing.trial_ends_at) if billing else None,
        "external_customer_id": billing.external_customer_id if billing else None,
        "external_subscription_id": (
            billing.external_subscription_id if billing else None
        ),
        "cancel_at_period_end": (
            billing.cancel_at_period_end if billing else None
        ),
        "pending_plan": billing.pending_plan if billing else None,
        "pending_interval": billing.pending_interval if billing else None,
        "pending_change_effective_at": iso(billing.pending_change_effective_at)
        if billing
        else None,
        "current_period_start": (
            iso(billing.current_period_start) if billing else None
        ),
        "current_period_end": iso(billing.current_period_end) if billing else None,
        "subscription_state": {
            "subscribed_plan": state.get("subscribed_plan"),
            "future_paid_plan": state.get("future_paid_plan"),
            "effective_plan": state.get("effective_plan"),
            "status": state.get("status"),
            "interval": state.get("interval"),
            "cancel_at_period_end": state.get("cancel_at_period_end"),
            "pending_plan": state.get("pending_plan"),
            "pending_interval": state.get("pending_interval"),
        },
    }


def subscription_period_bounds(sub) -> tuple[int | None, int | None]:
    """Newer Stripe API stores period on items, not the subscription root."""
    cps = getattr(sub, "current_period_start", None)
    cpe = getattr(sub, "current_period_end", None)
    items = getattr(sub, "items", None)
    item_data = getattr(items, "data", None) if items is not None else None
    if item_data:
        cps = cps or getattr(item_data[0], "current_period_start", None)
        cpe = cpe or getattr(item_data[0], "current_period_end", None)
    return cps, cpe


def discount_coupon_id(sub) -> str | None:
    discounts = getattr(sub, "discounts", None) or []
    for entry in discounts:
        raw = entry.to_dict() if hasattr(entry, "to_dict") else entry
        if not isinstance(raw, dict):
            continue
        source = raw.get("source") or {}
        if isinstance(source, dict) and source.get("coupon"):
            return source["coupon"]
        coupon = raw.get("coupon")
        if isinstance(coupon, str):
            return coupon
        if isinstance(coupon, dict) and coupon.get("id"):
            return coupon["id"]
    return None


def paid_nonzero_invoices(invoices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = [
        inv
        for inv in invoices
        if inv["status"] in {"paid", "open"} and (inv["total"] or 0) > 0
    ]
    rows.sort(key=lambda r: r["period_start"] or 0)
    return rows


def bring_to_active_plus_after_trial(
    *,
    scenario_tag: str,
    stamp: str,
    log=print,
    interval: str = INTERVAL_MONTHLY,
    expected_first_paid_cents: int | None = None,
) -> dict[str, Any]:
    """Fresh clock → builtin trial → Plus (monthly|yearly) → past trial → active.

    Same architecture as Scenario 1 (Checkout Session verify + TEST-ONLY
    Subscription.create stand-in + reconcile + expire builtin trial).
    """
    if interval not in (INTERVAL_MONTHLY, INTERVAL_YEARLY):
        raise ValueError(f"Unsupported Plus interval: {interval}")
    if expected_first_paid_cents is None:
        expected_first_paid_cents = (
            FIRST_PAID_DISCOUNTED_CENTS
            if interval == INTERVAL_MONTHLY
            else PLUS_YEARLY_FIRST_DISCOUNTED_CENTS
        )

    email = f"testclock.{scenario_tag}.{stamp}@example.test"
    frozen_at = timezone.now().replace(microsecond=0)
    frozen_ts = ts(frozen_at)

    log("Creating Test Clock…")
    clock = stripe.test_helpers.TestClock.create(
        frozen_time=frozen_ts,
        name=f"cs-{scenario_tag}-{stamp}",
    )
    clock_id = clock.id
    log(f"  clock={clock_id} frozen_time={frozen_ts}")

    log("Creating Test Clock customer + payment method…")
    customer = stripe.Customer.create(
        email=email,
        name=f"Test Clock {scenario_tag} {stamp}",
        test_clock=clock_id,
        metadata={"checkstation_test_clock": scenario_tag, "stamp": stamp},
    )
    customer_id = customer.id
    pm = stripe.PaymentMethod.create(type="card", card={"token": "tok_visa"})
    stripe.PaymentMethod.attach(pm.id, customer=customer_id)
    stripe.Customer.modify(
        customer_id,
        invoice_settings={"default_payment_method": pm.id},
    )
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
        internal_label=f"testclock-{scenario_tag}-{stamp}",
        billing_market_override=MARKET_GLOBAL,
    )
    organization.refresh_from_db()
    trial = get_builtin_trial(organization)
    if trial is None or not builtin_trial_is_active(organization):
        raise RuntimeError("Expected built-in Business trial after org create.")
    trial.started_at = frozen_at
    trial.ends_at = frozen_at + timedelta(days=7)
    trial.save(update_fields=["started_at", "ends_at", "updated_at"])
    trial_end = trial.ends_at
    log(
        f"  workspace={organization.workspace_id} "
        f"org_plan={organization.plan} trial_end={iso(trial_end)}"
    )

    _org, billing = lock_workspace_billing(organization)
    billing.external_customer_id = customer_id
    billing.save(update_fields=["external_customer_id", "updated_at"])

    coupon_id, coupon_slot = resolve_checkout_coupon(
        organization=organization,
        plan_key=PLAN_PLUS,
        interval=interval,
        market=MARKET_GLOBAL,
    )
    price_id = price_id_for(PLAN_PLUS, interval, market=MARKET_GLOBAL)
    if not coupon_id:
        raise RuntimeError(
            f"Expected New/Basic acquisition coupon for Plus {interval}; got none."
        )

    log(f"Calling normal start_paid_checkout (Plus {interval} deferred path)…")
    checkout = start_paid_checkout(
        organization,
        owner,
        plan_key=PLAN_PLUS,
        interval=interval,
    )
    session_id = checkout.session_id
    session = stripe.checkout.Session.retrieve(session_id)
    session_customer = getattr(session, "customer", None)
    if session_customer != customer_id:
        raise RuntimeError(
            f"Checkout Session customer {session_customer!r} != Test Clock "
            f"customer {customer_id!r}."
        )
    log(f"  session={session_id} customer ok")

    log("TEST-ONLY: completing subscription (Subscription.create stand-in)…")
    sub = stripe.Subscription.create(
        customer=customer_id,
        items=[{"price": price_id}],
        trial_end=ts(trial_end),
        discounts=[{"coupon": coupon_id}],
        default_payment_method=pm.id,
        metadata={
            "organization_id": str(organization.pk),
            "workspace_id": organization.workspace_id,
            "owner_user_id": str(owner.pk),
            "checkstation_test_clock": scenario_tag,
        },
        payment_settings={"save_default_payment_method": "on_subscription"},
    )
    try:
        stripe.checkout.Session.expire(session_id)
    except Exception as exc:  # noqa: BLE001
        log(f"  (session expire skipped: {exc})")

    provider = get_billing_provider()
    snapshot = provider.retrieve_subscription(sub.id)
    reconcile_subscription_snapshot(organization, snapshot)

    # Advance past builtin trial → first discounted paid invoice.
    advance_past_trial = trial_end + timedelta(hours=1)
    log(f"Advancing Test Clock past trial to {iso(advance_past_trial)}…")
    stripe.test_helpers.TestClock.advance(clock_id, frozen_time=ts(advance_past_trial))
    poll_clock_ready(clock_id)
    stripe_sub = poll_subscription_status(sub.id, want="active")

    snapshot = provider.retrieve_subscription(sub.id)
    reconcile_subscription_snapshot(organization, snapshot, now=advance_past_trial)
    expire_due_builtin_trial(organization, now=advance_past_trial)
    organization.refresh_from_db()

    invoices = snapshot_invoices(customer_id)
    first_paid = paid_nonzero_invoices(invoices)
    if not first_paid or first_paid[0]["total"] != expected_first_paid_cents:
        raise RuntimeError(
            f"Expected discounted first invoice {expected_first_paid_cents}; "
            f"got {first_paid[:1]}"
        )

    cps, cpe = subscription_period_bounds(stripe_sub)
    if not cps or not cpe:
        raise RuntimeError("Missing Stripe period bounds after first paid period.")

    local = capture_local_state(organization)
    if (
        local["billing_status"] != "active"
        or local["billing_subscribed_plan"] != PLAN_PLUS
        or local["org_plan"] != PLAN_PLUS
        or local["billing_interval"] != interval
    ):
        raise RuntimeError(f"Post-trial active Plus preconditions failed: {local}")

    return {
        "stamp": stamp,
        "email": email,
        "clock_id": clock_id,
        "customer_id": customer_id,
        "payment_method_id": pm.id,
        "organization": organization,
        "owner": owner,
        "subscription_id": sub.id,
        "trial_end": trial_end,
        "coupon_id": coupon_id,
        "coupon_slot": coupon_slot,
        "price_id": price_id,
        "interval": interval,
        "checkout_session_id": session_id,
        "advanced_past_trial_to": advance_past_trial,
        "first_paid_invoice": first_paid[0],
        "period_start_ts": cps,
        "period_end_ts": cpe,
        "local_after_first_paid": local,
        "stripe_after_first_paid": stripe_sub,
        "provider": provider,
    }


def dt_from_ts(value: int):
    return datetime.fromtimestamp(int(value), tz=dt_timezone.utc)
