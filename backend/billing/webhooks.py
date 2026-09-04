"""Stripe webhook processing with persisted event idempotency."""

from __future__ import annotations

import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from billing.exceptions import BillingStateError
from billing.models import ProviderEvent, ProviderEventStatus, PurchaseSource
from billing.provider import get_billing_provider
from billing.reconciliation import (
    reconcile_subscription_snapshot,
    resolve_organization_from_mapping,
)
from billing.services import (
    apply_due_billing_transitions,
    mark_payment_failure,
    mark_payment_recovered,
)

logger = logging.getLogger("billing.webhooks")

HANDLED_EVENT_TYPES = frozenset(
    {
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_succeeded",
        "invoice.payment_failed",
    }
)

# If a worker dies after claiming PROCESSING, another delivery may reclaim.
PROCESSING_RECLAIM_AFTER = timedelta(minutes=15)


def _id_string(value) -> str:
    if isinstance(value, dict):
        return str(value.get("id") or "").strip()
    return str(value or "").strip()


def _subscription_id_from_object(obj: dict) -> str:
    """Extract a Stripe subscription id from subscription or invoice payloads.

    Newer Invoice objects omit top-level ``subscription`` and nest it under
    ``parent.subscription_details.subscription`` (and line-item parents).
    """
    if not obj:
        return ""
    if obj.get("object") == "subscription":
        return _id_string(obj.get("id"))

    direct = _id_string(obj.get("subscription"))
    if direct:
        return direct

    parent = obj.get("parent")
    if isinstance(parent, dict):
        details = parent.get("subscription_details") or {}
        if isinstance(details, dict):
            nested = _id_string(details.get("subscription"))
            if nested:
                return nested

    lines = obj.get("lines")
    if isinstance(lines, dict):
        for line in lines.get("data") or []:
            if not isinstance(line, dict):
                continue
            line_sub = _id_string(line.get("subscription"))
            if line_sub:
                return line_sub
            line_parent = line.get("parent")
            if not isinstance(line_parent, dict):
                continue
            item_details = line_parent.get("subscription_item_details") or {}
            if isinstance(item_details, dict):
                nested = _id_string(item_details.get("subscription"))
                if nested:
                    return nested
    return ""


def _customer_id_from_object(obj: dict) -> str:
    customer = obj.get("customer")
    if isinstance(customer, dict):
        return str(customer.get("id") or "")
    return str(customer or "")


def _resolve_organization_for_provider_object(obj: dict, *, provider=None):
    """
    Map a Stripe object to an Organization.

    Prefer metadata + stored WorkspaceSubscription IDs. When an invoice (or
    similar) has empty metadata and no local row yet, enrich from the Stripe
    subscription's metadata so checkout races still resolve. Returns None when
    the object is not a CheckStation billing object (caller should ignore).
    """
    subscription_id = _subscription_id_from_object(obj)
    customer_id = _customer_id_from_object(obj)
    metadata = obj.get("metadata") or {}
    if not isinstance(metadata, dict):
        metadata = {}

    try:
        return resolve_organization_from_mapping(
            metadata=metadata,
            customer_id=customer_id,
            subscription_id=subscription_id,
        )
    except BillingStateError as exc:
        if exc.code != "stripe_tenant_unmapped":
            raise

    if not subscription_id:
        return None

    billing_provider = provider or get_billing_provider()
    try:
        snapshot = billing_provider.retrieve_subscription(subscription_id)
    except Exception as exc:
        logger.info(
            "Could not retrieve Stripe subscription %s for tenant mapping: %s",
            subscription_id[:16],
            exc,
        )
        return None

    merged = {**(snapshot.metadata or {}), **metadata}
    try:
        return resolve_organization_from_mapping(
            metadata=merged,
            customer_id=customer_id or snapshot.customer_id,
            subscription_id=subscription_id or snapshot.subscription_id,
        )
    except BillingStateError as exc:
        if exc.code == "stripe_tenant_unmapped":
            return None
        raise


