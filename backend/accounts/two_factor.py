"""
Platform-operator TOTP helpers.

Customer owner and WorkspaceStaffAccount 2FA is intentionally out of scope.
Secrets, OTP values, and plaintext recovery codes must never be logged.
"""

import base64
import hashlib
import hmac
import io
import logging
import secrets
from datetime import timedelta

import pyotp
import qrcode
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core import checks
from django.utils import timezone

logger = logging.getLogger("accounts.two_factor")

ISSUER_NAME = "Check Station"
TOTP_DIGITS = 6
TOTP_INTERVAL = 30
VALID_WINDOW = 1
RECOVERY_CODE_COUNT = 10
PENDING_TIMEOUT_SECONDS = 10 * 60
RECOVERY_AUTH_TTL_SECONDS = 10 * 60
MAX_FAILURES = 5
LOCK_SECONDS = 30

PENDING_USER_KEY = "_platform_2fa_pending_user_id"
PENDING_BACKEND_KEY = "_platform_2fa_pending_backend"
PENDING_AT_KEY = "_platform_2fa_pending_at"
PENDING_NEXT_KEY = "_platform_2fa_next"
RECOVERY_ONCE_KEY = "_platform_2fa_recovery_codes_once"
COMPLETE_USER_KEY = "_platform_2fa_complete_user_id"
SETUP_FAILURES_KEY = "_platform_2fa_setup_failures"
SETUP_LOCKED_KEY = "_platform_2fa_setup_locked_until"
RECOVERY_AUTH_USER_KEY = "_platform_2fa_recovery_auth_user_id"
RECOVERY_AUTH_AT_KEY = "_platform_2fa_recovery_auth_at"

OWNER_AUTHENTICATION_BACKEND = "django.contrib.auth.backends.ModelBackend"


def is_platform_operator(user):
    if user is None or not getattr(user, "pk", None):
        return False
    return bool(getattr(user, "is_staff", False) or getattr(user, "is_superuser", False))


def is_allowed_pre_2fa_admin_path(path):
    path = path or ""
    if path in {"/admin/login", "/admin/login/", "/admin/logout", "/admin/logout/"}:
        return True
    return path.startswith("/admin/two-factor/")


def _fernet_key_bytes():
    raw = (getattr(settings, "PLATFORM_2FA_ENCRYPTION_KEY", "") or "").strip()
    if raw:
        return raw.encode("utf-8")
    digest = hashlib.sha256(
        f"checkstation-platform-2fa:{settings.SECRET_KEY}".encode("utf-8")
    ).digest()
    return base64.urlsafe_b64encode(digest)


def get_fernet():
    return Fernet(_fernet_key_bytes())


def encrypt_totp_secret(secret):
    token = get_fernet().encrypt(secret.encode("utf-8"))
    return token.decode("ascii")


def decrypt_totp_secret(payload):
    try:
        return get_fernet().decrypt(payload.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError):
        logger.error("Could not decrypt a platform TOTP secret.")
        raise


def generate_totp_secret():
    return pyotp.random_base32()


def build_totp(secret):
    return pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_INTERVAL)


def provisioning_uri(email, secret):
    totp = build_totp(secret)
    return totp.provisioning_uri(name=email, issuer_name=ISSUER_NAME)


def authenticator_label(email):
    return f"{ISSUER_NAME}:{email}"


def qr_png_data_uri(payload):
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=2,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def normalize_totp_code(raw):
    digits = "".join(ch for ch in str(raw or "") if ch.isdigit())
    return digits[:TOTP_DIGITS]


def current_timestep():
    return int(timezone.now().timestamp()) // TOTP_INTERVAL


def verify_totp_code(secret, code, *, last_timestep=None):
    normalized = normalize_totp_code(code)
    if len(normalized) != TOTP_DIGITS:
        return False, last_timestep
    totp = build_totp(secret)
    matching_timestep = None
    now_step = current_timestep()
    for offset in range(-VALID_WINDOW, VALID_WINDOW + 1):
        step = now_step + offset
        if last_timestep is not None and step == last_timestep:
            continue
        # pyotp.TOTP.at() takes a unix timestamp or datetime, not a timestep.
        if secrets.compare_digest(totp.at(step * TOTP_INTERVAL), normalized):
            matching_timestep = step
            break
    if matching_timestep is None:
        return False, last_timestep
    return True, matching_timestep


