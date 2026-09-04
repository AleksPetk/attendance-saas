"""Public API views for verified-backup owner account recovery."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.account_recovery import (
    ACCOUNT_RECOVERY_PUBLIC_MESSAGE,
    clear_recovery_session,
    confirm_account_recovery,
    load_recovery_challenge,
    recovery_status_payload,
    satisfy_recovery_two_factor,
    start_account_recovery,
    submit_recovery_credentials,
    verify_recovery_primary_email,
)
from accounts.serializers import (
    ForgotPasswordSerializer,
    RecoverAccountCompleteSerializer,
    RecoverAccountTwoFactorSerializer,
    VerifyEmailSerializer,
)
from core.auth_rate_limits import (
    check_account_recovery_allowed,
    record_account_recovery_attempt,
)

User = get_user_model()


def _token_error_response(status_key: str):
    if status_key == "expired":
        return Response(
            {
                "detail": "This recovery link has expired. Request a new one.",
                "code": "token_expired",
            },
            status=400,
        )
    return Response(
        {
            "detail": "This recovery link is invalid or has already been used.",
            "code": "token_invalid",
        },
        status=400,
    )


class RecoverAccountStartView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        if not check_account_recovery_allowed(request, email):
            return Response(
                {"detail": ACCOUNT_RECOVERY_PUBLIC_MESSAGE, "code": "accepted"}
            )
        message = start_account_recovery(
            email,
            language=serializer.validated_data["locale"],
        )
        record_account_recovery_attempt(request, email)
        return Response({"detail": message, "code": "accepted"})


class RecoverAccountConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        status_key, challenge = confirm_account_recovery(
            request,
            serializer.validated_data["uid"],
            serializer.validated_data["token"],
        )
        if status_key != "confirmed" or challenge is None:
            return _token_error_response(status_key)
        payload = recovery_status_payload(challenge)
        payload["code"] = "confirmed"
        payload["detail"] = "Backup email confirmed. Continue account recovery."
        return Response(payload)


class RecoverAccountStatusView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        challenge = load_recovery_challenge(request)
        payload = recovery_status_payload(challenge)
        payload["code"] = "status"
        return Response(payload)


class RecoverAccountTwoFactorView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RecoverAccountTwoFactorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        status_key, detail = satisfy_recovery_two_factor(
            request,
            code=serializer.validated_data.get("code") or "",
            recovery_code=serializer.validated_data.get("recovery_code") or "",
        )
        if status_key == "no_session":
            return Response(
                {"detail": "Start recovery from your backup email link.", "code": "no_session"},
                status=400,
            )
        if status_key == "expired":
            return _token_error_response("expired")
        if status_key == "locked":
            return Response(
                {
                    "detail": f"Too many attempts. Try again in {detail} seconds.",
                    "code": "locked",
                },
                status=429,
            )
        if status_key == "invalid_code":
            return Response(
                {"detail": "That authentication code was not valid.", "code": "invalid_code"},
                status=400,
            )
        if status_key == "two_factor_required":
            return Response(
                {"detail": "Two-factor authentication is required.", "code": "two_factor_required"},
                status=400,
            )
        challenge = load_recovery_challenge(request)
        payload = recovery_status_payload(challenge)
        payload["code"] = "two_factor_ok"
        payload["detail"] = "Two-factor authentication confirmed."
        return Response(payload)


class RecoverAccountCompleteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RecoverAccountCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        status_key, detail = submit_recovery_credentials(
            request,
            new_email=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )
        if status_key == "no_session":
            return Response(
                {"detail": "Start recovery from your backup email link.", "code": "no_session"},
                status=400,
            )
        if status_key == "expired":
            return _token_error_response("expired")
        if status_key == "two_factor_required":
            return Response(
                {
                    "detail": "Two-factor authentication is required.",
                    "code": "two_factor_required",
                },
                status=400,
            )
        if status_key == "validation_error":
            return Response(detail, status=400)
        if status_key == "send_failed":
            return Response(
                {
                    "detail": "We could not send the verification email. Please try again shortly.",
                    "code": "email_send_failed",
                },
                status=503,
            )
        challenge = detail
        payload = recovery_status_payload(challenge)
        payload["code"] = "awaiting_primary_verification"
        payload["detail"] = (
            "Check the new login email for a confirmation link to finish recovery."
        )
        return Response(payload)


class RecoverAccountVerifyPrimaryView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        status_key, user = verify_recovery_primary_email(
            serializer.validated_data["uid"],
            serializer.validated_data["token"],
        )
        if status_key == "email_unavailable":
            return Response(
                {
                    "detail": "This email address is no longer available.",
                    "code": "email_unavailable",
                },
                status=400,
            )
        if status_key != "completed" or user is None:
            return _token_error_response(status_key)
        clear_recovery_session(request)
        return Response(
            {
                "detail": "Account recovery complete. Sign in with your new login email.",
                "code": "completed",
                "email": user.email,
            }
        )
