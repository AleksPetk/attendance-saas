import logging

from django.contrib.auth import get_user_model, logout
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.deletion import PermanentDeletionError, permanently_delete_customer_account
from accounts.email_management import (
    account_payload,
    cancel_pending_backup,
    cancel_pending_primary_email,
    remove_backup_email,
    request_backup_email,
    request_primary_email_change,
    resend_backup_verification,
    resend_primary_email_change,
    verify_backup_email_uid_token,
    verify_primary_email_uid_token,
)
from accounts.exceptions import EmailCooldown, EmailNotVerified
from accounts.serializers import (
    AccountSerializer,
    ChangePasswordSerializer,
    DeleteAccountSerializer,
    EmailWithPasswordSerializer,
    ForgotPasswordSerializer,
    PasswordOnlySerializer,
    ResendVerificationSerializer,
    ResetPasswordSerializer,
    VerifyEmailSerializer,
)
from accounts.services import (
    change_password,
    request_password_reset,
    resend_verification_authenticated,
    resend_verification_public,
    reset_password,
    verify_email_uid_token,
)
from accounts.owner_sensitive_auth import password_not_available_response
from accounts.sign_in_methods import owner_password_enabled
from accounts.verification import customer_must_verify_email
from core.mail import EmailConfigurationError, EmailSendError
from organizations.models import WorkspaceStaffAccount

logger = logging.getLogger("accounts")
User = get_user_model()


def _token_error_response(status_key):
    if status_key == "expired":
        return Response(
            {
                "detail": "This link has expired. Request a new one.",
                "code": "token_expired",
            },
            status=400,
        )
    return Response(
        {
            "detail": "This link is invalid or has already been used.",
            "code": "token_invalid",
        },
        status=400,
    )


def _send_failure_response():
    return Response(
        {
            "detail": "We could not send the email. Please try again shortly.",
            "code": "email_send_failed",
        },
        status=503,
    )


def _require_owner(actor):
    if isinstance(actor, WorkspaceStaffAccount) or not isinstance(actor, User):
        return Response(
            {"detail": "Only the paying workspace owner can manage this account."},
            status=403,
        )
    if not actor.is_active:
        return Response({"detail": "This account is inactive."}, status=403)
    return None


def _email_unavailable_response():
    return Response(
        {
            "detail": "This email address is no longer available.",
            "code": "email_unavailable",
        },
        status=400,
    )


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        status_key, user = verify_email_uid_token(
            serializer.validated_data["uid"],
            serializer.validated_data["token"],
        )
        if status_key != "verified":
            return _token_error_response(status_key)
        return Response(
            {
                "detail": "Email verified.",
                "code": "verified",
                "email": user.email,
                "email_verified": True,
            }
        )


class ResendVerificationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        actor = request.user
        if getattr(actor, "is_authenticated", False) and isinstance(actor, User):
            try:
                result = resend_verification_authenticated(actor)
            except (EmailConfigurationError, EmailSendError) as exc:
                logger.error("Authenticated verification resend failed: %s", exc)
                return _send_failure_response()
            if result == "already_verified":
                return Response(
                    {"detail": "This email is already verified.", "code": "already_verified"}
                )
            return Response(
                {
                    "detail": "Verification email sent.",
                    "code": "sent",
                    "email": actor.email,
                }
            )

        serializer = ResendVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data.get("email") or ""
        message = resend_verification_public(email)
        return Response({"detail": message, "code": "accepted"})


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = request_password_reset(serializer.validated_data["email"])
        return Response({"detail": message, "code": "accepted"})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            status_key, _user = reset_password(
                serializer.validated_data["uid"],
                serializer.validated_data["token"],
                serializer.validated_data["password"],
            )
        except DjangoValidationError as exc:
            return Response({"password": exc.messages}, status=400)
        if status_key != "reset":
            return _token_error_response(status_key)
        return Response(
            {
                "detail": "Password updated. Sign in with your new password.",
                "code": "reset",
            }
        )


def _require_owner_password(actor):
    if not owner_password_enabled(actor):
        return password_not_available_response()
    return None


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = request.user
        if isinstance(actor, WorkspaceStaffAccount) or not isinstance(actor, User):
            return Response(
                {"detail": "Only the paying workspace owner can change this password."},
                status=403,
            )
        if not actor.is_active:
            return Response({"detail": "This account is inactive."}, status=403)

        password_denied = _require_owner_password(actor)
        if password_denied is not None:
            return password_denied

        serializer = ChangePasswordSerializer(
            data=request.data,
            context={"user": actor},
        )
        serializer.is_valid(raise_exception=True)
        ok = change_password(
            request,
            actor,
            serializer.validated_data["current_password"],
            serializer.validated_data["new_password"],
        )
        if not ok:
            return Response(
                {"current_password": "Current password is incorrect."},
                status=400,
            )
        return Response({"detail": "Password changed.", "code": "changed"})


class AccountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        actor = request.user
        denied = _require_owner(actor)
        if denied is not None:
            return denied
        if customer_must_verify_email(actor):
            raise EmailNotVerified()
        return Response(AccountSerializer(account_payload(actor)).data)


class BackupEmailView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = request.user
        denied = _require_owner(actor)
        if denied is not None:
            return denied
        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        password_denied = _require_owner_password(actor)
        if password_denied is not None:
            return password_denied

        serializer = EmailWithPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result, detail = request_backup_email(
            actor,
            serializer.validated_data["email"],
            serializer.validated_data["current_password"],
        )
        if result == "wrong_password":
            return Response(
                {"current_password": "Current password is incorrect."},
                status=400,
            )
        if result == "validation_error":
            return Response({"email": detail}, status=400)
        if result == "send_failed":
            return _send_failure_response()
        return Response(
            {
                "detail": "Verification email sent.",
                "code": "sent",
                "pending_backup_email": detail,
            }
        )


class BackupEmailRemoveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = request.user
        denied = _require_owner(actor)
        if denied is not None:
            return denied
        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        password_denied = _require_owner_password(actor)
        if password_denied is not None:
            return password_denied

        serializer = PasswordOnlySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not remove_backup_email(actor, serializer.validated_data["current_password"]):
            return Response(
                {"current_password": "Current password is incorrect."},
                status=400,
            )
        return Response({"detail": "Backup email removed.", "code": "removed"})


class BackupEmailResendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = request.user
        denied = _require_owner(actor)
        if denied is not None:
            return denied
        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        try:
            result = resend_backup_verification(actor)
        except EmailCooldown as exc:
            raise exc
        if result == "nothing_pending":
            return Response(
                {"detail": "No backup email change is pending.", "code": "nothing_pending"},
                status=400,
            )
        if result == "send_failed":
            return _send_failure_response()
        return Response(
            {
                "detail": "Verification email sent.",
                "code": "sent",
                "pending_backup_email": actor.pending_backup_email,
            }
        )


class BackupEmailCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = request.user
        denied = _require_owner(actor)
        if denied is not None:
            return denied
        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        result = cancel_pending_backup(actor)
        if result == "nothing_pending":
            return Response(
                {"detail": "No backup email change is pending.", "code": "nothing_pending"},
                status=400,
            )
        return Response({"detail": "Pending backup email change cancelled.", "code": "cancelled"})


class VerifyBackupEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        status_key, user = verify_backup_email_uid_token(
            serializer.validated_data["uid"],
            serializer.validated_data["token"],
        )
        if status_key == "email_unavailable":
            return _email_unavailable_response()
        if status_key != "verified":
            return _token_error_response(status_key)
        return Response(
            {
                "detail": "Backup email verified.",
                "code": "verified",
                "backup_email": user.backup_email,
            }
        )


class PrimaryEmailChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = request.user
        denied = _require_owner(actor)
        if denied is not None:
            return denied
        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        password_denied = _require_owner_password(actor)
        if password_denied is not None:
            return password_denied

        serializer = EmailWithPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result, detail = request_primary_email_change(
            actor,
            serializer.validated_data["email"],
            serializer.validated_data["current_password"],
        )
        if result == "wrong_password":
            return Response(
                {"current_password": "Current password is incorrect."},
                status=400,
            )
        if result == "validation_error":
            return Response({"email": detail}, status=400)
        if result == "send_failed":
            return _send_failure_response()
        return Response(
            {
                "detail": "Verification email sent.",
                "code": "sent",
                "pending_primary_email": detail,
            }
        )


class PrimaryEmailResendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = request.user
        denied = _require_owner(actor)
        if denied is not None:
            return denied
        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        try:
            result = resend_primary_email_change(actor)
        except EmailCooldown as exc:
            raise exc
        if result == "nothing_pending":
            return Response(
                {"detail": "No login email change is pending.", "code": "nothing_pending"},
                status=400,
            )
        if result == "send_failed":
            return _send_failure_response()
        return Response(
            {
                "detail": "Verification email sent.",
                "code": "sent",
                "pending_primary_email": actor.pending_primary_email,
            }
        )


class PrimaryEmailCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = request.user
        denied = _require_owner(actor)
        if denied is not None:
            return denied
        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        result = cancel_pending_primary_email(actor)
        if result == "nothing_pending":
            return Response(
                {"detail": "No login email change is pending.", "code": "nothing_pending"},
                status=400,
            )
        return Response({"detail": "Pending login email change cancelled.", "code": "cancelled"})


class VerifyPrimaryEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        status_key, user = verify_primary_email_uid_token(
            serializer.validated_data["uid"],
            serializer.validated_data["token"],
        )
        if status_key == "email_unavailable":
            return _email_unavailable_response()
        if status_key != "verified":
            return _token_error_response(status_key)
        return Response(
            {
                "detail": "Login email updated.",
                "code": "verified",
                "email": user.email,
                "email_verified": True,
            }
        )


class DeleteAccountView(APIView):
    """
    Permanently delete the paying owner's account and workspace.

    Allowed for unverified owners so a failed onboarding account can be
    removed and the email reused. Workspace staff cannot call this.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = request.user
        if isinstance(actor, WorkspaceStaffAccount) or not isinstance(actor, User):
            return Response(
                {"detail": "Only the paying workspace owner can delete this account."},
                status=403,
            )
        if getattr(actor, "is_staff", False) or getattr(actor, "is_superuser", False):
            return Response(
                {"detail": "Platform operator accounts cannot be deleted from Check Station."},
                status=403,
            )

        serializer = DeleteAccountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        password_denied = _require_owner_password(actor)
        if password_denied is not None:
            return password_denied

        if not actor.check_password(serializer.validated_data["current_password"]):
            return Response(
                {"current_password": "Current password is incorrect."},
                status=400,
            )

        try:
            permanently_delete_customer_account(actor)
        except PermanentDeletionError as exc:
            return Response({"detail": exc.messages[0] if exc.messages else str(exc)}, status=400)

        logout(request)
        return Response(
            {
                "detail": "Your Check Station account and workspace have been permanently deleted.",
                "code": "account_deleted",
            }
        )
