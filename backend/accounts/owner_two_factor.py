"""
Customer-owner TOTP helpers.

These helpers reuse the trusted TOTP primitives from `accounts.two_factor`
but keep all state (models + session keys) logically separate from the
platform-admin 2FA implementation.
"""

from __future__ import annotations

import secrets
import hashlib
from datetime import timedelta

from django.db.utils import OperationalError, ProgrammingError
from django.utils import timezone

from accounts.two_factor import (
    MAX_FAILURES,
    LOCK_SECONDS,
    PENDING_TIMEOUT_SECONDS,
    RECOVERY_AUTH_TTL_SECONDS,
    TOTP_DIGITS,
    TOTP_INTERVAL,
    VALID_WINDOW,
    authenticator_label,
    build_totp,
    decrypt_totp_secret,
    encrypt_totp_secret,
    generate_recovery_codes,
    generate_totp_secret,
    hash_recovery_code,
    has_confirmed_platform_totp,  # noqa: F401 (imported for lint stability)
    lock_is_active,
    normalize_recovery_code,
    qr_png_data_uri,
    provisioning_uri,
    seconds_until,
    verify_totp_code,
)

from accounts.customer_two_factor_models import OwnerRecoveryCode, OwnerTOTPDevice


OWNER_2FA_PENDING_USER_KEY = "_owner_2fa_pending_user_id"
OWNER_2FA_PENDING_AT_KEY = "_owner_2fa_pending_at"


OWNER_AUTHENTICATION_BACKEND = "django.contrib.auth.backends.ModelBackend"


def has_confirmed_owner_totp(user) -> bool:
    if user is None or not getattr(user, "pk", None):
        return False
    try:
        return OwnerTOTPDevice.objects.filter(user=user, confirmed=True).exists()
    except (OperationalError, ProgrammingError):
        # Migration not applied yet: treat as disabled so login/account stay up.
        return False


def get_unconfirmed_device(user) -> OwnerTOTPDevice | None:
    if user is None or not getattr(user, "pk", None):
        return None
    return OwnerTOTPDevice.objects.filter(user=user, confirmed=False).first()


def get_or_create_unconfirmed_device(user, *, rotate: bool = False):
    """
    Create or rotate a pending (unconfirmed) owner authenticator device.
    """
    device = OwnerTOTPDevice.objects.filter(user=user).first()
    if device is not None and device.confirmed:
        # If already enabled, caller shouldn't be starting setup.
        return device, None

    if device is not None and not rotate:
        return device, decrypt_totp_secret(device.secret_encrypted)

    secret = generate_totp_secret()
    encrypted = encrypt_totp_secret(secret)
    if device is None:
        device = OwnerTOTPDevice.objects.create(
            user=user,
            secret_encrypted=encrypted,
            confirmed=False,
        )
    else:
        device.secret_encrypted = encrypted
        device.confirmed = False
        device.confirmed_at = None
        device.last_verified_timestep = None
        device.failed_attempts = 0
        device.locked_until = None
        device.last_used_at = None
        device.save(
            update_fields=[
                "secret_encrypted",
                "confirmed",
                "confirmed_at",
                "last_verified_timestep",
                "failed_attempts",
                "locked_until",
                "last_used_at",
            ]
        )
    return device, secret


def confirm_device(device: OwnerTOTPDevice, timestep: int) -> None:
    device.confirmed = True
    device.confirmed_at = timezone.now()
    device.failed_attempts = 0
    device.locked_until = None
    device.last_used_at = timezone.now()
    device.last_verified_timestep = int(timestep)
    device.save(
        update_fields=[
            "confirmed",
            "confirmed_at",
            "failed_attempts",
            "locked_until",
            "last_used_at",
            "last_verified_timestep",
        ]
    )


def register_failure_on_device(device: OwnerTOTPDevice):
    device.failed_attempts = (device.failed_attempts or 0) + 1
    if device.failed_attempts >= MAX_FAILURES:
        device.locked_until = timezone.now() + timedelta(seconds=LOCK_SECONDS)
        device.failed_attempts = 0
    device.save(update_fields=["failed_attempts", "locked_until"])
    return device.locked_until


def register_success_on_device(device: OwnerTOTPDevice, timestep: int | None = None):
    update = ["failed_attempts", "locked_until", "last_used_at"]
    device.failed_attempts = 0
    device.locked_until = None
    device.last_used_at = timezone.now()
    if timestep is not None:
        device.last_verified_timestep = int(timestep)
        update.append("last_verified_timestep")
    device.save(update_fields=update)