def _mark_processing(row: ProviderEvent, *, now) -> ProviderEvent:
    row.status = ProviderEventStatus.PROCESSING
    row.processing_started_at = now
    row.error_summary = ""
    row.save(
        update_fields=["status", "processing_started_at", "error_summary"]
    )
    return row


def claim_provider_event_for_processing(event) -> tuple[ProviderEvent | None, str]:
    """
    Atomically claim one provider event for dispatch.

    Returns (row, outcome):
      - claimed: this worker owns PROCESSING and must dispatch
      - duplicate: already PROCESSED or IGNORED — do not dispatch
      - in_progress: another worker holds PROCESSING — do not dispatch
    """
    now = timezone.now()
    with transaction.atomic():
        existing = (
            ProviderEvent.objects.select_for_update()
            .filter(
                provider=PurchaseSource.STRIPE,
                external_event_id=event.event_id,
            )
            .first()
        )
        if existing is None:
            row = ProviderEvent.objects.create(
                provider=PurchaseSource.STRIPE,
                external_event_id=event.event_id,
                event_type=event.event_type,
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
            started = existing.processing_started_at or existing.created_at
            if started is not None and now - started < PROCESSING_RECLAIM_AFTER:
                return existing, "in_progress"
            # Stale PROCESSING: reclaim for retry after crash/timeout.
            return _mark_processing(existing, now=now), "claimed"

        # RECEIVED (legacy) or FAILED → claim for (re)processing.
        if existing.status in {
            ProviderEventStatus.RECEIVED,
            ProviderEventStatus.FAILED,
        }:
            if not existing.event_type and event.event_type:
                existing.event_type = event.event_type
                existing.save(update_fields=["event_type"])
            return _mark_processing(existing, now=now), "claimed"

        # Unknown status: fail closed — treat as in-progress duplicate.
        logger.warning(
            "Unexpected ProviderEvent status=%s event_id=%s; skipping dispatch",
            existing.status,
            event.event_id,
        )
        return existing, "in_progress"


def _mark_processed(existing: ProviderEvent):
    with transaction.atomic():
        row = ProviderEvent.objects.select_for_update().get(pk=existing.pk)
        row.status = ProviderEventStatus.PROCESSED
        row.processed_at = timezone.now()
        row.error_summary = ""
        row.save(update_fields=["status", "processed_at", "error_summary"])


def _mark_ignored(existing: ProviderEvent):
    with transaction.atomic():
        row = ProviderEvent.objects.select_for_update().get(pk=existing.pk)
        row.status = ProviderEventStatus.IGNORED
        row.processed_at = timezone.now()
        row.save(update_fields=["status", "processed_at"])


def _mark_failed(existing: ProviderEvent, exc: Exception):
    """Persist FAILED outside the dispatch transaction so Stripe can retry."""
    with transaction.atomic():
        row = ProviderEvent.objects.select_for_update().get(pk=existing.pk)
        row.status = ProviderEventStatus.FAILED
        row.error_summary = str(exc)[:255]
        row.save(update_fields=["status", "error_summary"])


def process_provider_event(event) -> str:
    """Process one verified provider event. Safe to retry the same event id."""
    existing, outcome = claim_provider_event_for_processing(event)
    if outcome == "duplicate":
        return "duplicate"
    if outcome == "in_progress":
        # Idempotent success so Stripe does not hammer retries while a peer runs.
        return "duplicate"
    if existing is None:
        return "duplicate"

    if event.event_type not in HANDLED_EVENT_TYPES:
        _mark_ignored(existing)
        return "ignored"
    try:
        with transaction.atomic():
            result = _dispatch(event)
    except Exception as exc:
        _mark_failed(existing, exc)
        logger.exception(
            "Stripe webhook failed event_type=%s event_id=%s",
            event.event_type,
            event.event_id,
        )
        raise
    if result == "ignored":
        _mark_ignored(existing)
        return "ignored"
    _mark_processed(existing)
    return "processed"


def _skip_checkstation_org(org) -> bool:
    if org is not None and org.is_checkstation_account:
        logger.info(
            "Ignoring Stripe billing event for CheckStation-managed organization_id=%s",
            org.pk,
        )
        return True
    return False


def _reassert_block_cancellation(org):
    """Keep a blocked paid workspace from renewing if Stripe resume leaked in."""
    from organizations.models import OrganizationStatus
    from organizations.lifecycle import LIVE_BILLING_STATUSES, schedule_block_cancellation
    from billing.services import get_workspace_billing

    if org is None or org.is_checkstation_account:
        return
    if org.status != OrganizationStatus.BLOCKED:
        return
    billing = get_workspace_billing(org)
    if billing is None or billing.status not in LIVE_BILLING_STATUSES:
        return
    if billing.cancel_at_period_end:
        return
    try:
        schedule_block_cancellation(org)
    except Exception:
        logger.exception(
            "Could not re-assert period-end cancellation for blocked organization_id=%s",
            org.pk,
        )


def _dispatch(event):
    provider = get_billing_provider()
    obj = event.data_object or {}
    if event.event_type == "checkout.session.completed":
        session_id = str(obj.get("id") or "")
        session = provider.retrieve_checkout_session(session_id) if session_id else obj
        metadata = session.get("metadata") if isinstance(session, dict) else obj.get("metadata")
        metadata = metadata or obj.get("metadata") or {}
        client_reference_id = ""
        if isinstance(session, dict):
            client_reference_id = str(session.get("client_reference_id") or "")
        subscription_id = ""
        if isinstance(session, dict):
            sub = session.get("subscription")
            subscription_id = str(sub.get("id") if isinstance(sub, dict) else sub or "")
        if not subscription_id:
            subscription_id = _subscription_id_from_object(obj)
        customer_id = ""
        if isinstance(session, dict):
            customer_id = str(session.get("customer") or "")
        org = resolve_organization_from_mapping(
            metadata=metadata,
            client_reference_id=client_reference_id or obj.get("client_reference_id"),
            customer_id=customer_id,
            subscription_id=subscription_id,
        )
        if _skip_checkstation_org(org):
            return
        if not subscription_id:
            raise BillingStateError("Checkout session has no subscription.")
        snapshot = provider.retrieve_subscription(subscription_id)
        reconcile_subscription_snapshot(org, snapshot)
        _reassert_block_cancellation(org)
        return

    subscription_id = _subscription_id_from_object(obj)
    customer_id = _customer_id_from_object(obj)
    metadata = obj.get("metadata") or {}
    if event.event_type.startswith("customer.subscription"):
        org = resolve_organization_from_mapping(
            metadata=metadata,
            customer_id=customer_id,
            subscription_id=subscription_id,
        )
        if _skip_checkstation_org(org):
            return
        snapshot = provider.retrieve_subscription(subscription_id)
        reconcile_subscription_snapshot(org, snapshot)
        apply_due_billing_transitions(org)
        _reassert_block_cancellation(org)
        return

    if event.event_type in {"invoice.paid", "invoice.payment_succeeded"}:
        org = _resolve_organization_for_provider_object(obj, provider=provider)
        if org is None:
            logger.info(
                "Ignoring Stripe %s with no CheckStation workspace mapping",
                event.event_type,
            )
            return "ignored"
        if _skip_checkstation_org(org):
            return
        subscription_id = _subscription_id_from_object(obj)
        if subscription_id:
            snapshot = provider.retrieve_subscription(subscription_id)
            reconcile_subscription_snapshot(org, snapshot)
        else:
            mark_payment_recovered(org)
        _reassert_block_cancellation(org)
        return

    if event.event_type == "invoice.payment_failed":
        org = _resolve_organization_for_provider_object(obj, provider=provider)
        if org is None:
            logger.info(
                "Ignoring Stripe invoice.payment_failed with no CheckStation workspace mapping"
            )
            return "ignored"
        if _skip_checkstation_org(org):
            return
        mark_payment_failure(org)
        apply_due_billing_transitions(org)
        _reassert_block_cancellation(org)
        return
