"""Google Play subscription verification and entitlement reconciliation."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone as dj_timezone
from django.utils.dateparse import parse_datetime

from billing.exceptions import BillingStateError
from billing.google_api import (
    GooglePlayApiError,
    acknowledge_subscription_purchase,
    get_subscription_purchase_v2,
    google_play_package_name,
)
from billing.google_products import plan_interval_for_google_product
from billing.models import (
    BillingStatus,
    GoogleSubscriptionDetails,
    PurchaseSource,
    WorkspaceSubscription,
)
from billing.services import (
    activate_paid_subscription,
    clear_pending_cancellation,
    finalize_subscription_end,
    lock_workspace_billing,
    mark_payment_failure,
    mark_payment_recovered,
    schedule_cancellation,
)
from billing.source_lock import assert_can_activate_provider

logger = logging.getLogger("billing.google_verify")

# Google Play subscriptionsv2 subscriptionState values
STATE_ACTIVE = "SUBSCRIPTION_STATE_ACTIVE"
STATE_CANCELED = "SUBSCRIPTION_STATE_CANCELED"
STATE_IN_GRACE = "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
STATE_ON_HOLD = "SUBSCRIPTION_STATE_ON_HOLD"
STATE_PAUSED = "SUBSCRIPTION_STATE_PAUSED"
STATE_EXPIRED = "SUBSCRIPTION_STATE_EXPIRED"
STATE_PENDING = "SUBSCRIPTION_STATE_PENDING"
STATE_PENDING_CANCELED = "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED"

ACK_PENDING = "ACKNOWLEDGEMENT_STATE_PENDING"
ACK_ACKNOWLEDGED = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"


class GoogleVerificationError(BillingStateError):
    """Google purchase verification failed."""


def _reload_billing(organization) -> WorkspaceSubscription:
    org, billing = lock_workspace_billing(organization)
    _ = org
    return billing


def _parse_dt(value) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    parsed = parse_datetime(str(value))
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _currency_for_region(region_code: str) -> str:
    region = str(region_code or "").strip().upper()
    if region == "JP":
        return "jpy"
    return "usd"


def _line_item(payload: dict) -> dict:
    items = payload.get("lineItems")
    if not isinstance(items, list) or not items:
        raise GoogleVerificationError(
            "Google subscription has no line items.",
            code="google_subscription_incomplete",
        )
    item = items[0]
    if not isinstance(item, dict):
        raise GoogleVerificationError(
            "Google subscription line item is invalid.",
            code="google_subscription_incomplete",
        )
    return item


def parse_subscription_purchase_v2(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalize Android Publisher subscriptionsv2.get response."""
    if not isinstance(payload, dict):
        raise GoogleVerificationError(
            "Google subscription payload is invalid.",
            code="google_purchase_invalid",
        )
    item = _line_item(payload)
    product_id = str(item.get("productId") or "").strip()
    offer = item.get("offerDetails") if isinstance(item.get("offerDetails"), dict) else {}
    base_plan_id = str(offer.get("basePlanId") or "").strip()
    # Never map entitlement from promotional offerId — basePlanId only.
    if not product_id or not base_plan_id:
        raise GoogleVerificationError(
            "Google subscription product or base plan is missing.",
            code="google_subscription_incomplete",
        )
    plan, interval = plan_interval_for_google_product(product_id, base_plan_id)
    state = str(payload.get("subscriptionState") or "").strip().upper()
    expires_at = _parse_dt(item.get("expiryTime"))
    start_at = _parse_dt(payload.get("startTime")) or _parse_dt(item.get("startTime"))
    auto_plan = item.get("autoRenewingPlan")
    auto_renew = None
    if isinstance(auto_plan, dict) and "autoRenewEnabled" in auto_plan:
        auto_renew = bool(auto_plan.get("autoRenewEnabled"))
    linked = str(payload.get("linkedPurchaseToken") or "").strip()
    ack = str(payload.get("acknowledgementState") or "").strip().upper()
    region = str(payload.get("regionCode") or "").strip()
    latest_order = str(payload.get("latestOrderId") or "").strip()
    return {
        "product_id": product_id,
        "base_plan_id": base_plan_id,
        "plan": plan,
        "interval": interval,
        "subscription_state": state,
        "expires_at": expires_at,
        "start_at": start_at,
        "auto_renew": auto_renew,
        "linked_purchase_token": linked,
        "acknowledgement_state": ack,
        "region_code": region,
        "currency": _currency_for_region(region),
        "latest_order_id": latest_order,
        "raw": payload,
    }


