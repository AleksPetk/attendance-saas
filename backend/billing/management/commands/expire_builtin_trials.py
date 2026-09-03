"""
Expire due built-in Business trials.

Production scheduling (later infrastructure phase — do not configure cron here):
  Intended frequency: every 5–15 minutes (or at least hourly).
  Lazy expiry on workspace/billing reads already self-heals; this command
  catches workspaces that are idle past ends_at.

Idempotency:
  Each trial is locked with select_for_update. Once expired_at is set,
  re-runs skip it. Safe to run overlapping processes; concurrent workers
  will not double-apply entitlement transitions for the same org.

If delayed:
  Entitlements remain Business until expiry runs (lazy or command). Paid
  Stripe access is independent. No emails are sent by this command.
"""

from django.core.management.base import BaseCommand

from billing.builtin_trial import expire_due_builtin_trials


class Command(BaseCommand):
    help = (
        "Apply due built-in Business trial expirations. "
        "Does not call Stripe. Safe to run repeatedly / concurrently."
    )

    def handle(self, *args, **options):
        result = expire_due_builtin_trials()
        self.stdout.write(
            self.style.SUCCESS(
                "Built-in trials: expired={expired} skipped={skipped}".format(**result)
            )
        )
