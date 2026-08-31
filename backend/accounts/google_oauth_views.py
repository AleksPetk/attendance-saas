"""Owner Google OAuth start/callback views."""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.http import HttpResponseRedirect
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.google_oauth import GoogleOAuthResultCode, process_google_oauth_callback
from accounts.google_oauth_client import build_google_authorization_url
from accounts.google_oauth_settings import (
    google_oauth_is_configured,
    google_oauth_redirect_uri,
)
from accounts.google_oauth_state import (
    INTENT_LINK,
    INTENT_LOGIN,
    INTENT_REGISTER,
    INTENT_VERIFY,
    VALID_INTENTS,
    create_google_oauth_state,
)

logger = logging.getLogger("accounts.google_oauth")
User = get_user_model()


def _truthy_query_param(value) -> bool:
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _oauth_not_configured_response():
    return Response(
        {
            "detail": "Google sign-in is not available.",
            "code": GoogleOAuthResultCode.OAUTH_NOT_CONFIGURED,
        },
        status=503,
    )


def _require_owner_actor(user):
    if user is None or not isinstance(user, User):
        return Response(
            {"detail": "Only the paying workspace owner can link Google sign-in."},
            status=403,
        )
    if not getattr(user, "is_active", False):
        return Response({"detail": "This account is inactive."}, status=403)
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return Response(
            {"detail": "Platform operator accounts cannot use customer Google sign-in."},
            status=403,
        )
    return None


class GoogleOAuthStartView(APIView):
    """
    Begin owner Google OAuth for login, register, or link.

    Register requires `legal_acknowledgement=true`, matching password registration.
    Link requires an authenticated owner session.
    """

    def get_permissions(self):
        intent = (self.request.query_params.get("intent") or "").strip().lower()
        if intent in (INTENT_LINK, INTENT_VERIFY):
            return [IsAuthenticated()]
        return [AllowAny()]

    def get(self, request):
        if not google_oauth_is_configured():
            return _oauth_not_configured_response()

        intent = (request.query_params.get("intent") or INTENT_LOGIN).strip().lower()
        if intent not in VALID_INTENTS:
            return Response(
                {
                    "detail": "Invalid Google sign-in intent.",
                    "code": GoogleOAuthResultCode.INVALID_INTENT,
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
                        "code": GoogleOAuthResultCode.LEGAL_ACKNOWLEDGEMENT_REQUIRED,
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

        pending = create_google_oauth_state(
            request,
            intent=intent,
            legal_acknowledgement=legal_acknowledgement,
            owner_user_id=owner_user_id,
        )
        redirect_uri = google_oauth_redirect_uri(request)
        authorization_url = build_google_authorization_url(
            redirect_uri=redirect_uri,
            state=pending.state,
            nonce=pending.nonce,
        )
        return HttpResponseRedirect(authorization_url)


class GoogleOAuthCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if not google_oauth_is_configured():
            return _oauth_not_configured_response()

        return process_google_oauth_callback(
            request,
            code=request.query_params.get("code"),
            state=request.query_params.get("state"),
        )
