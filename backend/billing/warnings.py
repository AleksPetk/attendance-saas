"""Send at most one payment-failure warning per UTC day during grace."""

from django.db import transaction
from django.utils import timezone

from billing.emails import send_payment_failure_warning
from billing.models import BillingStatus, WorkspaceSubscription
from billing.services import apply_due_billing_transitions, record_payment_warning
from core.mail import EmailConfigurationError, EmailSendError


def _already_warned_today(billing, now):
    last = billing.last_payment_warning_at
    if last is None:
        return False
    return last.date() == now.date()


def send_due_payment_warnings(*, now=None):
    moment = now or timezone.now()
    rows = WorkspaceSubscription.objects.select_related(
        "organization", "organization__owner"
    ).filter(status=BillingStatus.PAST_DUE)
    sent = 0
    skipped = 0
    failed = 0
    for billing in rows:
        organization = billing.organization
        if organization is None:
            skipped += 1
            continue
        if organization.is_checkstation_account:
            skipped += 1
            continue
        from organizations.models import OrganizationStatus

        if organization.status != OrganizationStatus.ACTIVE:
            skipped += 1
            continue
        apply_due_billing_transitions(organization, now=moment)
        billing.refresh_from_db()
        if billing.status != BillingStatus.PAST_DUE:
            skipped += 1
            continue

        claimed = False
        with transaction.atomic():
            locked = (
                WorkspaceSubscription.objects.select_for_update()
                .filter(pk=billing.pk, status=BillingStatus.PAST_DUE)
                .first()
            )
            if locked is None:
                skipped += 1
                continue
            if _already_warned_today(locked, moment):
                skipped += 1
                continue
            # Claim today's warning slot before send to prevent concurrent duplicates.
            record_payment_warning(organization, warned_at=moment, now=moment)
            claimed = True

        if not claimed:
            continue

        owner = organization.owner
        try:
            send_payment_failure_warning(
                owner=owner,
                organization=organization,
                billing=billing,
                language=getattr(owner, "preferred_language", None),
            )
        except (EmailConfigurationError, EmailSendError):
            failed += 1
            continue
        sent += 1
    return {"sent": sent, "skipped": skipped, "failed": failed}
