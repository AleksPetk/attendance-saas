"""Postgres outbox enqueue + worker processing for Group after-action email."""

from __future__ import annotations

import logging
import smtplib
import socket
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from groups.email_providers.base import EmailSenderProviderError
from groups.email_sender import send_after_action_email
from groups.email_sender_models import (
    GroupEmailDelivery,
    GroupEmailDeliveryStatus,
    GroupEmailOutboxJob,
    GroupEmailOutboxStatus,
)
from groups.operations import after_action_kind_for_action_type, after_action_should_run

logger = logging.getLogger("groups.email_outbox")

STALE_PROCESSING_SECONDS = 15 * 60
DEFAULT_POLL_SECONDS = 0.5


def enqueue_after_action_email_outbox(
    *,
    group,
    action_type,
    action_record,
    membership=None,
    group_only_participant=None,
    timezone_name=None,
):
    """
    Insert a durable outbox row when after-action email should run.

    Must be called inside the same transaction.atomic() as ActionRecord create.
    Does not send SMTP. Returns the job or None when email should not run.
    """
    kind = after_action_kind_for_action_type(action_type)
    if kind is None:
        return None
    if not after_action_should_run(group, kind):
        return None
    if action_record is None:
        return None

    participant_name = ""
    if membership is not None:
        participant_name = membership.effective_name
    elif group_only_participant is not None:
        participant_name = group_only_participant.name
    else:
        participant_name = getattr(action_record, "participant_name_snapshot", "") or ""

    now = timezone.now()
    job, created = GroupEmailOutboxJob.objects.get_or_create(
        action_record=action_record,
        event_type=kind,
        defaults={
            "organization_id": group.organization_id,
            "group_id": group.pk,
            "status": GroupEmailOutboxStatus.PENDING,
            "attempt_count": 0,
            "max_attempts": GroupEmailOutboxJob.MAX_ATTEMPTS,
            "available_at": now,
            "participant_name_snapshot": (participant_name or "")[:255],
            "timezone_name": (timezone_name or "")[:64],
        },
    )
    if created:
        logger.info(
            "Queued after-action email outbox job_id=%s action_record_id=%s "
            "group_id=%s event_type=%s",
            job.pk,
            action_record.pk,
            group.pk,
            kind,
        )
    return job


def classify_smtp_failure_retryable(exc) -> bool:
    """Return True for temporary failures that should be retried."""
    if isinstance(exc, EmailSenderProviderError):
        diagnostic = exc.diagnostic or {}
        if isinstance(diagnostic, dict):
            code = diagnostic.get("code")
            response = str(diagnostic.get("response") or "").lower()
            exception_name = str(diagnostic.get("exception") or "")
        else:
            code = None
            response = str(diagnostic).lower()
            exception_name = ""
        public = (exc.public_message or "").lower()
        if "authentication failed" in public or "smtp auth" in public:
            return False
        if "rejected the recipient" in public or "refused this recipient" in public:
            return False
        if "rejected the sender" in public or "owned by the authenticated" in public:
            return False
        if code in {535, 530, 550, 551, 552, 553, 554}:
            return False
        if code in {421, 450, 451, 452}:
            return True
        if "timed out" in public or "timeout" in public:
            return True
        if "could not connect" in public:
            return True
        if exception_name in {
            "TimeoutError",
            "SMTPServerDisconnected",
            "SMTPConnectError",
            "gaierror",
            "ConnectionError",
            "OSError",
            "BrokenPipeError",
            "ConnectionResetError",
        }:
            return True
        if "4." in response and code and 400 <= int(code) < 500:
            return True
        # TLS misconfiguration is usually permanent for this sender config.
        if "secure smtp connection" in public:
            return False
        return True

    if isinstance(
        exc,
        (
            TimeoutError,
            socket.timeout,
            socket.gaierror,
            ConnectionError,
            ConnectionResetError,
            BrokenPipeError,
            smtplib.SMTPConnectError,
            smtplib.SMTPServerDisconnected,
        ),
    ):
        return True
    if isinstance(exc, smtplib.SMTPResponseException):
        code = getattr(exc, "smtp_code", None)
        if code in {421, 450, 451, 452}:
            return True
        if code is not None and 500 <= int(code) < 600:
            return False
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return False
    if isinstance(exc, (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused)):
        return False
    return True


def _next_available_at(*, attempt_count: int, now=None):
    """attempt_count is the count after the failed attempt (1..max)."""
    now = now or timezone.now()
    delays = GroupEmailOutboxJob.RETRY_DELAYS_SECONDS
    # attempt_count=1 → delays[0]=30s, … attempt_count=4 → delays[3]=1800s
    idx = max(0, min(attempt_count - 1, len(delays) - 1))
    return now + timedelta(seconds=delays[idx])


