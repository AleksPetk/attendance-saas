"""Apple subscription verification and entitlement reconciliation."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone as dj_timezone
from django.utils.dateparse import parse_datetime

from billing.apple_jws import verify_apple_jws
from billing.apple_products import (
    APPLE_BUNDLE_ID,
    APPLE_PRODUCT_IDS,
    plan_interval_for_apple_product,
)
from billing.exceptions import BillingStateError
from billing.models import (
    AppleEnvironment,
    AppleSubscriptionDetails,
    BillingStatus,
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


class AppleVerificationError(BillingStateError):
    """Apple transaction verification failed."""


def _reload_billing(organization) -> WorkspaceSubscription:
    org, billing = lock_workspace_billing(organization)
    _ = org
    return billing


def _ms_to_dt(value) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    try:
        millis = int(value)
    except (TypeError, ValueError):
        parsed = parse_datetime(str(value))
        if parsed is None:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    return datetime.fromtimestamp(millis / 1000.0, tz=timezone.utc)


def _normalize_environment(raw: str) -> str:
    key = str(raw or "").strip().lower()
    if key in {"sandbox", "xcode", "localtesting"}:
        return AppleEnvironment.SANDBOX
    if key in {"production", "prod"}:
        return AppleEnvironment.PRODUCTION
    raise AppleVerificationError(
        "Unsupported Apple environment.",
        code="apple_environment_invalid",
    )


def _currency_for_transaction(claims: dict, *, fallback: str = "usd") -> str:
    raw = str(claims.get("currency") or "").strip().lower()
    if raw in {"usd", "jpy"}:
        return raw
    return str(fallback or "usd").strip().lower() or "usd"


def ensure_apple_app_account_token(organization) -> str:
    """Stable UUID appAccountToken for the workspace (Apple requires UUID format)."""
    with transaction.atomic():
        org, locked = lock_workspace_billing(organization)
        _ = org
        token = (locked.apple_app_account_token or "").strip()
        if token:
            return token
        token = str(uuid.uuid4())
        locked.apple_app_account_token = token
        locked.save(update_fields=["apple_app_account_token", "updated_at"])
        return token


def parse_verified_transaction_claims(claims: dict) -> dict[str, Any]:
    """Normalize Apple transaction claims after JWS verification."""
    if not isinstance(claims, dict):
        raise AppleVerificationError(
            "Apple transaction claims are invalid.",
            code="apple_jws_invalid",
        )
    bundle_id = str(claims.get("bundleId") or "").strip()
    expected = (getattr(settings, "APPLE_IAP_BUNDLE_ID", "") or APPLE_BUNDLE_ID).strip()
    if bundle_id != expected:
        raise AppleVerificationError(
            "Apple transaction bundle id does not match this app.",
            code="apple_bundle_mismatch",
        )
    product_id = str(claims.get("productId") or "").strip()
    if product_id not in APPLE_PRODUCT_IDS:
        raise AppleVerificationError(
            "Unknown Apple product.",
            code="apple_unknown_product",
        )
    plan, interval = plan_interval_for_apple_product(product_id)
    original_transaction_id = str(
        claims.get("originalTransactionId") or claims.get("transactionId") or ""
    ).strip()
    transaction_id = str(claims.get("transactionId") or "").strip()
    if not original_transaction_id or not transaction_id:
        raise AppleVerificationError(
            "Apple transaction identifiers are missing.",
            code="apple_transaction_missing",
        )
    expires_at = _ms_to_dt(claims.get("expiresDate"))
    purchased_at = _ms_to_dt(claims.get("purchaseDate")) or _ms_to_dt(
        claims.get("originalPurchaseDate")
    )
    environment = _normalize_environment(claims.get("environment") or "Production")
    app_account_token = str(claims.get("appAccountToken") or "").strip().lower()
    revocation_date = _ms_to_dt(claims.get("revocationDate"))
    return {
        "bundle_id": bundle_id,
        "product_id": product_id,
        "plan": plan,
        "interval": interval,
        "original_transaction_id": original_transaction_id,
        "transaction_id": transaction_id,
        "expires_at": expires_at,
        "purchased_at": purchased_at,
        "environment": environment,
        "app_account_token": app_account_token,
        "revocation_date": revocation_date,
        "type": str(claims.get("type") or ""),
        "raw": claims,
    }


def verify_signed_transaction(signed_transaction: str) -> dict[str, Any]:
    """Verify client-supplied StoreKit JWS and return normalized claims."""
    verified = verify_apple_jws(signed_transaction)
    return parse_verified_transaction_claims(verified.payload)


def _auto_renew_from_renewal_info(renewal_info: dict | None) -> bool | None:
    if not renewal_info:
        return None
    status = renewal_info.get("autoRenewStatus")
    if status is None:
        return None
    try:
        return int(status) == 1
    except (TypeError, ValueError):
        return bool(status)


def _bind_apple_details(
    *,
    billing: WorkspaceSubscription,
    normalized: dict[str, Any],
    auto_renew: bool | None,
    app_account_token: str,
) -> AppleSubscriptionDetails:
    details, _created = AppleSubscriptionDetails.objects.select_for_update().get_or_create(
        billing=billing,
        defaults={
            "original_transaction_id": normalized["original_transaction_id"],
            "product_id": normalized["product_id"],
            "environment": normalized["environment"],
            "latest_expiration_at": normalized["expires_at"],
            "auto_renew": auto_renew,
            "app_account_token": app_account_token,
        },
    )
    # Cross-workspace uniqueness on original_transaction_id
    other = (
        AppleSubscriptionDetails.objects.select_for_update()
        .filter(original_transaction_id=normalized["original_transaction_id"])
        .exclude(pk=details.pk)
        .first()
    )
    if other is not None:
        raise AppleVerificationError(
            "This Apple subscription is already linked to another workspace.",
            code="apple_transaction_bound_elsewhere",
        )
    details.original_transaction_id = normalized["original_transaction_id"]
    details.product_id = normalized["product_id"]
    details.environment = normalized["environment"]
    details.latest_expiration_at = normalized["expires_at"]
    if auto_renew is not None:
        details.auto_renew = auto_renew
    if app_account_token:
        details.app_account_token = app_account_token
    details.save()
    return details


@transaction.atomic
def apply_apple_entitlement(
    organization,
    *,
    normalized: dict[str, Any],
    auto_renew: bool | None = None,
    expected_app_account_token: str = "",
    allow_missing_app_account_token: bool = True,
    now=None,
) -> WorkspaceSubscription:
    """Activate or sync Apple-paid entitlement from verified Apple truth."""
    moment = now if now is not None else dj_timezone.now()
    org, billing = lock_workspace_billing(organization)
    assert_can_activate_provider(
        organization=org,
        billing=billing,
        provider=PurchaseSource.APPLE,
    )

    workspace_token = ensure_apple_app_account_token(org)
    claimed_token = (normalized.get("app_account_token") or "").strip().lower()
    expected = (expected_app_account_token or workspace_token or "").strip().lower()
    if claimed_token:
        if expected and claimed_token != expected:
            raise AppleVerificationError(
                "Apple appAccountToken does not match this workspace.",
                code="apple_app_account_token_mismatch",
            )
    elif not allow_missing_app_account_token:
        raise AppleVerificationError(
            "Apple appAccountToken is required.",
            code="apple_app_account_token_missing",
        )

    # Reject if original txn belongs to a different workspace.
    existing = (
        AppleSubscriptionDetails.objects.select_for_update()
        .filter(original_transaction_id=normalized["original_transaction_id"])
        .select_related("billing", "billing__organization")
        .first()
    )
    if existing is not None and existing.billing.organization_id != org.id:
        raise AppleVerificationError(
            "This Apple subscription is already linked to another workspace.",
            code="apple_transaction_bound_elsewhere",
        )

    expires_at = normalized.get("expires_at")
    revoked_at = normalized.get("revocation_date")
    if revoked_at is not None and revoked_at <= moment:
        if billing.purchase_source == PurchaseSource.APPLE:
            finalize_subscription_end(org, ended_at=revoked_at, now=moment)
            details = getattr(billing, "apple_details", None)
            if details is not None:
                details.auto_renew = False
                details.latest_expiration_at = revoked_at
                details.save(
                    update_fields=["auto_renew", "latest_expiration_at", "updated_at"]
                )
        return _reload_billing(org)

    if expires_at is not None and expires_at <= moment:
        if billing.purchase_source == PurchaseSource.APPLE or existing is not None:
            finalize_subscription_end(org, ended_at=expires_at, now=moment)
        return _reload_billing(org)

    if expires_at is None:
        raise AppleVerificationError(
            "Apple subscription is missing an expiration date.",
            code="apple_transaction_incomplete",
        )

    period_start = normalized.get("purchased_at") or moment
    currency = _currency_for_transaction(normalized.get("raw") or {})
    try:
        billing = activate_paid_subscription(
            org,
            subscribed_plan=normalized["plan"],
            billing_interval=normalized["interval"],
            purchase_source=PurchaseSource.APPLE,
            current_period_start=period_start,
            current_period_end=expires_at,
            external_subscription_id=normalized["original_transaction_id"],
            currency=currency,
            now=moment,
        )
    except IntegrityError as exc:
        raise AppleVerificationError(
            "This Apple subscription is already linked to another workspace.",
            code="apple_transaction_bound_elsewhere",
        ) from exc

    # Re-lock after activate (new atomic section may have closed).
    org, billing = lock_workspace_billing(org)
    _bind_apple_details(
        billing=billing,
        normalized=normalized,
        auto_renew=auto_renew,
        app_account_token=claimed_token or workspace_token,
    )

    if auto_renew is False:
        schedule_cancellation(org, effective_at=expires_at)
    elif auto_renew is True and billing.cancel_at_period_end:
        clear_pending_cancellation(org)

    if billing.status == BillingStatus.PAST_DUE and auto_renew is not False:
        mark_payment_recovered(org, now=moment)

    return _reload_billing(org)


@transaction.atomic
def verify_and_activate_apple_subscription(
    organization,
    *,
    signed_transaction: str,
    signed_renewal_info: str = "",
    now=None,
) -> WorkspaceSubscription:
    """Owner-authenticated purchase/restore path."""
    normalized = verify_signed_transaction(signed_transaction)
    renewal = None
    if signed_renewal_info:
        renewal = verify_apple_jws(signed_renewal_info).payload
    auto_renew = _auto_renew_from_renewal_info(renewal)
    return apply_apple_entitlement(
        organization,
        normalized=normalized,
        auto_renew=auto_renew,
        now=now,
    )


@transaction.atomic
def reconcile_apple_from_notification(
    *,
    notification_type: str,
    subtype: str,
    normalized: dict[str, Any],
    renewal_info: dict | None,
    organization,
    now=None,
) -> WorkspaceSubscription | None:
    """Apply ASN V2-driven state for a resolved workspace."""
    moment = now if now is not None else dj_timezone.now()
    auto_renew = _auto_renew_from_renewal_info(renewal_info)
    ntype = str(notification_type or "").strip().upper()
    sub = str(subtype or "").strip().upper()

    if ntype in {"EXPIRED", "GRACE_PERIOD_EXPIRED"} or (
        ntype == "DID_FAIL_TO_RENEW" and sub == "GRACE_PERIOD_EXPIRED"
    ):
        org, billing = lock_workspace_billing(organization)
        if billing.purchase_source == PurchaseSource.APPLE:
            return finalize_subscription_end(org, ended_at=moment, now=moment)
        return billing

    if ntype in {"REFUND", "REVOKE"}:
        return apply_apple_entitlement(
            organization,
            normalized={
                **normalized,
                "revocation_date": normalized.get("revocation_date") or moment,
            },
            auto_renew=False,
            now=moment,
        )

    if ntype == "DID_FAIL_TO_RENEW":
        org, billing = lock_workspace_billing(organization)
        if billing.purchase_source == PurchaseSource.APPLE:
            mark_payment_failure(org, now=moment)
            if auto_renew is not None:
                details = getattr(billing, "apple_details", None)
                if details is not None:
                    details.auto_renew = auto_renew
                    details.save(update_fields=["auto_renew", "updated_at"])
        return _reload_billing(organization)

    # SUBSCRIBED / DID_RENEW / DID_CHANGE_RENEWAL_STATUS / DID_CHANGE_RENEWAL_PREF /
    # OFFER_REDEEMED / RENEWAL_EXTENDED / etc. → sync entitlement from Apple truth
    return apply_apple_entitlement(
        organization,
        normalized=normalized,
        auto_renew=auto_renew,
        now=moment,
    )


def find_organization_for_original_transaction(original_transaction_id: str):
    txn = str(original_transaction_id or "").strip()
    if not txn:
        return None
    details = (
        AppleSubscriptionDetails.objects.select_related("billing__organization")
        .filter(original_transaction_id=txn)
        .first()
    )
    if details is None:
        return None
    return details.billing.organization


def find_organization_for_app_account_token(token: str):
    value = str(token or "").strip().lower()
    if not value:
        return None
    billing = (
        WorkspaceSubscription.objects.select_related("organization")
        .filter(apple_app_account_token=value)
        .first()
    )
    if billing is not None:
        return billing.organization
    details = (
        AppleSubscriptionDetails.objects.select_related("billing__organization")
        .filter(app_account_token=value)
        .first()
    )
    if details is None:
        return None
    return details.billing.organization
