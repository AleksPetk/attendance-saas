"""Google Play Real-time Developer Notifications (RTDN) via Pub/Sub push."""

from __future__ import annotations

import base64
import json
import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from billing.exceptions import BillingStateError
from billing.google_verify import (
    GoogleVerificationError,
    reconcile_google_from_purchase_token,
)
from billing.models import BillingProvider, ProviderEvent, ProviderEventStatus

logger = logging.getLogger("billing.google_notifications")

PROCESSING_RECLAIM_AFTER = timedelta(minutes=15)

# subscriptionNotification.notificationType (Play Billing)
NOTIFICATION_TYPES = {
    1: "SUBSCRIPTION_RECOVERED",
    2: "SUBSCRIPTION_RENEWED",
    3: "SUBSCRIPTION_CANCELED",
    4: "SUBSCRIPTION_PURCHASED",
    5: "SUBSCRIPTION_ON_HOLD",
    6: "SUBSCRIPTION_IN_GRACE_PERIOD",
    7: "SUBSCRIPTION_RESTARTED",
    8: "SUBSCRIPTION_PRICE_CHANGE_CONFIRMED",
    9: "SUBSCRIPTION_DEFERRED",
    10: "SUBSCRIPTION_PAUSED",
    11: "SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED",
    12: "SUBSCRIPTION_REVOKED",
    13: "SUBSCRIPTION_EXPIRED",
    20: "SUBSCRIPTION_PENDING_PURCHASE_CANCELED",
}


class GoogleNotificationAuthError(BillingStateError):
    """Pub/Sub OIDC authentication failed."""


def _claim_google_event(*, external_event_id: str, event_type: str):
    now = timezone.now()
    with transaction.atomic():
        existing = (
            ProviderEvent.objects.select_for_update()
            .filter(
                provider=BillingProvider.GOOGLE,
                external_event_id=external_event_id,
            )
            .first()
        )
        if existing is None:
            row = ProviderEvent.objects.create(
                provider=BillingProvider.GOOGLE,
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
            existing.event_type = event_type[:120]
            existing.save(
                update_fields=[
                    "status",
                    "processing_started_at",
                    "error_summary",
                    "event_type",
                ]
            )
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


def _mark_ignored(row: ProviderEvent, summary: str = ""):
    with transaction.atomic():
        locked = ProviderEvent.objects.select_for_update().get(pk=row.pk)
        locked.status = ProviderEventStatus.IGNORED
        locked.processed_at = timezone.now()
        locked.error_summary = (summary or "")[:255]
        locked.save(update_fields=["status", "processed_at", "error_summary"])


def _mark_failed(row: ProviderEvent, summary: str):
    with transaction.atomic():
        locked = ProviderEvent.objects.select_for_update().get(pk=row.pk)
        locked.status = ProviderEventStatus.FAILED
        locked.error_summary = (summary or "")[:255]
        locked.save(update_fields=["status", "error_summary"])


def verify_pubsub_oidc_token(authorization_header: str) -> dict:
    """Verify Google-signed OIDC bearer token for Pub/Sub push."""
    if bool(getattr(settings, "GOOGLE_PLAY_RTDN_SKIP_AUTH", False)):
        return {"email": "skipped", "skip_auth": True}

    header = str(authorization_header or "").strip()
    if not header.lower().startswith("bearer "):
        raise GoogleNotificationAuthError(
            "Missing bearer token.",
            code="google_rtdn_auth_missing",
        )
    token = header[7:].strip()
    if not token:
        raise GoogleNotificationAuthError(
            "Missing bearer token.",
            code="google_rtdn_auth_missing",
        )

    audience = str(getattr(settings, "GOOGLE_PLAY_RTDN_AUDIENCE", "") or "").strip()
    if not audience:
        raise GoogleNotificationAuthError(
            "RTDN audience is not configured.",
            code="google_rtdn_not_configured",
        )
    expected_email = str(
        getattr(settings, "GOOGLE_PLAY_RTDN_OIDC_SERVICE_ACCOUNT_EMAIL", "") or ""
    ).strip().lower()

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests
    except ImportError as exc:
        raise GoogleNotificationAuthError(
            "Google auth library is unavailable.",
            code="google_rtdn_not_configured",
        ) from exc

    try:
        claims = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            audience=audience,
        )
    except Exception as exc:
        raise GoogleNotificationAuthError(
            "Invalid Pub/Sub OIDC token.",
            code="google_rtdn_auth_invalid",
        ) from exc

    email = str(claims.get("email") or "").strip().lower()
    if expected_email and email != expected_email:
        raise GoogleNotificationAuthError(
            "Pub/Sub OIDC service account mismatch.",
            code="google_rtdn_auth_invalid",
        )
    if not expected_email and not email.endswith(".gserviceaccount.com"):
        raise GoogleNotificationAuthError(
            "Pub/Sub OIDC service account mismatch.",
            code="google_rtdn_auth_invalid",
        )
    if claims.get("email_verified") is False:
        raise GoogleNotificationAuthError(
            "Pub/Sub OIDC email is not verified.",
            code="google_rtdn_auth_invalid",
        )
    return claims


