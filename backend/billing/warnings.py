"""Send at most one payment-failure warning per UTC day during grace."""

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
        apply_due_billing_transitions(organization, now=moment)
        billing.refresh_from_db()
        if billing.status != BillingStatus.PAST_DUE:
            skipped += 1
            continue
        if _already_warned_today(billing, moment):
            skipped += 1
            continue
        owner = organization.owner
        try:
            send_payment_failure_warning(
                owner=owner,
                organization=organization,
                billing=billing,
            )
        except (EmailConfigurationError, EmailSendError):
            failed += 1
            continue
        record_payment_warning(organization, warned_at=moment, now=moment)
        sent += 1
    return {"sent": sent, "skipped": skipped, "failed": failed}
