"""Durable Stripe Checkout attempt claim / recovery (M6).

Phase 1 commits an attempt + idempotency key before calling Stripe.
Phase 2 calls Stripe without holding select_for_update.
Phase 3 persists session id/url; retries reuse the same key.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from uuid import uuid4

from django.db import IntegrityError, transaction
from django.utils import timezone

from billing.exceptions import BillingStateError, StripeProviderError
from billing.models import (
    BillingStatus,
    CheckoutAttemptStatus,
    PurchaseSource,
    WorkspaceCheckoutAttempt,
)
from billing.provider import get_billing_provider
from billing.reconciliation import reconcile_subscription_snapshot
from billing.services import lock_workspace_billing
from billing.snapshots import CheckoutSessionResult

logger = logging.getLogger("billing.checkout_attempts")

# Match Stripe Checkout Session default lifetime until Stripe returns expires_at.
DEFAULT_CHECKOUT_TTL = timedelta(hours=24)

ACTIVE_ATTEMPT_STATUSES = (
    CheckoutAttemptStatus.PENDING,
    CheckoutAttemptStatus.OPEN,
)


def _idempotency_key_for(organization_id, attempt_id) -> str:
    return f"checkstation-checkout-{organization_id}-{attempt_id}"


def _assert_checkout_eligible(billing) -> None:
    from billing.catalog import PAID_INTERVALS, PLAN_BUSINESS, PLAN_PLUS

    deferred = bool(
        billing
        and billing.purchase_source == PurchaseSource.STRIPE
        and billing.status == BillingStatus.TRIALING
        and billing.external_subscription_id
        and billing.subscribed_plan in {PLAN_PLUS, PLAN_BUSINESS}
        and billing.billing_interval in PAID_INTERVALS
        and not billing.cancel_at_period_end
    )
    if deferred:
        raise BillingStateError("This workspace already has an active subscription.")
    if billing.status in {
        BillingStatus.TRIALING,
        BillingStatus.ACTIVE,
        BillingStatus.PAST_DUE,
    }:
        raise BillingStateError("This workspace already has an active subscription.")


def _active_attempt_for_update(organization):
    return (
        WorkspaceCheckoutAttempt.objects.select_for_update()
        .filter(organization=organization, status__in=ACTIVE_ATTEMPT_STATUSES)
        .order_by("-created_at")
        .first()
    )


def _mark_attempt(attempt, *, status, **fields):
    attempt.status = status
    update = ["status", "updated_at"]
    for key, value in fields.items():
        setattr(attempt, key, value)
        update.append(key)
    attempt.save(update_fields=list(dict.fromkeys(update)))
    return attempt


@transaction.atomic
def claim_checkout_attempt(organization, *, plan, interval):
    """Short locked claim: reuse/create durable attempt; commit before Stripe."""
    _org, billing = lock_workspace_billing(organization)
    _assert_checkout_eligible(billing)
    now = timezone.now()
    existing = _active_attempt_for_update(organization)
    if existing is not None:
        return existing

    attempt_id = uuid4()
    attempt = WorkspaceCheckoutAttempt(
        organization=organization,
        attempt_id=attempt_id,
        idempotency_key=_idempotency_key_for(organization.pk, attempt_id),
        plan_key=plan,
        interval=interval,
        status=CheckoutAttemptStatus.PENDING,
        expires_at=now + DEFAULT_CHECKOUT_TTL,
    )
    try:
        with transaction.atomic():
            attempt.save()
    except IntegrityError:
        existing = _active_attempt_for_update(organization)
        if existing is None:
            raise
        return existing
    return attempt


@transaction.atomic
def replace_active_attempt(organization, *, plan, interval, old_attempt):
    """Mark old attempt replaced and create a new durable claim (short lock)."""
    _org, billing = lock_workspace_billing(organization)
    _assert_checkout_eligible(billing)
    locked = (
        WorkspaceCheckoutAttempt.objects.select_for_update()
        .filter(pk=old_attempt.pk)
        .first()
    )
    if locked is not None and locked.status in ACTIVE_ATTEMPT_STATUSES:
        _mark_attempt(locked, status=CheckoutAttemptStatus.REPLACED)

    now = timezone.now()
    attempt_id = uuid4()
    attempt = WorkspaceCheckoutAttempt(
        organization=organization,
        attempt_id=attempt_id,
        idempotency_key=_idempotency_key_for(organization.pk, attempt_id),
        plan_key=plan,
        interval=interval,
        status=CheckoutAttemptStatus.PENDING,
        expires_at=now + DEFAULT_CHECKOUT_TTL,
    )
    try:
        with transaction.atomic():
            attempt.save()
    except IntegrityError:
        existing = _active_attempt_for_update(organization)
        if existing is None:
            raise
        return existing
    return attempt


def _session_status(provider, session_id: str) -> dict:
    raw = provider.retrieve_checkout_session(session_id)
    if not isinstance(raw, dict):
        raw = {
            "id": session_id,
            "status": getattr(raw, "status", None) or "",
            "url": getattr(raw, "url", "") or "",
            "expires_at": getattr(raw, "expires_at", None),
            "subscription": getattr(raw, "subscription", None),
        }
    status = str(raw.get("status") or "").strip().lower()
    if not status and raw.get("expired"):
        status = "expired"
    sub = raw.get("subscription")
    if isinstance(sub, dict):
        subscription_id = str(sub.get("id") or "")
    else:
        subscription_id = str(sub or "")
    expires_at = raw.get("expires_at")
    if isinstance(expires_at, (int, float)):
        from datetime import datetime, timezone as dt_timezone

        expires_at = datetime.fromtimestamp(int(expires_at), tz=dt_timezone.utc)
    return {
        "session_id": str(raw.get("id") or session_id),
        "status": status,
        "url": str(raw.get("url") or ""),
        "expires_at": expires_at,
        "subscription_id": subscription_id,
        "raw": raw,
    }


def _persist_open_session(attempt, *, session_id, url, expires_at):
    with transaction.atomic():
        locked = (
            WorkspaceCheckoutAttempt.objects.select_for_update()
            .filter(pk=attempt.pk)
            .first()
        )
        if locked is None:
            raise BillingStateError("Checkout attempt is missing.")
        if locked.status == CheckoutAttemptStatus.COMPLETED:
            return locked
        if locked.status == CheckoutAttemptStatus.REPLACED:
            raise BillingStateError("Checkout attempt was replaced.")
        locked.stripe_session_id = session_id
        locked.checkout_url = url
        locked.expires_at = expires_at or locked.expires_at
        locked.status = CheckoutAttemptStatus.OPEN
        locked.save(
            update_fields=[
                "stripe_session_id",
                "checkout_url",
                "expires_at",
                "status",
                "updated_at",
            ]
        )
        return locked


def _reconcile_completed_session(organization, provider, session_info):
    subscription_id = session_info.get("subscription_id") or ""
    if not subscription_id:
        raise BillingStateError(
            "Checkout completed but subscription is not ready yet.",
            code="checkout_processing",
        )
    snapshot = provider.retrieve_subscription(subscription_id)
    reconcile_subscription_snapshot(organization, snapshot)


def create_or_resume_checkout_session(
    organization,
    owner,
    *,
    plan,
    interval,
    market,
    success_url,
    cancel_url,
    billing_start_at=None,
    coupon_id=None,
    coupon_slot=None,
) -> CheckoutSessionResult:
    """Full durable checkout flow (claim → Stripe → persist)."""
    provider = get_billing_provider()
    attempt = claim_checkout_attempt(organization, plan=plan, interval=interval)

    # Different plan than the active attempt: inspect / replace OPEN only.
    if attempt.plan_key != plan or attempt.interval != interval:
        return _handle_plan_change(
            organization,
            owner,
            attempt=attempt,
            plan=plan,
            interval=interval,
            market=market,
            success_url=success_url,
            cancel_url=cancel_url,
            billing_start_at=billing_start_at,
            coupon_id=coupon_id,
            coupon_slot=coupon_slot,
        )

    return _resume_or_create_same_plan(
        organization,
        owner,
        attempt=attempt,
        plan=plan,
        interval=interval,
        market=market,
        success_url=success_url,
        cancel_url=cancel_url,
        billing_start_at=billing_start_at,
        coupon_id=coupon_id,
        coupon_slot=coupon_slot,
    )


def _handle_completed_attempt(organization, attempt, provider, session_info):
    with transaction.atomic():
        locked = (
            WorkspaceCheckoutAttempt.objects.select_for_update()
            .filter(pk=attempt.pk)
            .first()
        )
        if locked is not None:
            _mark_attempt(locked, status=CheckoutAttemptStatus.COMPLETED)
    try:
        _reconcile_completed_session(organization, provider, session_info)
    except BillingStateError as exc:
        if getattr(exc, "code", "") == "checkout_processing":
            return CheckoutSessionResult(
                mode="checkout_processing",
                session_id=attempt.stripe_session_id or session_info["session_id"],
            )
        raise
    return CheckoutSessionResult(
        mode="checkout_processing",
        session_id=attempt.stripe_session_id or session_info["session_id"],
    )


def _resume_or_create_same_plan(
    organization,
    owner,
    *,
    attempt,
    plan,
    interval,
    market,
    success_url,
    cancel_url,
    billing_start_at,
    coupon_id,
    coupon_slot,
):
    provider = get_billing_provider()

    # Case A / E: known session — inspect Stripe status.
    if (attempt.stripe_session_id or "").strip() and (attempt.checkout_url or "").strip():
        try:
            info = _session_status(provider, attempt.stripe_session_id)
        except Exception:
            logger.warning(
                "Could not retrieve checkout session; recovering via idempotent create "
                "attempt_id=%s",
                attempt.attempt_id,
                exc_info=True,
            )
            info = None
        if info is not None:
            status = info["status"]
            if status in {"complete", "completed"}:
                return _handle_completed_attempt(
                    organization, attempt, provider, info
                )
            if status == "expired":
                with transaction.atomic():
                    locked = (
                        WorkspaceCheckoutAttempt.objects.select_for_update()
                        .filter(pk=attempt.pk)
                        .first()
                    )
                    if locked is not None and locked.status in ACTIVE_ATTEMPT_STATUSES:
                        _mark_attempt(locked, status=CheckoutAttemptStatus.EXPIRED)
                attempt = claim_checkout_attempt(
                    organization, plan=plan, interval=interval
                )
                return _create_stripe_session_for_attempt(
                    organization,
                    owner,
                    attempt=attempt,
                    plan=plan,
                    interval=interval,
                    market=market,
                    success_url=success_url,
                    cancel_url=cancel_url,
                    billing_start_at=billing_start_at,
                    coupon_id=coupon_id,
                    coupon_slot=coupon_slot,
                )
            # open / unpaid — reuse
            if info.get("url"):
                with transaction.atomic():
                    locked = (
                        WorkspaceCheckoutAttempt.objects.select_for_update()
                        .filter(pk=attempt.pk)
                        .first()
                    )
                    if locked is not None and locked.status == CheckoutAttemptStatus.PENDING:
                        _persist_open_session(
                            locked,
                            session_id=info["session_id"],
                            url=info["url"],
                            expires_at=info.get("expires_at"),
                        )
                return CheckoutSessionResult(
                    checkout_url=info.get("url") or attempt.checkout_url,
                    session_id=info["session_id"],
                    mode="checkout",
                    expires_at=info.get("expires_at") or attempt.expires_at,
                )
            return CheckoutSessionResult(
                checkout_url=attempt.checkout_url,
                session_id=attempt.stripe_session_id,
                mode="checkout",
                expires_at=attempt.expires_at,
            )

    # Case B: pending claim without local session_id — create/recover with same key.
    return _create_stripe_session_for_attempt(
        organization,
        owner,
        attempt=attempt,
        plan=plan,
        interval=interval,
        market=market,
        success_url=success_url,
        cancel_url=cancel_url,
        billing_start_at=billing_start_at,
        coupon_id=coupon_id,
        coupon_slot=coupon_slot,
    )


def _handle_plan_change(
    organization,
    owner,
    *,
    attempt,
    plan,
    interval,
    market,
    success_url,
    cancel_url,
    billing_start_at,
    coupon_id,
    coupon_slot,
):
    provider = get_billing_provider()
    if (attempt.stripe_session_id or "").strip():
        try:
            info = _session_status(provider, attempt.stripe_session_id)
        except Exception:
            info = {"status": "open"}
        status = (info or {}).get("status") or ""
        if status in {"complete", "completed"}:
            return _handle_completed_attempt(
                organization, attempt, provider, info or {}
            )
        if status != "expired" and hasattr(provider, "expire_checkout_session"):
            try:
                provider.expire_checkout_session(attempt.stripe_session_id)
            except Exception:
                logger.warning(
                    "Best-effort expire failed session_prefix=%s",
                    attempt.stripe_session_id[:20],
                    exc_info=True,
                )
        if status == "expired":
            with transaction.atomic():
                locked = (
                    WorkspaceCheckoutAttempt.objects.select_for_update()
                    .filter(pk=attempt.pk)
                    .first()
                )
                if locked is not None and locked.status in ACTIVE_ATTEMPT_STATUSES:
                    _mark_attempt(locked, status=CheckoutAttemptStatus.EXPIRED)
        else:
            # Will be marked replaced inside replace_active_attempt.
            pass

    new_attempt = replace_active_attempt(
        organization, plan=plan, interval=interval, old_attempt=attempt
    )
    return _create_stripe_session_for_attempt(
        organization,
        owner,
        attempt=new_attempt,
        plan=plan,
        interval=interval,
        market=market,
        success_url=success_url,
        cancel_url=cancel_url,
        billing_start_at=billing_start_at,
        coupon_id=coupon_id,
        coupon_slot=coupon_slot,
    )


def _create_stripe_session_for_attempt(
    organization,
    owner,
    *,
    attempt,
    plan,
    interval,
    market,
    success_url,
    cancel_url,
    billing_start_at,
    coupon_id,
    coupon_slot,
):
    provider = get_billing_provider()
    # Reload attempt outside lock for current key.
    attempt = WorkspaceCheckoutAttempt.objects.get(pk=attempt.pk)
    try:
        result = provider.create_checkout_session(
            organization=organization,
            owner=owner,
            plan_key=plan,
            interval=interval,
            market=market,
            success_url=success_url,
            cancel_url=cancel_url,
            billing_start_at=billing_start_at,
            coupon_id=coupon_id,
            coupon_slot=coupon_slot,
            idempotency_key=attempt.idempotency_key,
        )
    except StripeProviderError:
        # Keep durable pending attempt + key for retry.
        raise

    expires_at = result.expires_at or attempt.expires_at or (
        timezone.now() + DEFAULT_CHECKOUT_TTL
    )
    saved = _persist_open_session(
        attempt,
        session_id=result.session_id,
        url=result.checkout_url,
        expires_at=expires_at,
    )
    return CheckoutSessionResult(
        checkout_url=saved.checkout_url,
        session_id=saved.stripe_session_id,
        mode="checkout",
        expires_at=saved.expires_at,
    )


def mark_attempt_completed_for_session(organization, session_id: str) -> None:
    """Best-effort terminal state when webhook reconciles a Checkout Session."""
    sid = str(session_id or "").strip()
    if not sid:
        return
    with transaction.atomic():
        attempt = (
            WorkspaceCheckoutAttempt.objects.select_for_update()
            .filter(organization=organization, stripe_session_id=sid)
            .exclude(
                status__in=[
                    CheckoutAttemptStatus.COMPLETED,
                    CheckoutAttemptStatus.EXPIRED,
                    CheckoutAttemptStatus.REPLACED,
                ]
            )
            .first()
        )
        if attempt is not None:
            _mark_attempt(attempt, status=CheckoutAttemptStatus.COMPLETED)