def _decode_pubsub_data(envelope: dict) -> tuple[str, dict]:
    message = envelope.get("message") if isinstance(envelope, dict) else None
    if not isinstance(message, dict):
        raise BillingStateError(
            "Pub/Sub message is required.",
            code="google_rtdn_invalid",
        )
    message_id = str(message.get("messageId") or message.get("message_id") or "").strip()
    if not message_id:
        raise BillingStateError(
            "Pub/Sub messageId is required.",
            code="google_rtdn_invalid",
        )
    raw_b64 = message.get("data")
    if raw_b64 is None or raw_b64 == "":
        raise BillingStateError(
            "Pub/Sub message data is required.",
            code="google_rtdn_invalid",
        )
    try:
        decoded = base64.b64decode(str(raw_b64)).decode("utf-8")
        payload = json.loads(decoded) if decoded else {}
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BillingStateError(
            "Pub/Sub message data is invalid.",
            code="google_rtdn_invalid",
        ) from exc
    if not isinstance(payload, dict):
        raise BillingStateError(
            "RTDN payload must be an object.",
            code="google_rtdn_invalid",
        )
    return message_id, payload


def process_google_rtdn_envelope(envelope: dict) -> dict:
    """Process one Pub/Sub push envelope. Idempotent by messageId."""
    message_id, payload = _decode_pubsub_data(envelope)

    if "testNotification" in payload:
        row, outcome = _claim_google_event(
            external_event_id=f"test:{message_id}",
            event_type="TEST_NOTIFICATION",
        )
        if outcome == "duplicate":
            return {"status": "duplicate", "event": "testNotification"}
        if outcome == "in_progress":
            return {"status": "in_progress", "event": "testNotification"}
        _mark_ignored(row, "testNotification")
        return {"status": "ok", "event": "testNotification"}

    if "voidedPurchaseNotification" in payload:
        voided = payload.get("voidedPurchaseNotification") or {}
        purchase_token = str(voided.get("purchaseToken") or "").strip()
        event_type = "VOIDED_PURCHASE"
        row, outcome = _claim_google_event(
            external_event_id=message_id,
            event_type=event_type,
        )
        if outcome == "duplicate":
            return {"status": "duplicate", "event": event_type}
        if outcome == "in_progress":
            return {"status": "in_progress", "event": event_type}
        try:
            if purchase_token:
                reconcile_google_from_purchase_token(purchase_token)
            _mark_processed(row)
            return {"status": "ok", "event": event_type}
        except GoogleVerificationError as exc:
            _mark_failed(row, getattr(exc, "code", "") or str(exc))
            raise
        except Exception as exc:
            _mark_failed(row, str(exc)[:240])
            raise

    if "subscriptionNotification" in payload:
        note = payload.get("subscriptionNotification") or {}
        purchase_token = str(note.get("purchaseToken") or "").strip()
        ntype = note.get("notificationType")
        try:
            ntype_int = int(ntype)
        except (TypeError, ValueError):
            ntype_int = -1
        event_type = NOTIFICATION_TYPES.get(ntype_int, f"SUBSCRIPTION_TYPE_{ntype}")
        row, outcome = _claim_google_event(
            external_event_id=message_id,
            event_type=event_type,
        )
        if outcome == "duplicate":
            return {"status": "duplicate", "event": event_type}
        if outcome == "in_progress":
            return {"status": "in_progress", "event": event_type}
        try:
            if not purchase_token:
                _mark_ignored(row, "missing purchaseToken")
                return {"status": "ignored", "event": event_type}
            reconcile_google_from_purchase_token(purchase_token)
            _mark_processed(row)
            return {"status": "ok", "event": event_type}
        except GoogleVerificationError as exc:
            _mark_failed(row, getattr(exc, "code", "") or str(exc))
            raise
        except Exception as exc:
            _mark_failed(row, str(exc)[:240])
            raise

    row, outcome = _claim_google_event(
        external_event_id=message_id,
        event_type="UNKNOWN_RTDN",
    )
    if outcome in {"duplicate", "in_progress"}:
        return {"status": outcome, "event": "unknown"}
    _mark_ignored(row, "unrecognized RTDN payload")
    return {"status": "ignored", "event": "unknown"}