def reclaim_stale_processing(*, now=None, stale_seconds=STALE_PROCESSING_SECONDS) -> int:
    now = now or timezone.now()
    cutoff = now - timedelta(seconds=stale_seconds)
    updated = GroupEmailOutboxJob.objects.filter(
        status=GroupEmailOutboxStatus.PROCESSING,
        processing_started_at__lt=cutoff,
    ).update(
        status=GroupEmailOutboxStatus.PENDING,
        processing_started_at=None,
        available_at=now,
        last_error="Reclaimed after worker interruption",
        updated_at=now,
    )
    if updated:
        logger.warning("Reclaimed stale email outbox jobs count=%s", updated)
    return updated


def claim_due_jobs(*, limit=1, now=None):
    """Claim due pending jobs with SKIP LOCKED. Returns list of locked jobs."""
    now = now or timezone.now()
    reclaim_stale_processing(now=now)
    claimed = []
    with transaction.atomic():
        qs = (
            GroupEmailOutboxJob.objects.select_for_update(skip_locked=True)
            .filter(
                status=GroupEmailOutboxStatus.PENDING,
                available_at__lte=now,
            )
            .order_by("available_at", "id")[: max(1, int(limit))]
        )
        for job in qs:
            job.status = GroupEmailOutboxStatus.PROCESSING
            job.processing_started_at = now
            job.save(
                update_fields=[
                    "status",
                    "processing_started_at",
                    "updated_at",
                ]
            )
            claimed.append(job)
    return claimed


def _already_fully_sent(job) -> bool:
    """True when every recorded recipient for this action already has a SENT row."""
    deliveries = GroupEmailDelivery.objects.filter(
        action_record_id=job.action_record_id,
        event_type=job.event_type,
    )
    if not deliveries.exists():
        return False
    statuses = set(deliveries.values_list("status", flat=True))
    return (
        GroupEmailDeliveryStatus.SENT in statuses
        and GroupEmailDeliveryStatus.FAILED not in statuses
    )


def process_outbox_job(job) -> str:
    """
    Process one claimed job. Returns terminal outcome:
    succeeded | failed | retry_scheduled
    """
    now = timezone.now()
    job = GroupEmailOutboxJob.objects.select_related(
        "group", "action_record", "organization"
    ).get(pk=job.pk)

    if _already_fully_sent(job):
        job.status = GroupEmailOutboxStatus.SUCCEEDED
        job.completed_at = now
        job.processing_started_at = None
        job.last_error = ""
        job.save(
            update_fields=[
                "status",
                "completed_at",
                "processing_started_at",
                "last_error",
                "updated_at",
            ]
        )
        logger.info(
            "Outbox job already delivered job_id=%s action_record_id=%s",
            job.pk,
            job.action_record_id,
        )
        return "succeeded"

    group = job.group
    action_record = job.action_record
    kind = job.event_type

    # Resolve membership/participant from ActionRecord for recipient logic.
    membership = None
    group_only_participant = None
    if action_record.participant_kind == "member" and action_record.member_id:
        from groups.models import GroupMembership

        membership = (
            GroupMembership.objects.filter(
                group_id=group.pk,
                member_id=action_record.member_id,
            )
            .select_related("member")
            .first()
        )
    elif action_record.group_only_participant_id:
        group_only_participant = action_record.group_only_participant

    try:
        send_after_action_email(
            group=group,
            kind=kind,
            action_record=action_record,
            participant_name=job.participant_name_snapshot
            or action_record.participant_name_snapshot
            or "",
            membership=membership,
            group_only_participant=group_only_participant,
            timezone_name=job.timezone_name or None,
        )
    except EmailSenderProviderError as exc:
        return _handle_send_failure(job, exc, now=now)
    except Exception as exc:
        logger.exception(
            "Unexpected outbox send failure job_id=%s action_record_id=%s",
            job.pk,
            job.action_record_id,
        )
        wrapped = EmailSenderProviderError(
            "Could not send the email",
            diagnostic={
                "exception": type(exc).__name__,
                "code": None,
                "response": "",
            },
        )
        return _handle_send_failure(job, wrapped, now=now)

    # Inspect deliveries for this attempt: any FAILED without SENT for a
    # recipient means temporary/permanent classification from last failure.
    failed = GroupEmailDelivery.objects.filter(
        action_record_id=job.action_record_id,
        event_type=kind,
        status=GroupEmailDeliveryStatus.FAILED,
    ).order_by("-id")
    sent_exists = GroupEmailDelivery.objects.filter(
        action_record_id=job.action_record_id,
        event_type=kind,
        status=GroupEmailDeliveryStatus.SENT,
    ).exists()
    failed_exists = failed.exists()

    if failed_exists and not sent_exists:
        # All failed — use safest retry classification from summary text.
        latest = failed.first()
        public = (latest.error_summary if latest else "") or "Could not send the email"
        # Permanent phrasing from existing classifiers.
        permanent_markers = (
            "authentication failed",
            "smtp auth",
            "rejected the recipient",
            "refused this recipient",
            "rejected the sender",
            "owned by the authenticated",
            "email sender is not ready",
            "no participation email",
        )
        lowered = public.lower()
        retryable = not any(m in lowered for m in permanent_markers)
        pseudo = EmailSenderProviderError(
            public,
            diagnostic={"exception": "DeliveryFailed", "code": None, "response": public},
        )
        if not retryable:
            return _mark_terminal_failed(job, public, now=now)
        return _schedule_retry(job, public, now=now)

    if failed_exists and sent_exists:
        # Partial success: do not retry forever; mark succeeded if at least one
        # participant/forward sent. Remaining failures are audited.
        job.status = GroupEmailOutboxStatus.SUCCEEDED
        job.completed_at = now
        job.processing_started_at = None
        job.last_error = ""
        job.attempt_count = job.attempt_count + 1
        job.save(
            update_fields=[
                "status",
                "completed_at",
                "processing_started_at",
                "last_error",
                "attempt_count",
                "updated_at",
            ]
        )
        return "succeeded"

    job.status = GroupEmailOutboxStatus.SUCCEEDED
    job.completed_at = now
    job.processing_started_at = None
    job.last_error = ""
    job.attempt_count = job.attempt_count + 1
    job.save(
        update_fields=[
            "status",
            "completed_at",
            "processing_started_at",
            "last_error",
            "attempt_count",
            "updated_at",
        ]
    )
    logger.info(
        "Outbox job succeeded job_id=%s action_record_id=%s",
        job.pk,
        job.action_record_id,
    )
    return "succeeded"