def replace_recovery_codes(user) -> list[str]:
    plaintext = generate_recovery_codes()
    OwnerRecoveryCode.objects.filter(user=user).delete()
    OwnerRecoveryCode.objects.bulk_create(
        [OwnerRecoveryCode(user=user, code_hash=hash_recovery_code(code)) for code in plaintext]
    )
    return plaintext


def unused_recovery_count(user) -> int:
    if user is None or not getattr(user, "pk", None):
        return 0
    return OwnerRecoveryCode.objects.filter(user=user, used_at__isnull=True).count()


def consume_recovery_code(user, submitted: str) -> bool:
    """
    Consume an unused recovery code; return True if accepted.

    This does not reveal *which* part was wrong; callers should emit a
    generic error message.
    """
    submitted_hash = hash_recovery_code(submitted)
    match = (
        OwnerRecoveryCode.objects.filter(user=user, used_at__isnull=True, code_hash=submitted_hash)
        .order_by("created_at")
        .first()
    )
    if match is None:
        return False
    match.used_at = timezone.now()
    match.save(update_fields=["used_at"])
    return True


def clear_owner_2fa_for_user(user) -> None:
    if user is None or not getattr(user, "pk", None):
        return
    OwnerRecoveryCode.objects.filter(user=user).delete()
    OwnerTOTPDevice.objects.filter(user=user).delete()


def begin_pending_owner_2fa(request, user) -> None:
    """
    Store pending owner 2FA state in the customer's session.

    IMPORTANT: this does not call `login()`; the customer is not considered
    authenticated until the TOTP/recovery challenge succeeds.
    """
    request.session.cycle_key()
    request.session[OWNER_2FA_PENDING_USER_KEY] = user.pk
    request.session[OWNER_2FA_PENDING_AT_KEY] = timezone.now().isoformat()
    request.session.save()


def _aware_session_timestamp(raw):
    if not raw:
        return None
    try:
        started_at = timezone.datetime.fromisoformat(raw)
    except (TypeError, ValueError):
        return None
    if timezone.is_naive(started_at):
        started_at = timezone.make_aware(started_at, timezone.get_current_timezone())
    return started_at


def pending_is_fresh(request) -> bool:
    started_at = _aware_session_timestamp(request.session.get(OWNER_2FA_PENDING_AT_KEY))
    if started_at is None:
        return False
    age = timezone.now() - started_at
    return age.total_seconds() <= PENDING_TIMEOUT_SECONDS


def load_pending_owner_user(request):
    from django.contrib.auth import get_user_model

    if not pending_is_fresh(request):
        return None
    pk = request.session.get(OWNER_2FA_PENDING_USER_KEY)
    if not pk:
        return None
    User = get_user_model()
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return None
    # Ensure owner account still qualifies as an owner in this slice.
    return user


def clear_pending_owner_2fa(request) -> None:
    for key in (OWNER_2FA_PENDING_USER_KEY, OWNER_2FA_PENDING_AT_KEY):
        request.session.pop(key, None)
    request.session.save()


def owner_provisioning_uri(email: str, secret: str) -> str:
    """
    Central wrapper for `accounts.two_factor.provisioning_uri`.

    Keeping this as a named helper makes Owner provisioning intent explicit.
    """
    return provisioning_uri(email, secret)


def owner_qr_data_uri_from_uri(uri: str) -> str:
    return qr_png_data_uri(uri)


def owner_setup_label(email: str) -> str:
    return authenticator_label(email)


def owner_build_totp(secret: str):
    return build_totp(secret)


def normalize_totp_code(raw: str) -> str:
    digits = "".join(ch for ch in str(raw or "") if ch.isdigit())
    return digits[:TOTP_DIGITS]


__all__ = [
    "OWNER_AUTHENTICATION_BACKEND",
    "OWNER_2FA_PENDING_AT_KEY",
    "OWNER_2FA_PENDING_USER_KEY",
    "begin_pending_owner_2fa",
    "clear_owner_2fa_for_user",
    "clear_pending_owner_2fa",
    "consume_recovery_code",
    "confirm_device",
    "get_unconfirmed_device",
    "get_or_create_unconfirmed_device",
    "has_confirmed_owner_totp",
    "load_pending_owner_user",
    "owner_build_totp",
    "owner_provisioning_uri",
    "owner_qr_data_uri_from_uri",
    "owner_setup_label",
    "pending_is_fresh",
    "register_failure_on_device",
    "register_success_on_device",
    "replace_recovery_codes",
    "unused_recovery_count",
    "normalize_recovery_code",
    "seconds_until",
    "lock_is_active",
    "verify_totp_code",
    "decrypt_totp_secret",
    "encrypt_totp_secret",
    "generate_totp_secret",
]

