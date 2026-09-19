"""App Store Server Notifications V2 processing with ProviderEvent idempotency."""

from __future__ import annotations

import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from billing.apple_jws import (
    decode_nested_signed_renewal,
    decode_nested_signed_transaction,
    verify_apple_jws,
)
from billing.apple_verify import (
    find_organization_for_app_account_token,
    find_organization_for_original_transaction,
    parse_verified_transaction_claims,
    reconcile_apple_from_notification,
)
from billing.exceptions import BillingStateError
from billing.models import BillingProvider, ProviderEvent, ProviderEventStatus

logger = logging.getLogger("billing.apple_notifications")

PROCESSING_RECLAIM_AFTER = timedelta(minutes=15)

HANDLED_NOTIFICATION_TYPES = frozenset(
    {
        "SUBSCRIBED",
        "DID_RENEW",
        "DID_CHANGE_RENEWAL_STATUS",
        "DID_CHANGE_RENEWAL_PREF",
        "DID_FAIL_TO_RENEW",
        "EXPIRED",
        "GRACE_PERIOD_EXPIRED",
        "REFUND",
        "REVOKE",
        "RENEWAL_EXTENDED",
        "OFFER_REDEEMED",
        "PRICE_INCREASE",
    }
)


def _claim_apple_event(*, external_event_id: str, event_type: str):
    """Atomically claim an Apple ProviderEvent. Returns (row|None, outcome)."""
    now = timezone.now()
    with transaction.atomic():
        existing = (
            ProviderEvent.objects.select_for_update()
            .filter(
                provider=BillingProvider.APPLE,
                external_event_id=external_event_id,
            )
            .first()
        )
        if existing is None:
            row = ProviderEvent.objects.create(
                provider=BillingProvider.APPLE,
                external_event_id=external_event_id,
                event_type=event_type[:120],
                status=ProviderEventStatus.PROCESSING,
                processing_started_at=now,
            )
            return row, "claimed"

        if existing.status in {
            ProviderEventStatus.PROCESSED,
            ProviderEventStatus.IGNORED,
        }:
            return existing, "duplicate"

        if existing.status == ProviderEventStatus.PROCESSING:
            started = existing.processing_started_at
            if started and now - started < PROCESSING_RECLAIM_AFTER:
                return existing, "in_progress"
            existing.status = ProviderEventStatus.PROCESSING
            existing.processing_started_at = now
            existing.error_summary = ""
            existing.save(
                update_fields=[
                    "status",
                    "processing_started_at",
                    "error_summary",
                    "event_type",
                ]
            )
            existing.event_type = event_type[:120]
            existing.save(update_fields=["event_type"])
            return existing, "claimed"

        if existing.status in {
            ProviderEventStatus.RECEIVED,
            ProviderEventStatus.FAILED,
        }:
            existing.status = ProviderEventStatus.PROCESSING
            existing.processing_started_at = now
            existing.event_type = event_type[:120]
            existing.error_summary = ""
            existing.save(
                update_fields=[
                    "status",
                    "processing_started_at",
                    "event_type",
                    "error_summary",
                ]
            )
            return existing, "claimed"

        return existing, "duplicate"


def _mark_processed(row: ProviderEvent):
    with transaction.atomic():
        locked = ProviderEvent.objects.select_for_update().get(pk=row.pk)
        locked.status = ProviderEventStatus.PROCESSED
        locked.processed_at = timezone.now()
        locked.error_summary = ""
        locked.save(update_fields=["status", "processed_at", "error_summary"])


def _mark_ignored(row: ProviderEvent, reason: str = ""):
    with transaction.atomic():
        locked = ProviderEvent.objects.select_for_update().get(pk=row.pk)
        locked.status = ProviderEventStatus.IGNORED
        locked.processed_at = timezone.now()
        locked.error_summary = (reason or "")[:255]
        locked.save(update_fields=["status", "processed_at", "error_summary"])


def _mark_failed(row: ProviderEvent, exc: Exception):
    with transaction.atomic():
        locked = ProviderEvent.objects.select_for_update().get(pk=row.pk)
        locked.status = ProviderEventStatus.FAILED
        locked.error_summary = str(exc)[:255]
        locked.save(update_fields=["status", "error_summary"])


def _resolve_organization(normalized: dict):
    org = find_organization_for_original_transaction(
        normalized["original_transaction_id"]
    )
    if org is not None:
        return org
    token = normalized.get("app_account_token") or ""
    return find_organization_for_app_account_token(token)


def process_apple_notification_signed_payload(signed_payload: str) -> dict:
    """Verify and process one ASN V2 signedPayload. Returns a small status dict."""
    outer = verify_apple_jws(signed_payload)
    payload = outer.payload
    notification_type = str(payload.get("notificationType") or "").strip()
    subtype = str(payload.get("subtype") or "").strip()
    notification_uuid = str(payload.get("notificationUUID") or "").strip()
    if not notification_uuid:
        raise BillingStateError(
            "Apple notification is missing notificationUUID.",
            code="apple_notification_invalid",
        )

    event_type = notification_type
    if subtype:
        event_type = f"{notification_type}.{subtype}"

    row, outcome = _claim_apple_event(
        external_event_id=notification_uuid,
        event_type=event_type,
    )
    if outcome == "duplicate":
        return {"status": "duplicate", "notification_uuid": notification_uuid}
    if outcome == "in_progress":
        return {"status": "in_progress", "notification_uuid": notification_uuid}
    if row is None:
        return {"status": "skipped", "notification_uuid": notification_uuid}

    try:
        if notification_type not in HANDLED_NOTIFICATION_TYPES:
            _mark_ignored(row, reason=f"unhandled:{notification_type}")
            return {
                "status": "ignored",
                "notification_uuid": notification_uuid,
                "notification_type": notification_type,
            }

        data = payload.get("data") or {}
        if not isinstance(data, dict):
            raise BillingStateError(
                "Apple notification data is invalid.",
                code="apple_notification_invalid",
            )
        txn_claims = decode_nested_signed_transaction(data)
        normalized = parse_verified_transaction_claims(txn_claims)
        renewal = decode_nested_signed_renewal(data)
        organization = _resolve_organization(normalized)
        if organization is None:
            # First purchase may arrive before verify binds — ignore until bound,
            # unless appAccountToken maps a workspace (handled above).
            _mark_ignored(row, reason="organization_unresolved")
            return {
                "status": "ignored",
                "notification_uuid": notification_uuid,
                "reason": "organization_unresolved",
            }

        reconcile_apple_from_notification(
            notification_type=notification_type,
            subtype=subtype,
            normalized=normalized,
            renewal_info=renewal,
            organization=organization,
        )
        _mark_processed(row)
        return {
            "status": "processed",
            "notification_uuid": notification_uuid,
            "notification_type": notification_type,
        }
    except Exception as exc:
        logger.exception(
            "Apple notification failed uuid=%s type=%s",
            notification_uuid,
            notification_type,
        )
        _mark_failed(row, exc)
        raise