def _handle_send_failure(job, exc: EmailSenderProviderError, *, now):
    public = (exc.public_message or "Could not send the email")[:255]
    if classify_smtp_failure_retryable(exc):
        return _schedule_retry(job, public, now=now)
    return _mark_terminal_failed(job, public, now=now)


def _schedule_retry(job, public_error, *, now):
    job.attempt_count = int(job.attempt_count or 0) + 1
    job.last_error = (public_error or "")[:255]
    job.processing_started_at = None
    if job.attempt_count >= job.max_attempts:
        return _mark_terminal_failed(job, public_error, now=now, increment=False)
    job.status = GroupEmailOutboxStatus.PENDING
    job.available_at = _next_available_at(attempt_count=job.attempt_count, now=now)
    job.save(
        update_fields=[
            "status",
            "attempt_count",
            "available_at",
            "processing_started_at",
            "last_error",
            "updated_at",
        ]
    )
    logger.warning(
        "Outbox job retry scheduled job_id=%s attempt=%s available_at=%s error=%s",
        job.pk,
        job.attempt_count,
        job.available_at.isoformat(),
        public_error,
    )
    return "retry_scheduled"


def _mark_terminal_failed(job, public_error, *, now, increment=True):
    if increment:
        job.attempt_count = int(job.attempt_count or 0) + 1
    job.status = GroupEmailOutboxStatus.FAILED
    job.completed_at = now
    job.processing_started_at = None
    job.last_error = (public_error or "")[:255]
    job.save(
        update_fields=[
            "status",
            "attempt_count",
            "completed_at",
            "processing_started_at",
            "last_error",
            "updated_at",
        ]
    )
    logger.error(
        "Outbox job terminal failure job_id=%s attempt=%s error=%s",
        job.pk,
        job.attempt_count,
        public_error,
    )
    return "failed"


def process_due_email_outbox(*, limit=10, now=None) -> dict:
    """Process up to ``limit`` due jobs. Safe for tests and --once mode."""
    now = now or timezone.now()
    claimed = claim_due_jobs(limit=limit, now=now)
    results = {"claimed": len(claimed), "succeeded": 0, "failed": 0, "retry_scheduled": 0}
    for job in claimed:
        outcome = process_outbox_job(job)
        if outcome in results:
            results[outcome] += 1
    return results
