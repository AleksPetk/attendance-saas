"""
One-time re-encryption of Fernet-protected at-rest secrets.

Decrypts with the currently effective local keys (explicit env keys or
SECRET_KEY-derived DEBUG keys) and re-encrypts with explicit target Fernet
keys supplied only via environment variables.

Never logs plaintext secrets, ciphertext, or key material.

Irreversible recovery-code HMAC digests keyed by PLATFORM_2FA_ENCRYPTION_KEY
cannot be converted without plaintext codes; callers must invalidate /
regenerate them after switching keys.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
from dataclasses import dataclass, field

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction

logger = logging.getLogger("core.reencrypt_at_rest")

TARGET_APP_ENV = "REENCRYPT_TARGET_APP_SECRETS_ENCRYPTION_KEY"
TARGET_PLATFORM_ENV = "REENCRYPT_TARGET_PLATFORM_2FA_ENCRYPTION_KEY"


class ReencryptError(Exception):
    """Safe failure for re-encryption (message must never contain secrets)."""


@dataclass
class ReencryptReport:
    dry_run: bool
    smtp_passwords_seen: int = 0
    smtp_passwords_reencrypted: int = 0
    owner_totp_seen: int = 0
    owner_totp_reencrypted: int = 0
    owner_totp_legacy_platform_source: int = 0
    platform_totp_seen: int = 0
    platform_totp_reencrypted: int = 0
    owner_recovery_codes_unportable: int = 0
    platform_recovery_codes_unportable: int = 0
    owner_recovery_user_ids: list[int] = field(default_factory=list)
    platform_recovery_user_ids: list[int] = field(default_factory=list)
    recovery_codes_cleared: int = 0
    skipped_already_target: int = 0

    def summary_lines(self) -> list[str]:
        mode = "DRY-RUN" if self.dry_run else "APPLY"
        lines = [
            f"mode={mode}",
            (
                f"smtp_password_encrypted: seen={self.smtp_passwords_seen} "
                f"reencrypted={self.smtp_passwords_reencrypted}"
            ),
            (
                f"owner_totp secret_encrypted: seen={self.owner_totp_seen} "
                f"reencrypted={self.owner_totp_reencrypted} "
                f"legacy_platform_source={self.owner_totp_legacy_platform_source}"
            ),
            (
                f"platform_totp secret_encrypted: seen={self.platform_totp_seen} "
                f"reencrypted={self.platform_totp_reencrypted}"
            ),
            (
                f"owner_recovery_codes unportable={self.owner_recovery_codes_unportable} "
                f"user_ids={self.owner_recovery_user_ids}"
            ),
            (
                f"platform_recovery_codes unportable="
                f"{self.platform_recovery_codes_unportable} "
                f"user_ids={self.platform_recovery_user_ids}"
            ),
            f"recovery_codes_cleared={self.recovery_codes_cleared}",
            f"skipped_already_under_target_key={self.skipped_already_target}",
        ]
        return lines


def _require_fernet_key(raw: str, *, label: str) -> bytes:
    value = (raw or "").strip()
    if not value:
        raise ReencryptError(f"{label} is missing or empty.")
    key_bytes = value.encode("utf-8")
    try:
        Fernet(key_bytes)
    except Exception as exc:
        raise ReencryptError(f"{label} is not a valid Fernet key.") from exc
    return key_bytes


def generate_fernet_key() -> str:
    """Return a new url-safe Fernet key string (for operators / tests only)."""
    return Fernet.generate_key().decode("ascii")


def current_app_secrets_key_bytes() -> bytes:
    """Effective APP secrets Fernet key (explicit or SECRET_KEY-derived)."""
    from core.crypto import _fernet_key_bytes

    return _fernet_key_bytes()


def current_platform_2fa_key_bytes() -> bytes:
    """Effective platform-2FA Fernet key (explicit or SECRET_KEY-derived)."""
    from accounts.two_factor import _fernet_key_bytes

    return _fernet_key_bytes()


def target_keys_from_environ(environ=None) -> tuple[bytes, bytes]:
    env = environ if environ is not None else os.environ
    app = _require_fernet_key(env.get(TARGET_APP_ENV, ""), label=TARGET_APP_ENV)
    platform = _require_fernet_key(
        env.get(TARGET_PLATFORM_ENV, ""), label=TARGET_PLATFORM_ENV
    )
    return app, platform


def _reencrypt_token(
    ciphertext: str,
    *,
    sources: list[Fernet],
    target: Fernet,
    row_label: str,
) -> tuple[str, bool]:
    """
    Returns (new_ciphertext, changed).

    If ciphertext already decrypts with the target key, leave it unchanged.
    Tries each source Fernet in order until one decrypts.
    """
    payload = (ciphertext or "").strip()
    if not payload:
        raise ReencryptError(f"{row_label}: empty ciphertext.")

    encoded = payload.encode("ascii")
    try:
        target.decrypt(encoded)
        return payload, False
    except (InvalidToken, ValueError, TypeError):
        pass

    plaintext = None
    for source in sources:
        try:
            plaintext = source.decrypt(encoded)
            break
        except (InvalidToken, ValueError, TypeError):
            continue
    if plaintext is None:
        raise ReencryptError(
            f"{row_label}: cannot decrypt with any configured source key."
        )

    try:
        new_token = target.encrypt(plaintext).decode("ascii")
    finally:
        # Best-effort: drop local reference promptly (Python does not guarantee wipe).
        plaintext = b""

    return new_token, True


def inventory_unportable_recovery_codes() -> dict:
    """Counts and distinct user ids for recovery-code hashes (no hash values)."""
    from accounts.customer_two_factor_models import OwnerRecoveryCode
    from accounts.two_factor_models import PlatformRecoveryCode

    owner_ids = sorted(
        OwnerRecoveryCode.objects.values_list("user_id", flat=True).distinct()
    )
    platform_ids = sorted(
        PlatformRecoveryCode.objects.values_list("user_id", flat=True).distinct()
    )
    return {
        "owner_recovery_codes": OwnerRecoveryCode.objects.count(),
        "owner_recovery_user_ids": owner_ids,
        "platform_recovery_codes": PlatformRecoveryCode.objects.count(),
        "platform_recovery_user_ids": platform_ids,
    }


def reencrypt_at_rest_secrets(
    *,
    dry_run: bool = True,
    clear_unportable_recovery_codes: bool = False,
    target_app_key: bytes | None = None,
    target_platform_key: bytes | None = None,
    environ=None,
) -> ReencryptReport:
    """
    Re-encrypt reversible Fernet fields. Transactional on apply.

    Target keys must be supplied either as arguments or via:
      REENCRYPT_TARGET_APP_SECRETS_ENCRYPTION_KEY
      REENCRYPT_TARGET_PLATFORM_2FA_ENCRYPTION_KEY
    """
    from accounts.customer_two_factor_models import OwnerRecoveryCode, OwnerTOTPDevice
    from accounts.two_factor_models import PlatformRecoveryCode, PlatformTOTPDevice
    from groups.email_sender_models import GroupEmailSender

    if target_app_key is None or target_platform_key is None:
        env_app, env_platform = target_keys_from_environ(environ)
        target_app_key = target_app_key or env_app
        target_platform_key = target_platform_key or env_platform

    source_app = Fernet(current_app_secrets_key_bytes())
    source_platform = Fernet(current_platform_2fa_key_bytes())
    target_app = Fernet(target_app_key)
    target_platform = Fernet(target_platform_key)

    if target_app_key == current_app_secrets_key_bytes():
        raise ReencryptError(
            "Target APP secrets key matches the current effective key; "
            "refusing no-op re-encryption."
        )
    if target_platform_key == current_platform_2fa_key_bytes():
        raise ReencryptError(
            "Target platform-2FA key matches the current effective key; "
            "refusing no-op re-encryption."
        )

    report = ReencryptReport(dry_run=dry_run)
    recovery = inventory_unportable_recovery_codes()
    report.owner_recovery_codes_unportable = recovery["owner_recovery_codes"]
    report.owner_recovery_user_ids = recovery["owner_recovery_user_ids"]
    report.platform_recovery_codes_unportable = recovery["platform_recovery_codes"]
    report.platform_recovery_user_ids = recovery["platform_recovery_user_ids"]

    def _process():
        for sender in GroupEmailSender.objects.exclude(
            smtp_password_encrypted=""
        ).iterator():
            report.smtp_passwords_seen += 1
            new_value, changed = _reencrypt_token(
                sender.smtp_password_encrypted,
                sources=[source_app],
                target=target_app,
                row_label=f"GroupEmailSender id={sender.pk}",
            )
            if not changed:
                report.skipped_already_target += 1
                continue
            if not dry_run:
                sender.smtp_password_encrypted = new_value
                sender.save(update_fields=["smtp_password_encrypted"])
            report.smtp_passwords_reencrypted += 1

        # Owner TOTP: current code uses APP secrets. Some local rows were
        # historically encrypted with the platform-2FA key; accept either
        # source, always write target APP key so runtime matches core.crypto.
        for device in OwnerTOTPDevice.objects.exclude(secret_encrypted="").iterator():
            report.owner_totp_seen += 1
            payload = (device.secret_encrypted or "").strip()
            encoded = payload.encode("ascii")
            legacy_platform = False
            try:
                source_app.decrypt(encoded)
            except (InvalidToken, ValueError, TypeError):
                try:
                    source_platform.decrypt(encoded)
                    legacy_platform = True
                except (InvalidToken, ValueError, TypeError):
                    pass
            new_value, changed = _reencrypt_token(
                device.secret_encrypted,
                sources=[source_app, source_platform],
                target=target_app,
                row_label=f"OwnerTOTPDevice id={device.pk}",
            )
            if legacy_platform and changed:
                report.owner_totp_legacy_platform_source += 1
            if not changed:
                report.skipped_already_target += 1
                continue
            if not dry_run:
                device.secret_encrypted = new_value
                device.save(update_fields=["secret_encrypted"])
            report.owner_totp_reencrypted += 1

        for device in PlatformTOTPDevice.objects.exclude(
            secret_encrypted=""
        ).iterator():
            report.platform_totp_seen += 1
            new_value, changed = _reencrypt_token(
                device.secret_encrypted,
                sources=[source_platform],
                target=target_platform,
                row_label=f"PlatformTOTPDevice id={device.pk}",
            )
            if not changed:
                report.skipped_already_target += 1
                continue
            if not dry_run:
                device.secret_encrypted = new_value
                device.save(update_fields=["secret_encrypted"])
            report.platform_totp_reencrypted += 1

        if clear_unportable_recovery_codes and not dry_run:
            deleted_owner, _ = OwnerRecoveryCode.objects.all().delete()
            deleted_platform, _ = PlatformRecoveryCode.objects.all().delete()
            report.recovery_codes_cleared = int(deleted_owner) + int(deleted_platform)
            logger.info(
                "cleared_unportable_recovery_codes count=%s",
                report.recovery_codes_cleared,
            )

    if dry_run:
        # Still attempt full decrypt path inside a rolled-back transaction so
        # dry-run fails safely on undecryptable rows without writing.
        with transaction.atomic():
            _process()
            transaction.set_rollback(True)
    else:
        with transaction.atomic():
            _process()

    logger.info(
        "reencrypt_at_rest_secrets finished dry_run=%s smtp=%s owner_totp=%s "
        "platform_totp=%s recovery_cleared=%s",
        dry_run,
        report.smtp_passwords_reencrypted,
        report.owner_totp_reencrypted,
        report.platform_totp_reencrypted,
        report.recovery_codes_cleared,
    )
    return report


def assert_can_decrypt_with_key(ciphertext: str, key_bytes: bytes) -> bool:
    """Return True if ciphertext decrypts with key; never returns plaintext."""
    try:
        Fernet(key_bytes).decrypt(str(ciphertext).encode("ascii"))
        return True
    except (InvalidToken, ValueError, TypeError):
        return False


def derived_app_key_from_secret(secret_key: str) -> bytes:
    digest = hashlib.sha256(
        f"checkstation-app-secrets:{secret_key}".encode("utf-8")
    ).digest()
    return base64.urlsafe_b64encode(digest)


def derived_platform_key_from_secret(secret_key: str) -> bytes:
    digest = hashlib.sha256(
        f"checkstation-platform-2fa:{secret_key}".encode("utf-8")
    ).digest()
    return base64.urlsafe_b64encode(digest)


def ensure_debug_or_explicit_source_keys():
    """Guard: refuse accidental use when source keys cannot be resolved."""
    try:
        current_app_secrets_key_bytes()
        current_platform_2fa_key_bytes()
    except ImproperlyConfigured as exc:
        raise ReencryptError(str(exc)) from exc
    if not getattr(settings, "DEBUG", False):
        app = (getattr(settings, "APP_SECRETS_ENCRYPTION_KEY", "") or "").strip()
        plat = (getattr(settings, "PLATFORM_2FA_ENCRYPTION_KEY", "") or "").strip()
        if not app or not plat:
            raise ReencryptError(
                "Source encryption keys must be explicit when DEBUG is False."
            )
