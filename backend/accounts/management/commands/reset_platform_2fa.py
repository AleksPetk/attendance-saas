"""Break-glass reset of platform-operator TOTP and recovery codes."""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from accounts.sessions import invalidate_owner_sessions
from accounts.two_factor import clear_platform_2fa_for_user, is_platform_operator

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Remove TOTP and recovery codes for a platform operator so the next "
        "/admin/ login must complete mandatory 2FA setup. Does not print secrets."
    )

    def add_arguments(self, parser):
        parser.add_argument("email", help="Platform operator email address.")
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Confirm that 2FA should be reset. Required.",
        )

    def handle(self, *args, **options):
        email = User.objects.normalize_email(options["email"])
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist as exc:
            raise CommandError("No user with that email.") from exc
        if not is_platform_operator(user):
            raise CommandError(
                "Refusing to reset 2FA: that account is not a platform operator "
                "(is_staff / is_superuser)."
            )
        if not options["yes"]:
            raise CommandError(
                "This permanently removes the operator's authenticator and recovery "
                "codes. Re-run with --yes to confirm."
            )

        clear_platform_2fa_for_user(user)
        invalidate_owner_sessions(user)
        self.stdout.write(
            self.style.WARNING(
                f"Reset platform 2FA for {user.email}. The next /admin/ login "
                "must complete authenticator setup. Existing admin sessions "
                "for this account were signed out."
            )
        )