def normalize_recovery_code(raw):
    return "".join(ch for ch in str(raw or "").upper() if ch.isalnum())


def generate_recovery_codes(count=RECOVERY_CODE_COUNT):
    codes = []
    for _ in range(count):
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        raw = "".join(secrets.choice(alphabet) for _ in range(8))
        codes.append(f"{raw[:4]}-{raw[4:]}")
    return codes


def hash_recovery_code(code):
    normalized = normalize_recovery_code(code)
    return hmac.new(
        _fernet_key_bytes(),
        normalized.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def unused_recovery_count(user):
    from accounts.two_factor_models import PlatformRecoveryCode

    if user is None or not getattr(user, "pk", None):
        return 0
    return PlatformRecoveryCode.objects.filter(user=user, used_at__isnull=True).count()


def replace_recovery_codes(user, codes=None):
    from accounts.two_factor_models import PlatformRecoveryCode

    plaintext = codes or generate_recovery_codes()
    PlatformRecoveryCode.objects.filter(user=user).delete()
    PlatformRecoveryCode.objects.bulk_create(
        [
            PlatformRecoveryCode(user=user, code_hash=hash_recovery_code(code))
            for code in plaintext
        ]
    )
    return plaintext


def consume_recovery_code(user, submitted):
    from accounts.two_factor_models import PlatformRecoveryCode

    submitted_hash = hash_recovery_code(submitted)
    unused = list(
        PlatformRecoveryCode.objects.filter(user=user, used_at__isnull=True)
    )
    match = None
    for row in unused:
        if secrets.compare_digest(row.code_hash, submitted_hash):
            match = row
            break
    if match is None:
        return False
    match.used_at = timezone.now()
    match.save(update_fields=["used_at"])
    remaining = unused_recovery_count(user)
    logger.info(
        "platform_2fa_recovery_code_used user_id=%s remaining=%s",
        user.pk,
        remaining,
    )
    return True


def has_confirmed_platform_totp(user):
    from accounts.two_factor_models import PlatformTOTPDevice

    if user is None or not getattr(user, "pk", None):
        return False
    return PlatformTOTPDevice.objects.filter(user=user, confirmed=True).exists()


def get_device(user):
    from accounts.two_factor_models import PlatformTOTPDevice

    if user is None or not getattr(user, "pk", None):
        return None
    return PlatformTOTPDevice.objects.filter(user=user).first()


def lock_is_active(locked_until):
    return bool(locked_until and locked_until > timezone.now())


def seconds_until(locked_until):
    if not lock_is_active(locked_until):
        return 0
    return max(1, int((locked_until - timezone.now()).total_seconds()))


def register_failure_on_device(device):
    device.failed_attempts = (device.failed_attempts or 0) + 1
    if device.failed_attempts >= MAX_FAILURES:
        device.locked_until = timezone.now() + timedelta(seconds=LOCK_SECONDS)
        device.failed_attempts = 0
    device.save(update_fields=["failed_attempts", "locked_until"])
    return device.locked_until


def register_success_on_device(device, timestep=None):
    update = ["failed_attempts", "locked_until", "last_used_at"]
    device.failed_attempts = 0
    device.locked_until = None
    device.last_used_at = timezone.now()
    if timestep is not None:
        device.last_verified_timestep = timestep
        update.append("last_verified_timestep")
    device.save(update_fields=update)


def clear_platform_2fa_for_user(user):
    from accounts.two_factor_models import PlatformRecoveryCode, PlatformTOTPDevice

    PlatformRecoveryCode.objects.filter(user=user).delete()
    PlatformTOTPDevice.objects.filter(user=user).delete()
    logger.info("platform_2fa_reset user_id=%s", user.pk)


def safe_admin_next_url(url):
    candidate = (url or "").strip()
    if not candidate.startswith("/admin"):
        return "/admin/"
    if candidate.startswith("//") or "://" in candidate or "\\" in candidate:
        return "/admin/"
    return candidate


def begin_pending_platform_2fa(request, user, *, next_url="/admin/"):
    request.session.cycle_key()
    request.session[PENDING_USER_KEY] = user.pk
    request.session[PENDING_BACKEND_KEY] = (
        getattr(user, "backend", None) or OWNER_AUTHENTICATION_BACKEND
    )
    request.session[PENDING_AT_KEY] = timezone.now().isoformat()
    request.session[PENDING_NEXT_KEY] = safe_admin_next_url(next_url)
    request.session.pop(RECOVERY_ONCE_KEY, None)
    request.session.pop(COMPLETE_USER_KEY, None)
    request.session.pop(SETUP_FAILURES_KEY, None)
    request.session.pop(SETUP_LOCKED_KEY, None)
    request.session.pop(RECOVERY_AUTH_USER_KEY, None)
    request.session.pop(RECOVERY_AUTH_AT_KEY, None)
    request.session.save()


def pending_user_id(request):
    return request.session.get(PENDING_USER_KEY)


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


def pending_is_fresh(request):
    started_at = _aware_session_timestamp(request.session.get(PENDING_AT_KEY))
    if started_at is None:
        return False
    age = timezone.now() - started_at
    return age.total_seconds() <= PENDING_TIMEOUT_SECONDS


def clear_pending_platform_2fa(request):
    for key in (
        PENDING_USER_KEY,
        PENDING_BACKEND_KEY,
        PENDING_AT_KEY,
        PENDING_NEXT_KEY,
        RECOVERY_ONCE_KEY,
        SETUP_FAILURES_KEY,
        SETUP_LOCKED_KEY,
    ):
        request.session.pop(key, None)


def mark_platform_2fa_complete(request, user):
    request.session[COMPLETE_USER_KEY] = user.pk
    clear_pending_platform_2fa(request)
    request.session[COMPLETE_USER_KEY] = user.pk
    request.session.save()


def session_has_completed_2fa(request, user):
    return request.session.get(COMPLETE_USER_KEY) == getattr(user, "pk", None)


def admin_session_is_grandfathered(request, user):
    """
    Pre-2FA deployments and test force_login leave a fully authenticated
    admin session without COMPLETE_USER_KEY. That session may continue
    until logout. The next password login uses pending state instead.
    """
    if not user or not user.is_authenticated:
        return False
    if not is_platform_operator(user):
        return False
    if session_has_completed_2fa(request, user):
        return False
    if pending_user_id(request):
        return False
    return True


def load_pending_user(request):
    from django.contrib.auth import get_user_model

    if not pending_is_fresh(request):
        return None
    pk = pending_user_id(request)
    if not pk:
        return None
    User = get_user_model()
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return None
    if not is_platform_operator(user) or not user.is_active:
        return None
    return user


def pending_next_url(request):
    return safe_admin_next_url(request.session.get(PENDING_NEXT_KEY))


def get_or_create_unconfirmed_device(user, *, rotate=False):
    from accounts.two_factor_models import PlatformTOTPDevice

    device = PlatformTOTPDevice.objects.filter(user=user).first()
    if device is not None and device.confirmed:
        return device, decrypt_totp_secret(device.secret_encrypted)
    if device is not None and not rotate:
        return device, decrypt_totp_secret(device.secret_encrypted)

    secret = generate_totp_secret()
    encrypted = encrypt_totp_secret(secret)
    if device is None:
        device = PlatformTOTPDevice.objects.create(
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
        device.save(
            update_fields=[
                "secret_encrypted",
                "confirmed",
                "confirmed_at",
                "last_verified_timestep",
                "failed_attempts",
                "locked_until",
            ]
        )
    return device, secret


def confirm_unconfirmed_device(device, timestep):
    device.confirmed = True
    device.confirmed_at = timezone.now()
    device.failed_attempts = 0
    device.locked_until = None
    device.last_used_at = timezone.now()
    device.last_verified_timestep = timestep
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
    logger.info("platform_2fa_setup_completed user_id=%s", device.user_id)


def complete_platform_admin_authentication(
    request, user, *, recovery_authenticated=False
):
    from django.contrib.auth import login

    backend = (
        request.session.get(PENDING_BACKEND_KEY)
        or getattr(user, "backend", None)
        or OWNER_AUTHENTICATION_BACKEND
    )
    login(request, user, backend=backend)
    mark_platform_2fa_complete(request, user)
    if recovery_authenticated:
        mark_recovery_authentication(request, user)
    remaining = unused_recovery_count(user)
    logger.info(
        "platform_2fa_login_completed user_id=%s recovery_codes_remaining=%s "
        "recovery_authenticated=%s",
        user.pk,
        remaining,
        recovery_authenticated,
    )
    return remaining


def mark_recovery_authentication(request, user):
    """
    Record that this admin session proved a recovery code.

    Stores only the user id and timestamp. The code itself is never stored.
    """
    request.session[RECOVERY_AUTH_USER_KEY] = user.pk
    request.session[RECOVERY_AUTH_AT_KEY] = timezone.now().isoformat()
    request.session.save()
    logger.info("platform_2fa_recovery_auth_granted user_id=%s", user.pk)


def clear_recovery_authentication(request):
    request.session.pop(RECOVERY_AUTH_USER_KEY, None)
    request.session.pop(RECOVERY_AUTH_AT_KEY, None)
    request.session.save()


def recovery_auth_age_seconds(request):
    started_at = _aware_session_timestamp(request.session.get(RECOVERY_AUTH_AT_KEY))
    if started_at is None:
        return None
    return (timezone.now() - started_at).total_seconds()


def has_recent_recovery_authentication(request, user):
    if user is None or not getattr(user, "pk", None):
        return False
    if str(request.session.get(RECOVERY_AUTH_USER_KEY)) != str(user.pk):
        return False
    age = recovery_auth_age_seconds(request)
    if age is None or age > RECOVERY_AUTH_TTL_SECONDS:
        return False
    return True


def recovery_auth_seconds_remaining(request, user):
    if not has_recent_recovery_authentication(request, user):
        return 0
    age = recovery_auth_age_seconds(request) or 0
    return max(1, int(RECOVERY_AUTH_TTL_SECONDS - age))


def replacement_in_progress(user):
    device = get_device(user)
    return bool(device is not None and not device.confirmed)


def start_authenticator_replacement(user):
    """
    Revoke the current TOTP secret immediately and start enrollment of a new one.

    Old recovery codes stay valid until the new authenticator is verified, so a
    dropped enrollment can still be recovered with another unused recovery code.
    """
    from accounts.two_factor_models import PlatformTOTPDevice

    secret = generate_totp_secret()
    encrypted = encrypt_totp_secret(secret)
    device = PlatformTOTPDevice.objects.filter(user=user).first()
    if device is None:
        device = PlatformTOTPDevice.objects.create(
            user=user,
            secret_encrypted=encrypted,
            confirmed=False,
        )
    else:
        device.secret_encrypted = encrypted
        device.confirmed = False
        device.confirmed_at = None
        device.last_used_at = None
        device.last_verified_timestep = None
        device.failed_attempts = 0
        device.locked_until = None
        device.save(
            update_fields=[
                "secret_encrypted",
                "confirmed",
                "confirmed_at",
                "last_used_at",
                "last_verified_timestep",
                "failed_attempts",
                "locked_until",
            ]
        )
    logger.info("platform_2fa_authenticator_replacement_started user_id=%s", user.pk)
    return device, secret


def complete_authenticator_replacement(request, user, device, timestep):
    confirm_unconfirmed_device(device, timestep)
    codes = replace_recovery_codes(user)
    store_plaintext_recovery_codes(request, codes)
    clear_recovery_authentication(request)
    logger.info("platform_2fa_authenticator_replaced user_id=%s", user.pk)
    return codes


def store_plaintext_recovery_codes(request, codes):
    request.session[RECOVERY_ONCE_KEY] = list(codes)
    request.session.save()


def pop_plaintext_recovery_codes(request):
    codes = request.session.pop(RECOVERY_ONCE_KEY, None) or []
    request.session.save()
    return codes


def plaintext_recovery_codes(request):
    return list(request.session.get(RECOVERY_ONCE_KEY) or [])


def operator_may_use_admin(request, user):
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    if not is_platform_operator(user) or not user.is_active:
        return False
    return session_has_completed_2fa(request, user) or admin_session_is_grandfathered(
        request, user
    )


def check_platform_2fa_encryption_key(app_configs, **kwargs):
    import sys

    raw = (getattr(settings, "PLATFORM_2FA_ENCRYPTION_KEY", "") or "").strip()
    if raw:
        try:
            Fernet(raw.encode("utf-8"))
        except (ValueError, TypeError):
            return [
                checks.Error(
                    "PLATFORM_2FA_ENCRYPTION_KEY is not a valid Fernet key.",
                    id="accounts.E002",
                )
            ]
        return []
    if getattr(settings, "DEBUG", False) or "test" in sys.argv:
        return []
    return [
        checks.Warning(
            "PLATFORM_2FA_ENCRYPTION_KEY is unset; TOTP secrets are "
            "encrypted with a key derived from SECRET_KEY. Set a dedicated "
            "Fernet key before production.",
            id="accounts.W002",
        )
    ]
