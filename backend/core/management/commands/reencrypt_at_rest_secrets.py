"""
Re-encrypt Fernet-protected at-rest secrets onto new explicit target keys.

Decrypts with the currently effective APP / platform-2FA keys, then encrypts
with REENCRYPT_TARGET_* environment keys. Never prints secrets or keys.

Recovery-code HMAC digests cannot be re-keyed; use
--clear-unportable-recovery-codes on apply so stale hashes are removed and
must be regenerated after the target keys are adopted.
"""

from django.core.management.base import BaseCommand, CommandError

from core.reencrypt_at_rest import (
    TARGET_APP_ENV,
    TARGET_PLATFORM_ENV,
    ReencryptError,
    ensure_debug_or_explicit_source_keys,
    reencrypt_at_rest_secrets,
)


class Command(BaseCommand):
    help = (
        "Re-encrypt SMTP passwords and TOTP secrets onto new Fernet keys "
        "from REENCRYPT_TARGET_* env vars. Does not print secrets."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate decryptability and report counts without writing.",
        )
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Required to apply changes (ignored with --dry-run).",
        )
        parser.add_argument(
            "--clear-unportable-recovery-codes",
            action="store_true",
            help=(
                "After successful apply, delete owner/platform recovery-code "
                "hashes that cannot be re-keyed. TOTP devices are preserved."
            ),
        )

    def handle(self, *args, **options):
        dry_run = bool(options["dry_run"])
        if not dry_run and not options["yes"]:
            raise CommandError(
                "Refusing to apply without --yes. Use --dry-run first, then "
                "re-run with --yes (and optional --clear-unportable-recovery-codes)."
            )
        if dry_run and options["yes"]:
            self.stdout.write(
                self.style.WARNING("Ignoring --yes because --dry-run is set.")
            )

        try:
            ensure_debug_or_explicit_source_keys()
            report = reencrypt_at_rest_secrets(
                dry_run=dry_run,
                clear_unportable_recovery_codes=bool(
                    options["clear_unportable_recovery_codes"]
                ),
            )
        except ReencryptError as exc:
            raise CommandError(str(exc)) from exc

        for line in report.summary_lines():
            self.stdout.write(line)

        self.stdout.write("")
        self.stdout.write(
            "Target keys must be supplied via "
            f"{TARGET_APP_ENV} and {TARGET_PLATFORM_ENV} "
            "(values never printed)."
        )
        if report.owner_recovery_codes_unportable or report.platform_recovery_codes_unportable:
            self.stdout.write(
                self.style.WARNING(
                    "Recovery-code hashes are HMAC'd with the platform-2FA key "
                    "and cannot be converted without plaintext codes. After "
                    "adopting target keys, affected users must regenerate "
                    "recovery codes (TOTP secrets are preserved when "
                    "re-encrypted)."
                )
            )
            if dry_run and options["clear_unportable_recovery_codes"]:
                would = (
                    report.owner_recovery_codes_unportable
                    + report.platform_recovery_codes_unportable
                )
                self.stdout.write(
                    f"dry-run would clear recovery_code rows={would}"
                )

        if dry_run:
            self.stdout.write(self.style.SUCCESS("Dry-run completed; no rows written."))
        else:
            self.stdout.write(self.style.SUCCESS("Re-encryption applied."))
