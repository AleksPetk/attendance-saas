"""Create a local Business max-capacity workspace for plan-downgrade testing."""

from django.core.management.base import BaseCommand, CommandError

from organizations.plan_test_workspace import (
    OWNER_EMAIL,
    OWNER_PASSWORD,
    create_plan_test_workspace,
    destroy_existing_plan_test_workspace,
    find_existing_owner,
)


class Command(BaseCommand):
    help = (
        "Create (or rebuild) a local-only Business max-capacity customer "
        "workspace for manual plan downgrade testing. Owner: cursor@gmail.com."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help=(
                "Permanently delete the existing cursor@gmail.com workspace "
                "and rebuild it from scratch."
            ),
        )

    def handle(self, *args, **options):
        existing = find_existing_owner()
        if existing is not None and not options["reset"]:
            raise CommandError(
                f"Owner {OWNER_EMAIL} already exists "
                f"(workspace attached). Re-run with --reset to rebuild safely."
            )

        if options["reset"]:
            deleted = destroy_existing_plan_test_workspace()
            if deleted:
                self.stdout.write(
                    self.style.WARNING(
                        f"Deleted existing {OWNER_EMAIL} workspace."
                    )
                )
            else:
                self.stdout.write("No existing plan-test workspace to delete.")

        def log(message):
            self.stdout.write(str(message))

        try:
            summary = create_plan_test_workspace(log=log)
        except Exception as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=== Plan test workspace ready ==="))
        self.stdout.write(f"Workspace ID: {summary.workspace_id}")
        self.stdout.write(f"Plan: {summary.plan}")
        self.stdout.write(f"Owner email: {summary.owner_email}")
        self.stdout.write(f"Owner password: {OWNER_PASSWORD}")
        self.stdout.write(
            "Admins: admin1–admin5 / emails adminN@cursor.test / "
            f"password {OWNER_PASSWORD}"
        )
        self.stdout.write(
            f"Staff: staff1–staff25 / password {OWNER_PASSWORD}"
        )
        self.stdout.write("Staff login path: /staff-login")
        self.stdout.write(
            "Counts: "
            f"standard={summary.active_standard_groups}, "
            f"structured={summary.active_structured_groups}, "
            f"archived={summary.archived_groups}, "
            f"members={summary.members}, "
            f"admins={summary.admins}, "
            f"staff={summary.staff}, "
            f"classes={summary.classes}"
        )
        self.stdout.write(
            "Max reached: "
            f"standard_participants={summary.max_standard_participants}, "
            f"structured_classes={summary.max_structured_classes}, "
            f"class_participants={summary.max_class_participants}"
        )
        self.stdout.write(
            f"Staff Group access: {summary.staff_assignment_pattern}"
        )
        self.stdout.write("")
        self.stdout.write(
            "Rebuild later: "
            "python manage.py create_plan_test_workspace --reset"
        )
        self.stdout.write(
            "Leave plan=Business. Downgrade manually via platform admin."
        )
