"""TEST-ONLY: run Stripe Test Clock Scenario 6 against Sandbox keys.

Refuses Live keys and requires --i-understand-test-only.
"""

from django.core.management.base import BaseCommand, CommandError

from billing.testclock.scenario6 import report_as_text, run_scenario6


class Command(BaseCommand):
    help = (
        "TEST-ONLY Stripe Test Clock Scenario 6 "
        "(schedule Business→Plus downgrade, cancel, renew Business). "
        "Sandbox/sk_test only. Never deploy or run against Live."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--i-understand-test-only",
            action="store_true",
            dest="explicit_ack",
            help="Required ack that this is disposable Sandbox Test Clock work.",
        )

    def handle(self, *args, **options):
        if not options.get("explicit_ack"):
            raise CommandError(
                "Refusing to run. Pass --i-understand-test-only "
                "(Sandbox/Test Clock only; never Live)."
            )

        def log(message):
            self.stdout.write(str(message))

        try:
            report = run_scenario6(explicit_ack=True, log=log)
        except Exception as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write("")
        self.stdout.write("=== Scenario 6 report (JSON) ===")
        self.stdout.write(report_as_text(report))
        if report.get("scenario6_pass"):
            self.stdout.write(self.style.SUCCESS("Scenario 6 PASS"))
        else:
            raise CommandError("Scenario 6 FAIL — see JSON report above.")
