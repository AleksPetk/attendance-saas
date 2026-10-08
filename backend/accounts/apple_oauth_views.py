"""Owner Apple OAuth start/callback views."""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.http import HttpResponseRedirect
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
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
from core.desktop_return import DesktopReturnUrlError, require_safe_desktop_return_url
from core.mobile_return import MobileReturnUrlError, require_allowed_mobile_apple_return_url

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
        desktop_return_url = ""
        mobile_return_url = ""

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

        raw_desktop_return = (
            request.query_params.get("desktop_return_url")
            or request.query_params.get("desktop_return")
            or ""
        )
        raw_mobile_return = (
            request.query_params.get("mobile_return_url")
            or request.query_params.get("mobile_return")
            or ""
        )
        if str(raw_desktop_return).strip() and str(raw_mobile_return).strip():
            return Response(
                {
                    "detail": "Desktop and mobile return URLs cannot be combined.",
                    "code": "invalid_return_url",
                },
                status=400,
            )

        if str(raw_desktop_return).strip():
            if intent not in (INTENT_LOGIN, INTENT_REGISTER):
                return Response(
                    {
                        "detail": "Desktop return URL is only valid for login or register.",
                        "code": AppleOAuthResultCode.INVALID_INTENT,
                    },
                    status=400,
                )
            try:
                desktop_return_url = require_safe_desktop_return_url(raw_desktop_return)
            except DesktopReturnUrlError:
                return Response(
                    {
                        "detail": "Invalid desktop return URL.",
                        "code": "invalid_desktop_return_url",
                    },
                    status=400,
                )

        if str(raw_mobile_return).strip():
            # Android browser SIWA: login/register only (not link/verify).
            if intent not in (INTENT_LOGIN, INTENT_REGISTER):
                return Response(
                    {
                        "detail": "Mobile return URL is only valid for login or register.",
                        "code": AppleOAuthResultCode.INVALID_INTENT,
                    },
                    status=400,
                )
            try:
                mobile_return_url = require_allowed_mobile_apple_return_url(raw_mobile_return)
            except MobileReturnUrlError:
                return Response(
                    {
                        "detail": "Invalid mobile return URL.",
                        "code": "invalid_mobile_return_url",
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
            desktop_return_url=desktop_return_url,
            mobile_return_url=mobile_return_url,
        )
        redirect_uri = apple_oauth_redirect_uri(request)
        authorization_url = build_apple_authorization_url(
            redirect_uri=redirect_uri,
            state=pending.state,
            nonce=pending.nonce,
        )
        return HttpResponseRedirect(authorization_url)


@method_decorator(csrf_exempt, name="dispatch")
class AppleOAuthCallbackView(APIView):
    """
    Apple redirect target.

    Sign in with Apple uses `response_mode=form_post`, so the callback is a
    cross-site POST that cannot carry our CSRF cookie/token. Protection is the
    signed, single-use OAuth `state` plus ID-token nonce verification — not
    Django CSRF. Session cookies remain SameSite=Lax for the rest of the app.
    """

    authentication_classes = []
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
