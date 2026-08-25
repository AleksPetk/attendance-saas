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
