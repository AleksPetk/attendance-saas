"""TEST-ONLY: run Stripe Test Clock Scenario 4 against Sandbox keys.

Refuses Live keys and requires --i-understand-test-only.
"""

from django.core.management.base import BaseCommand, CommandError

from billing.testclock.scenario4 import report_as_text, run_scenario4


class Command(BaseCommand):
    help = (
        "TEST-ONLY Stripe Test Clock Scenario 4 "
        "(schedule Plus Yearly and let it execute at renewal). "
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
            report = run_scenario4(explicit_ack=True, log=log)
        except Exception as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write("")
        self.stdout.write("=== Scenario 4 report (JSON) ===")
        self.stdout.write(report_as_text(report))
        if report.get("scenario4_pass"):
            self.stdout.write(self.style.SUCCESS("Scenario 4 PASS"))
        else:
            raise CommandError("Scenario 4 FAIL — see JSON report above.")
