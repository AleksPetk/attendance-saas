from django.core.management.base import BaseCommand

from billing.builtin_trial import expire_due_builtin_trials


class Command(BaseCommand):
    help = (
        "Apply due built-in 7-day Business trial expirations. "
        "Does not call Stripe. Safe to run repeatedly."
    )

    def handle(self, *args, **options):
        result = expire_due_builtin_trials()
        self.stdout.write(
            self.style.SUCCESS(
                "Built-in trials: expired={expired} skipped={skipped}".format(**result)
            )
        )
