"""
Customer-owner TOTP 2FA API views.

These endpoints implement:
- setup start (password -> pending secret + QR)
- setup verify (authenticator code -> enable + recovery codes)
- login challenge (password already checked -> TOTP or recovery code)
- regenerate recovery codes (password + second factor)
- disable 2FA (password + second factor)
"""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.customer_two_factor_models import OwnerRecoveryCode, OwnerTOTPDevice
from accounts.exceptions import EmailNotVerified
from accounts.owner_authentication import establish_owner_session
from accounts.owner_two_factor import (
    clear_owner_2fa_for_user,
    clear_pending_owner_2fa,
    confirm_device,
    consume_recovery_code,
    decrypt_totp_secret,
    encrypt_totp_secret,
    get_or_create_unconfirmed_device,
    get_unconfirmed_device,
    has_confirmed_owner_totp,
    load_pending_owner_user,
    lock_is_active,
    normalize_recovery_code,
    owner_build_totp,
    owner_provisioning_uri,
    owner_qr_data_uri_from_uri,
    owner_setup_label,
    pending_is_fresh,
    register_failure_on_device,
    register_success_on_device,
    replace_recovery_codes,
    seconds_until,
    verify_totp_code,
    owner_setup_label,
)

from accounts.owner_sensitive_auth import password_not_available_response
from accounts.sign_in_methods import owner_password_enabled
from accounts.verification import customer_must_verify_email

logger = logging.getLogger("accounts.owner_2fa")
User = get_user_model()


GENERIC_TOTP_ERROR = "That authentication code was not valid."
GENERIC_RECOVERY_ERROR = "That recovery code was not valid."
LOCKED_ERROR = "Too many attempts. Try again in {seconds} seconds."


def _require_owner(actor):
    # Customer owner accounts use accounts.User and are not staff/superuser.
    if actor is None or not isinstance(actor, User):
        return Response({"detail": "Only the paying workspace owner can manage two-factor authentication."}, status=403)
    if not getattr(actor, "is_active", False):
        return Response({"detail": "This account is inactive."}, status=403)
    if getattr(actor, "is_staff", False) or getattr(actor, "is_superuser", False):
        # Keep customer owner 2FA isolated from platform operators.
        return Response({"detail": "Platform operator accounts cannot use customer two-factor authentication."}, status=403)
    return None


def _active_owner_workspace(user):
    from accounts.owner_authentication import get_active_owner_organization

    return get_active_owner_organization(user)


class OwnerTOTPSetupStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = request.user
        denied = _require_owner(actor)
        if denied is not None:
            return denied
        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        current_password = request.data.get("current_password") or ""
        if not owner_password_enabled(actor):
            return password_not_available_response()
        if not actor.check_password(current_password):
            return Response({"current_password": "Current password is incorrect."}, status=400)

        # If already enabled, disallow re-enrollment through this flow.
        if has_confirmed_owner_totp(actor):
            return Response({"detail": "Two-factor authentication is already enabled."}, status=400)

        # Rotate pending secret on every start attempt.
        device, plaintext_secret = get_or_create_unconfirmed_device(actor, rotate=True)
        if plaintext_secret is None:
            # Safety: should never happen because we checked confirmed state above.
            return Response({"detail": "Two-factor setup is already in progress."}, status=400)

        uri = owner_provisioning_uri(actor.email, plaintext_secret)
        qr_data_uri = owner_qr_data_uri_from_uri(uri)

        return Response(
            {
                "two_factor_status": "pending",
                "issuer": "Check Station",
                "label": owner_setup_label(actor.email),
                "setup_key": plaintext_secret,
                "qr_data_uri": qr_data_uri,
            }
        )


class OwnerTOTPSetupVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = request.user
        denied = _require_owner(actor)
        if denied is not None:
            return denied
        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        code = request.data.get("code") or ""
        device = get_unconfirmed_device(actor)
        if device is None:
            return Response({"detail": "No two-factor setup is in progress."}, status=400)

        if lock_is_active(device.locked_until):
            return Response(
                {"detail": LOCKED_ERROR.format(seconds=seconds_until(device.locked_until))},
                status=429,
            )

        secret = decrypt_totp_secret(device.secret_encrypted)
        ok, timestep = verify_totp_code(
            secret, code, last_timestep=device.last_verified_timestep
        )
        if not ok:
            register_failure_on_device(device)
            if lock_is_active(device.locked_until):
                return Response(
                    {"detail": LOCKED_ERROR.format(seconds=seconds_until(device.locked_until))},
                    status=429,
                )
            return Response({"code": GENERIC_TOTP_ERROR}, status=400)

        confirm_device(device, timestep)
        codes = replace_recovery_codes(actor)
        logger.info("owner_2fa_enabled user_id=%s recovery_codes_count=%s", actor.pk, len(codes))
        return Response({"two_factor_status": "enabled", "recovery_codes": codes})


class OwnerTOTPLoginChallengeView(APIView):
    """
    Second-step login for enabled customer owners.

    This endpoint is intentionally unauthenticated: it consumes the
    pending-owner session state created by `OwnerLoginView`.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        pending_user = load_pending_owner_user(request)
        if pending_user is None or not has_confirmed_owner_totp(pending_user):
            clear_pending_owner_2fa(request)
            return Response(
                {"detail": "Authentication failed."},
                status=401,
            )

        device = OwnerTOTPDevice.objects.filter(user=pending_user, confirmed=True).first()
        if device is None:
            clear_pending_owner_2fa(request)
            return Response({"detail": "Authentication failed."}, status=401)

        if lock_is_active(device.locked_until):
            return Response(
                {"detail": LOCKED_ERROR.format(seconds=seconds_until(device.locked_until))},
                status=429,
            )

        totp_code = request.data.get("code") or ""
        recovery_code = request.data.get("recovery_code") or ""

        if recovery_code:
            submitted = normalize_recovery_code(recovery_code)
            if not submitted:
                register_failure_on_device(device)
                if lock_is_active(device.locked_until):
                    return Response(
                        {"detail": LOCKED_ERROR.format(seconds=seconds_until(device.locked_until))},
                        status=429,
                    )
                return Response({"code": GENERIC_RECOVERY_ERROR}, status=400)

            ok = consume_recovery_code(pending_user, submitted)
            if not ok:
                register_failure_on_device(device)
                if lock_is_active(device.locked_until):
                    return Response(
                        {"detail": LOCKED_ERROR.format(seconds=seconds_until(device.locked_until))},
                        status=429,
                    )
                return Response({"code": GENERIC_RECOVERY_ERROR}, status=400)

            register_success_on_device(device, timestep=None)
        else:
            secret = decrypt_totp_secret(device.secret_encrypted)
            ok, timestep = verify_totp_code(
                secret, totp_code, last_timestep=device.last_verified_timestep
            )
            if not ok:
                register_failure_on_device(device)
                if lock_is_active(device.locked_until):
                    return Response(
                        {"detail": LOCKED_ERROR.format(seconds=seconds_until(device.locked_until))},
                        status=429,
                    )
                return Response({"code": GENERIC_TOTP_ERROR}, status=400)
            register_success_on_device(device, timestep=timestep)

        # Authentication succeeded. Complete the login and establish a normal owner session.
        clear_pending_owner_2fa(request)
        workspace = establish_owner_session(request, pending_user)
        if workspace is None:
            return Response({"detail": "No active workspace for this account."}, status=404)
        return Response(workspace)


class OwnerTOTPRecoveryCodesRegenerateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = request.user
        denied = _require_owner(actor)
        if denied is not None:
            return denied
        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        if not has_confirmed_owner_totp(actor):
            return Response({"detail": "Two-factor authentication is not enabled."}, status=400)

        current_password = request.data.get("current_password") or ""
        if not owner_password_enabled(actor):
            return password_not_available_response()
        if not actor.check_password(current_password):
            return Response({"current_password": "Current password is incorrect."}, status=400)

        device = OwnerTOTPDevice.objects.filter(user=actor, confirmed=True).first()
        if device is None:
            return Response({"detail": "Two-factor authentication is not enabled."}, status=400)

        if lock_is_active(device.locked_until):
            return Response(
                {"detail": LOCKED_ERROR.format(seconds=seconds_until(device.locked_until))},
                status=429,
            )

        totp_code = request.data.get("code") or ""
        recovery_code = request.data.get("recovery_code") or ""
        second_factor_ok = False
        if recovery_code:
            submitted = normalize_recovery_code(recovery_code)
            if submitted and consume_recovery_code(actor, submitted):
                second_factor_ok = True
                # Consumed a recovery code; regenerate invalidates all codes anyway.
                register_success_on_device(device)
        else:
            secret = decrypt_totp_secret(device.secret_encrypted)
            ok, timestep = verify_totp_code(
                secret, totp_code, last_timestep=device.last_verified_timestep
            )
            if ok:
                second_factor_ok = True
                register_success_on_device(device, timestep=timestep)

        if not second_factor_ok:
            register_failure_on_device(device)
            if lock_is_active(device.locked_until):
                return Response(
                    {"detail": LOCKED_ERROR.format(seconds=seconds_until(device.locked_until))},
                    status=429,
                )
            return Response({"detail": GENERIC_TOTP_ERROR}, status=400)

        old_codes = OwnerRecoveryCode.objects.filter(user=actor).values_list("code_hash", flat=True)
        codes = replace_recovery_codes(actor)
        logger.info("owner_2fa_recovery_codes_regenerated user_id=%s", actor.pk)
        # Return plaintext codes once.
        return Response({"recovery_codes": codes, "two_factor_status": "enabled"})


class OwnerTOTPDisableView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = request.user
        denied = _require_owner(actor)
        if denied is not None:
            return denied
        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        if not has_confirmed_owner_totp(actor):
            return Response({"detail": "Two-factor authentication is not enabled."}, status=400)

        current_password = request.data.get("current_password") or ""
        if not owner_password_enabled(actor):
            return password_not_available_response()
        if not actor.check_password(current_password):
            return Response({"current_password": "Current password is incorrect."}, status=400)

        device = OwnerTOTPDevice.objects.filter(user=actor, confirmed=True).first()
        if device is None:
            return Response({"detail": "Two-factor authentication is not enabled."}, status=400)

        if lock_is_active(device.locked_until):
            return Response(
                {"detail": LOCKED_ERROR.format(seconds=seconds_until(device.locked_until))},
                status=429,
            )

        totp_code = request.data.get("code") or ""
        recovery_code = request.data.get("recovery_code") or ""

        second_factor_ok = False
        if recovery_code:
            submitted = normalize_recovery_code(recovery_code)
            if submitted and consume_recovery_code(actor, submitted):
                second_factor_ok = True
        else:
            secret = decrypt_totp_secret(device.secret_encrypted)
            ok, _timestep = verify_totp_code(
                secret, totp_code, last_timestep=device.last_verified_timestep
            )
            if ok:
                second_factor_ok = True

        if not second_factor_ok:
            register_failure_on_device(device)
            if lock_is_active(device.locked_until):
                return Response(
                    {"detail": LOCKED_ERROR.format(seconds=seconds_until(device.locked_until))},
                    status=429,
                )
            return Response({"detail": GENERIC_TOTP_ERROR}, status=400)

        clear_owner_2fa_for_user(actor)
        logger.info("owner_2fa_disabled user_id=%s", actor.pk)
        return Response({"ok": True, "two_factor_status": "not_enabled"})