def fetch_and_parse_purchase(purchase_token: str) -> dict[str, Any]:
    token = str(purchase_token or "").strip()
    if not token:
        raise GoogleVerificationError(
            "purchase_token is required.",
            code="google_purchase_token_missing",
        )
    try:
        payload = get_subscription_purchase_v2(token)
    except GooglePlayApiError as exc:
        raise GoogleVerificationError(str(exc), code=getattr(exc, "code", "google_play_api_failed")) from exc
    normalized = parse_subscription_purchase_v2(payload)
    normalized["purchase_token"] = token
    normalized["package_name"] = google_play_package_name()
    return normalized


def find_organization_for_purchase_token(purchase_token: str):
    token = str(purchase_token or "").strip()
    if not token:
        return None
    details = (
        GoogleSubscriptionDetails.objects.select_related("billing__organization")
        .filter(purchase_token=token)
        .first()
    )
    if details is not None:
        return details.billing.organization
    details = (
        GoogleSubscriptionDetails.objects.select_related("billing__organization")
        .filter(linked_purchase_token=token)
        .first()
    )
    if details is None:
        return None
    return details.billing.organization


def _assert_token_ownership(
    *,
    organization,
    purchase_token: str,
    linked_purchase_token: str = "",
) -> None:
    token = str(purchase_token or "").strip()
    linked = str(linked_purchase_token or "").strip()
    candidates = [token]
    if linked:
        candidates.append(linked)
    for candidate in candidates:
        if not candidate:
            continue
        existing = (
            GoogleSubscriptionDetails.objects.select_for_update()
            .filter(purchase_token=candidate)
            .select_related("billing", "billing__organization")
            .first()
        )
        if existing is not None and existing.billing.organization_id != organization.id:
            raise GoogleVerificationError(
                "This Google Play subscription is already linked to another workspace.",
                code="google_purchase_bound_elsewhere",
            )
        linked_hit = (
            GoogleSubscriptionDetails.objects.select_for_update()
            .filter(linked_purchase_token=candidate)
            .select_related("billing", "billing__organization")
            .first()
        )
        if linked_hit is not None and linked_hit.billing.organization_id != organization.id:
            raise GoogleVerificationError(
                "This Google Play subscription is already linked to another workspace.",
                code="google_purchase_bound_elsewhere",
            )


def _bind_google_details(
    *,
    billing: WorkspaceSubscription,
    normalized: dict[str, Any],
) -> GoogleSubscriptionDetails:
    details, _created = GoogleSubscriptionDetails.objects.select_for_update().get_or_create(
        billing=billing,
        defaults={
            "purchase_token": normalized["purchase_token"],
            "product_id": normalized["product_id"],
            "base_plan_id": normalized["base_plan_id"],
            "package_name": normalized["package_name"],
            "latest_expiration_at": normalized.get("expires_at"),
            "auto_renew": normalized.get("auto_renew"),
            "linked_purchase_token": normalized.get("linked_purchase_token") or "",
        },
    )
    _assert_token_ownership(
        organization=billing.organization,
        purchase_token=normalized["purchase_token"],
        linked_purchase_token=normalized.get("linked_purchase_token") or "",
    )
    details.purchase_token = normalized["purchase_token"]
    details.product_id = normalized["product_id"]
    details.base_plan_id = normalized["base_plan_id"]
    details.package_name = normalized["package_name"]
    details.latest_expiration_at = normalized.get("expires_at")
    if normalized.get("auto_renew") is not None:
        details.auto_renew = normalized.get("auto_renew")
    details.linked_purchase_token = normalized.get("linked_purchase_token") or ""
    details.save()
    return details


def _paid_entitlement_active(normalized: dict[str, Any], *, now: datetime) -> bool:
    state = normalized.get("subscription_state") or ""
    expires_at = normalized.get("expires_at")
    if state in {STATE_ON_HOLD, STATE_PAUSED, STATE_EXPIRED, STATE_PENDING, STATE_PENDING_CANCELED}:
        return False
    if state in {STATE_ACTIVE, STATE_CANCELED, STATE_IN_GRACE}:
        if expires_at is None:
            return state in {STATE_ACTIVE, STATE_IN_GRACE}
        return expires_at > now
    # Unknown states: require future expiry to treat as entitled.
    if expires_at is not None and expires_at > now:
        return state not in {STATE_ON_HOLD, STATE_PAUSED, STATE_EXPIRED}
    return False


