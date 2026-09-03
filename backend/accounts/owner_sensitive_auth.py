"""Owner sensitive-action authentication helpers (password, 2FA, OAuth re-auth)."""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from rest_framework.response import Response

from accounts.customer_two_factor_models import OwnerTOTPDevice
from accounts.owner_auth_provider_models import OwnerAuthProvider
from accounts.owner_two_factor import (
    consume_recovery_code,
    has_confirmed_owner_totp,
    lock_is_active,
    normalize_recovery_code,
    register_failure_on_device,
    register_success_on_device,
    seconds_until,
    verify_totp_code,
)
from accounts.sign_in_methods import owner_linked_providers, owner_password_enabled
from accounts.owner_two_factor import decrypt_owner_totp_secret

OWNER_OAUTH_REAUTH_SESSION_KEY = "_owner_oauth_reauth"
OWNER_OAUTH_REAUTH_TTL_SECONDS = 600

GENERIC_TOTP_ERROR = "That authentication code was not valid."
GENERIC_RECOVERY_ERROR = "That recovery code was not valid."
PASSWORD_NOT_AVAILABLE_MESSAGE = (
    "Set a CheckStation password before performing this security-sensitive action."
)
REAUTH_REQUIRED_MESSAGE = "Recent sign-in confirmation is required."
OAUTH_REAUTH_REQUIRED_MESSAGE = (
    "Confirm your identity with a linked sign-in provider before continuing."
)
LAST_SIGN_IN_METHOD_MESSAGE = (
    "At least one sign-in method must remain on your account."
)


def password_not_available_response():
    return Response(
        {
            "detail": PASSWORD_NOT_AVAILABLE_MESSAGE,
            "code": "password_not_available",
            "current_password": PASSWORD_NOT_AVAILABLE_MESSAGE,
        },
        status=400,
    )


def last_sign_in_method_response():
    return Response(
        {
            "detail": LAST_SIGN_IN_METHOD_MESSAGE,
            "code": "last_sign_in_method",
        },
        status=400,
    )


def reauth_required_response(*, code: str = "reauth_required", detail: str = REAUTH_REQUIRED_MESSAGE):
    return Response({"detail": detail, "code": code}, status=400)


def record_owner_oauth_reauth(request, user, provider: str) -> None:
    request.session[OWNER_OAUTH_REAUTH_SESSION_KEY] = {
        "user_id": user.pk,
        "provider": provider,
        "verified_at": timezone.now().isoformat(),
    }
    request.session.modified = True


def clear_owner_oauth_reauth(request) -> None:
    request.session.pop(OWNER_OAUTH_REAUTH_SESSION_KEY, None)
    request.session.modified = True


def _parse_timestamp(raw: str | None):
    if not raw:
        return None
    try:
        parsed = timezone.datetime.fromisoformat(raw)
    except (TypeError, ValueError):
        return None
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def owner_oauth_reauth_is_fresh(
    request,
    user,
    *,
    provider: str | None = None,
    exclude_provider: str | None = None,
) -> bool:
    raw = request.session.get(OWNER_OAUTH_REAUTH_SESSION_KEY)
    if not isinstance(raw, dict):
        return False
    if raw.get("user_id") != user.pk:
        return False
    verified_at = _parse_timestamp(raw.get("verified_at"))
    if verified_at is None:
        return False
    if timezone.now() - verified_at > timedelta(seconds=OWNER_OAUTH_REAUTH_TTL_SECONDS):
        return False
    session_provider = str(raw.get("provider") or "")
    if provider is not None and session_provider != provider:
        return False
    if exclude_provider is not None and session_provider == exclude_provider:
        return False
    return bool(session_provider)


def _verify_owner_second_factor(user, *, code: str = "", recovery_code: str = "") -> tuple[bool, Response | None]:
    if not has_confirmed_owner_totp(user):
        return True, None

    device = OwnerTOTPDevice.objects.filter(user=user, confirmed=True).first()
    if device is None:
        return True, None

    if lock_is_active(device.locked_until):
        return False, Response(
            {
                "detail": f"Too many attempts. Try again in {seconds_until(device.locked_until)} seconds.",
                "code": "locked",
            },
            status=429,
        )

    if recovery_code:
        submitted = normalize_recovery_code(recovery_code)
        if not submitted or not consume_recovery_code(user, submitted):
            register_failure_on_device(device)
            return False, Response({"code": GENERIC_RECOVERY_ERROR}, status=400)
        register_success_on_device(device, timestep=None)
        return True, None

    secret = decrypt_owner_totp_secret(device.secret_encrypted)
    ok, timestep = verify_totp_code(secret, code, last_timestep=device.last_verified_timestep)
    if not ok:
        register_failure_on_device(device)
        return False, Response({"code": GENERIC_TOTP_ERROR}, status=400)
    register_success_on_device(device, timestep=timestep)
    return True, None


def validate_owner_password_reauth(user, current_password: str) -> Response | None:
    if not owner_password_enabled(user):
        return password_not_available_response()
    if not user.check_password(current_password or ""):
        return Response(
            {"current_password": "Current password is incorrect."},
            status=400,
        )
    return None


def validate_sensitive_owner_reauth(
    request,
    user,
    *,
    current_password: str = "",
    code: str = "",
    recovery_code: str = "",
    exclude_provider: str | None = None,
) -> Response | None:
    """
    Confirm a sensitive owner action.

    Password-enabled owners must supply current_password.
    OAuth-only owners must have a fresh OAuth re-auth from a linked provider
    other than `exclude_provider` when unlinking.
    Owner 2FA, when enabled, always requires TOTP or a recovery code.
    """
    if owner_password_enabled(user):
        password_error = validate_owner_password_reauth(user, current_password)
        if password_error is not None:
            return password_error
    else:
        links = owner_linked_providers(user)
        available_providers = [
            provider
            for provider in (OwnerAuthProvider.GOOGLE, OwnerAuthProvider.APPLE)
            if provider in links and provider != exclude_provider
        ]
        if not available_providers:
            return reauth_required_response(
                code="oauth_reauth_required",
                detail=OAUTH_REAUTH_REQUIRED_MESSAGE,
            )
        if not owner_oauth_reauth_is_fresh(
            request,
            user,
            exclude_provider=exclude_provider,
        ):
            return reauth_required_response(
                code="oauth_reauth_required",
                detail=OAUTH_REAUTH_REQUIRED_MESSAGE,
            )

    ok, second_factor_error = _verify_owner_second_factor(
        user,
        code=code,
        recovery_code=recovery_code,
    )
    if not ok:
        return second_factor_error
    return None


def validate_set_password_reauth(
    request,
    user,
    *,
    code: str = "",
    recovery_code: str = "",
) -> Response | None:
    if owner_password_enabled(user):
        return Response(
            {
                "detail": "A CheckStation password is already set. Use Change password instead.",
                "code": "password_already_set",
            },
            status=400,
        )

    if has_confirmed_owner_totp(user):
        ok, second_factor_error = _verify_owner_second_factor(
            user,
            code=code,
            recovery_code=recovery_code,
        )
        if not ok:
            return second_factor_error
        return None

    links = owner_linked_providers(user)
    if not links:
        return reauth_required_response(
            code="oauth_reauth_required",
            detail=OAUTH_REAUTH_REQUIRED_MESSAGE,
        )
    if not owner_oauth_reauth_is_fresh(request, user):
        return reauth_required_response(
            code="oauth_reauth_required",
            detail=OAUTH_REAUTH_REQUIRED_MESSAGE,
        )
    return None
