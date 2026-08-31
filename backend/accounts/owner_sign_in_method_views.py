"""Owner sign-in method management views (set password, unlink providers)."""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.email_management import account_payload
from accounts.exceptions import EmailNotVerified
from accounts.owner_auth_provider_models import OwnerAuthProvider, OwnerAuthProviderLink
from accounts.owner_sensitive_auth import (
    clear_owner_oauth_reauth,
    last_sign_in_method_response,
    validate_sensitive_owner_reauth,
    validate_set_password_reauth,
)
from accounts.serializers import AccountSerializer
from accounts.sign_in_methods import can_unlink_owner_provider, get_owner_provider_link
from accounts.verification import customer_must_verify_email
from organizations.models import WorkspaceStaffAccount

logger = logging.getLogger("accounts.sign_in_methods")
User = get_user_model()


def _require_owner(actor):
    if isinstance(actor, WorkspaceStaffAccount) or not isinstance(actor, User):
        return Response(
            {"detail": "Only the paying workspace owner can manage sign-in methods."},
            status=403,
        )
    if not actor.is_active:
        return Response({"detail": "This account is inactive."}, status=403)
    if getattr(actor, "is_staff", False) or getattr(actor, "is_superuser", False):
        return Response(
            {"detail": "Platform operator accounts cannot use customer sign-in methods."},
            status=403,
        )
    return None


def _account_response(actor):
    return Response(AccountSerializer(account_payload(actor)).data)


class SetPasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor = request.user
        denied = _require_owner(actor)
        if denied is not None:
            return denied
        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        reauth_error = validate_set_password_reauth(
            request,
            actor,
            code=request.data.get("code") or "",
            recovery_code=request.data.get("recovery_code") or "",
        )
        if reauth_error is not None:
            return reauth_error

        new_password = request.data.get("new_password") or ""
        new_password_confirm = request.data.get("new_password_confirm") or ""
        if new_password != new_password_confirm:
            return Response(
                {"new_password_confirm": "Passwords do not match."},
                status=400,
            )
        try:
            validate_password(password=new_password, user=actor)
        except DjangoValidationError as exc:
            return Response({"new_password": exc.messages}, status=400)

        actor.set_password(new_password)
        actor.save(update_fields=["password"])
        update_session_auth_hash(request, actor)
        clear_owner_oauth_reauth(request)
        logger.info("owner_set_password user_id=%s", actor.pk)
        return _account_response(actor)


class GoogleUnlinkView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return _unlink_provider(request, OwnerAuthProvider.GOOGLE)


class AppleUnlinkView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return _unlink_provider(request, OwnerAuthProvider.APPLE)


def _unlink_provider(request, provider: str):
    actor = request.user
    denied = _require_owner(actor)
    if denied is not None:
        return denied
    if customer_must_verify_email(actor):
        raise EmailNotVerified()

    link = get_owner_provider_link(actor, provider)
    if link is None:
        return Response(
            {
                "detail": "This sign-in method is not connected.",
                "code": "not_linked",
            },
            status=400,
        )

    if not can_unlink_owner_provider(actor, provider):
        return last_sign_in_method_response()

    reauth_error = validate_sensitive_owner_reauth(
        request,
        actor,
        current_password=request.data.get("current_password") or "",
        code=request.data.get("code") or "",
        recovery_code=request.data.get("recovery_code") or "",
        exclude_provider=provider,
    )
    if reauth_error is not None:
        return reauth_error

    link.delete()
    clear_owner_oauth_reauth(request)
    logger.info("owner_unlink_provider user_id=%s provider=%s", actor.pk, provider)
    return _account_response(actor)
