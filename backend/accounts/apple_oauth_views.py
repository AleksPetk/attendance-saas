"""Owner Apple OAuth start/callback views."""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.http import HttpResponseRedirect
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.apple_oauth import AppleOAuthResultCode, process_apple_oauth_callback
from accounts.apple_oauth_client import build_apple_authorization_url
from accounts.apple_oauth_settings import (
    apple_oauth_is_configured,
    apple_oauth_redirect_uri,
)
from accounts.apple_oauth_state import (
    INTENT_LINK,
    INTENT_LOGIN,
    INTENT_REGISTER,
    INTENT_VERIFY,
    VALID_INTENTS,
    create_apple_oauth_state,
)

logger = logging.getLogger("accounts.apple_oauth")
User = get_user_model()


def _truthy_query_param(value) -> bool:
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _oauth_not_configured_response():
    return Response(
        {
            "detail": "Apple sign-in is not available.",
            "code": AppleOAuthResultCode.OAUTH_NOT_CONFIGURED,
        },
        status=503,
    )


def _require_owner_actor(user):
    if user is None or not isinstance(user, User):
        return Response(
            {"detail": "Only the paying workspace owner can link Apple sign-in."},
            status=403,
        )
    if not getattr(user, "is_active", False):
        return Response({"detail": "This account is inactive."}, status=403)
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return Response(
            {"detail": "Platform operator accounts cannot use customer Apple sign-in."},
            status=403,
        )
    return None


class AppleOAuthStartView(APIView):
    """
    Begin owner Apple OAuth for login, register, or link.

    Register requires `legal_acknowledgement=true`, matching password registration.
    Link requires an authenticated owner session.
    """

    def get_permissions(self):
        intent = (self.request.query_params.get("intent") or "").strip().lower()
        if intent in (INTENT_LINK, INTENT_VERIFY):
            return [IsAuthenticated()]
        return [AllowAny()]

    def get(self, request):
        if not apple_oauth_is_configured():
            return _oauth_not_configured_response()

        intent = (request.query_params.get("intent") or INTENT_LOGIN).strip().lower()
        if intent not in VALID_INTENTS:
            return Response(
                {
                    "detail": "Invalid Apple sign-in intent.",
                    "code": AppleOAuthResultCode.INVALID_INTENT,
                },
                status=400,
            )

        legal_acknowledgement = False
        owner_user_id = None

        if intent == INTENT_REGISTER:
            legal_acknowledgement = _truthy_query_param(
                request.query_params.get("legal_acknowledgement")
            )
            if not legal_acknowledgement:
                return Response(
                    {
                        "detail": (
                            "You must agree to the Terms of Use and acknowledge "
                            "the Privacy Policy."
                        ),
                        "code": AppleOAuthResultCode.LEGAL_ACKNOWLEDGEMENT_REQUIRED,
                    },
                    status=400,
                )

        if intent == INTENT_LINK:
            denied = _require_owner_actor(request.user)
            if denied is not None:
                return denied
            owner_user_id = request.user.pk

        if intent == INTENT_VERIFY:
            denied = _require_owner_actor(request.user)
            if denied is not None:
                return denied
            owner_user_id = request.user.pk

        pending = create_apple_oauth_state(
            request,
            intent=intent,
            legal_acknowledgement=legal_acknowledgement,
            owner_user_id=owner_user_id,
        )
        redirect_uri = apple_oauth_redirect_uri(request)
        authorization_url = build_apple_authorization_url(
            redirect_uri=redirect_uri,
            state=pending.state,
            nonce=pending.nonce,
        )
        return HttpResponseRedirect(authorization_url)


class AppleOAuthCallbackView(APIView):
    """
    Apple redirect target.

    Sign in with Apple uses `response_mode=form_post`, so the callback is POST.
    """

    permission_classes = [AllowAny]

    def _callback(self, request):
        if not apple_oauth_is_configured():
            return _oauth_not_configured_response()

        code = request.data.get("code") or request.query_params.get("code")
        state = request.data.get("state") or request.query_params.get("state")
        return process_apple_oauth_callback(request, code=code, state=state)

    def post(self, request):
        return self._callback(request)

    def get(self, request):
        return self._callback(request)
