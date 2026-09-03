"""
Send payment-failure warning emails during the 3-day grace window.

Production scheduling (later infrastructure phase — do not configure cron here):
  Intended frequency: once daily (UTC), ideally shortly after midnight UTC
  or every few hours. Product rule is at most one warning email per UTC day
  per past_due subscription.

Idempotency:
  Claims the daily warning slot under select_for_update before sending so
  concurrent command runs cannot storm duplicate emails. Re-runs the same
  UTC day skip after last_payment_warning_at is set for that day.

If delayed:
  Grace finalization still runs via apply_due_billing_transitions on each
  pass. Missed warning days are not backfilled as a storm — at most one
  email is sent when the command next runs while still past_due.
"""

from django.core.management.base import BaseCommand

from billing.warnings import send_due_payment_warnings


class Command(BaseCommand):
    help = (
        "Send at most one payment-failure warning email per UTC day during "
        "the 3-day grace window. Also applies due grace finalization. "
        "Schedule once daily in deployment (no Celery in this phase)."
    )

    def handle(self, *args, **options):
        result = send_due_payment_warnings()
        self.stdout.write(
            f"Billing payment warnings sent={result['sent']} "
            f"skipped={result['skipped']} failed={result['failed']}"
        )