@transaction.atomic
def apply_google_entitlement(
    organization,
    *,
    normalized: dict[str, Any],
    acknowledge: bool = False,
    now=None,
) -> WorkspaceSubscription:
    """Activate or sync Google-paid entitlement from Google API truth."""
    moment = now if now is not None else dj_timezone.now()
    org, billing = lock_workspace_billing(organization)
    assert_can_activate_provider(
        organization=org,
        billing=billing,
        provider=PurchaseSource.GOOGLE,
    )
    _assert_token_ownership(
        organization=org,
        purchase_token=normalized["purchase_token"],
        linked_purchase_token=normalized.get("linked_purchase_token") or "",
    )

    state = normalized.get("subscription_state") or ""
    expires_at = normalized.get("expires_at")
    entitled = _paid_entitlement_active(normalized, now=moment)

    if not entitled:
        if billing.purchase_source == PurchaseSource.GOOGLE:
            finalize_subscription_end(
                org,
                ended_at=expires_at or moment,
                now=moment,
            )
            details = getattr(billing, "google_details", None)
            if details is not None:
                details.purchase_token = normalized["purchase_token"]
                details.product_id = normalized["product_id"]
                details.base_plan_id = normalized["base_plan_id"]
                details.package_name = normalized["package_name"]
                details.latest_expiration_at = expires_at
                details.auto_renew = False
                details.linked_purchase_token = (
                    normalized.get("linked_purchase_token") or ""
                )
                details.save()
        return _reload_billing(org)

    if expires_at is None:
        raise GoogleVerificationError(
            "Google subscription is missing an expiration date.",
            code="google_subscription_incomplete",
        )

    period_start = normalized.get("start_at") or moment
    try:
        billing = activate_paid_subscription(
            org,
            subscribed_plan=normalized["plan"],
            billing_interval=normalized["interval"],
            purchase_source=PurchaseSource.GOOGLE,
            current_period_start=period_start,
            current_period_end=expires_at,
            external_subscription_id=normalized["purchase_token"],
            currency=normalized.get("currency") or "usd",
            now=moment,
        )
    except IntegrityError as exc:
        raise GoogleVerificationError(
            "This Google Play subscription is already linked to another workspace.",
            code="google_purchase_bound_elsewhere",
        ) from exc

    org, billing = lock_workspace_billing(org)
    _bind_google_details(billing=billing, normalized=normalized)

    auto_renew = normalized.get("auto_renew")
    if state == STATE_CANCELED or auto_renew is False:
        schedule_cancellation(org, effective_at=expires_at)
    elif auto_renew is True and billing.cancel_at_period_end:
        clear_pending_cancellation(org)

    if state == STATE_IN_GRACE:
        mark_payment_failure(
            org,
            failed_at=moment,
            grace_deadline=expires_at,
            now=moment,
        )
    elif state == STATE_ACTIVE and billing.status == BillingStatus.PAST_DUE:
        mark_payment_recovered(org, now=moment)

    if acknowledge:
        ack_state = normalized.get("acknowledgement_state") or ""
        if ack_state != ACK_ACKNOWLEDGED:
            try:
                acknowledge_subscription_purchase(
                    product_id=normalized["product_id"],
                    purchase_token=normalized["purchase_token"],
                )
            except GooglePlayApiError as exc:
                # Entitlement already persisted — log and continue (client/restore can retry).
                logger.warning(
                    "Google acknowledge failed after entitlement persist code=%s",
                    getattr(exc, "code", ""),
                )

    return _reload_billing(org)


@transaction.atomic
def verify_and_activate_google_subscription(
    organization,
    *,
    purchase_token: str,
    now=None,
) -> WorkspaceSubscription:
    """Owner-authenticated purchase/restore path."""
    normalized = fetch_and_parse_purchase(purchase_token)
    return apply_google_entitlement(
        organization,
        normalized=normalized,
        acknowledge=True,
        now=now,
    )


@transaction.atomic
def reconcile_google_from_purchase_token(
    purchase_token: str,
    *,
    now=None,
) -> WorkspaceSubscription | None:
    """RTDN / server-driven reconcile. Resolves workspace from stored token ownership."""
    token = str(purchase_token or "").strip()
    if not token:
        return None
    org = find_organization_for_purchase_token(token)
    if org is None:
        # Unknown token — fetch once to learn linked token ownership if any.
        try:
            normalized = fetch_and_parse_purchase(token)
        except GoogleVerificationError:
            return None
        linked = normalized.get("linked_purchase_token") or ""
        if linked:
            org = find_organization_for_purchase_token(linked)
        if org is None:
            logger.info("Google RTDN token not linked to any workspace.")
            return None
        return apply_google_entitlement(
            org,
            normalized=normalized,
            acknowledge=False,
            now=now,
        )
    normalized = fetch_and_parse_purchase(token)
    return apply_google_entitlement(
        org,
        normalized=normalized,
        acknowledge=False,
        now=now,
    )


def google_paid_entitlement_is_active(organization) -> bool:
    billing = WorkspaceSubscription.objects.filter(organization=organization).first()
    if billing is None or billing.purchase_source != PurchaseSource.GOOGLE:
        return False
    if billing.status not in {BillingStatus.ACTIVE, BillingStatus.PAST_DUE, BillingStatus.TRIALING}:
        return False
    plan = str(billing.subscribed_plan or "").lower()
    return plan in {"plus", "business"}
