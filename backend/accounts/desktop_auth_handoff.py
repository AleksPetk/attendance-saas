"""
One-time desktop auth handoff after browser Apple (web) OAuth.

Apple form_post establishes identity on the backend, but the system browser
session cookies are not shared with Electron. A short-lived opaque handoff
token lets the desktop app establish its own Django session.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.owner_authentication import (
    establish_owner_session,
    get_active_owner_organization,
)
from accounts.owner_two_factor import begin_pending_owner_2fa, has_confirmed_owner_totp
from accounts.verification import customer_must_verify_email

User = get_user_model()

HANDOFF_CACHE_PREFIX = "desktop_auth_handoff:"
HANDOFF_TTL_SECONDS = 120
OUTCOME_AUTHENTICATED = "authenticated"
OUTCOME_TWO_FACTOR_REQUIRED = "two_factor_required"
VALID_OUTCOMES = frozenset({OUTCOME_AUTHENTICATED, OUTCOME_TWO_FACTOR_REQUIRED})


@dataclass(frozen=True)
class DesktopAuthHandoff:
    user_id: int
    outcome: str
    provider: str


def _cache_key(token: str) -> str:
    return f"{HANDOFF_CACHE_PREFIX}{token}"


def create_desktop_auth_handoff(
    user,
    *,
    outcome: str,
    provider: str = "apple",
) -> str:
    if outcome not in VALID_OUTCOMES:
        raise ValueError(f"Unsupported desktop handoff outcome: {outcome}")
    if user is None or not getattr(user, "pk", None):
        raise ValueError("Desktop handoff requires a user")
    token = secrets.token_urlsafe(32)
    cache.set(
        _cache_key(token),
        {
            "user_id": int(user.pk),
            "outcome": outcome,
            "provider": str(provider or "apple"),
        },
        timeout=HANDOFF_TTL_SECONDS,
    )
    return token


def consume_desktop_auth_handoff(token: str) -> DesktopAuthHandoff | None:
    raw = str(token or "").strip()
    if not raw:
        return None
    key = _cache_key(raw)
    payload = cache.get(key)
    cache.delete(key)
    if not isinstance(payload, dict):
        return None
    try:
        user_id = int(payload.get("user_id"))
    except (TypeError, ValueError):
        return None
    outcome = str(payload.get("outcome") or "")
    if outcome not in VALID_OUTCOMES or user_id < 1:
        return None
    return DesktopAuthHandoff(
        user_id=user_id,
        outcome=outcome,
        provider=str(payload.get("provider") or "apple"),
    )


def complete_desktop_auth_handoff(request, *, token: str):
    """
    Establish an Electron session from a one-time handoff token.

    Returns a DRF Response matching password / native OAuth completion shapes.
    """
    handoff = consume_desktop_auth_handoff(token)
    if handoff is None:
        return Response(
            {
                "detail": "Desktop sign-in handoff expired or is invalid.",
                "code": "invalid_handoff",
            },
            status=400,
        )

    user = (
        User.objects.filter(
            pk=handoff.user_id,
            is_active=True,
            is_staff=False,
            is_superuser=False,
        )
        .first()
    )
    if user is None:
        return Response(
            {
                "detail": "Desktop sign-in handoff expired or is invalid.",
                "code": "invalid_handoff",
            },
            status=400,
        )

    if customer_must_verify_email(user):
        return Response(
            {
                "detail": "Please verify your email before continuing.",
                "code": "email_not_verified",
                "email": user.email,
            },
            status=403,
        )

    organization = get_active_owner_organization(user)
    if organization is None:
        return Response(
            {"detail": "No active workspace for this account."},
            status=404,
        )

    if handoff.outcome == OUTCOME_TWO_FACTOR_REQUIRED or has_confirmed_owner_totp(user):
        begin_pending_owner_2fa(request, user)
        return Response(
            {
                "detail": "Two-factor authentication is required.",
                "code": "two_factor_required",
                "email": user.email,
            },
            status=403,
        )

    workspace = establish_owner_session(request, user, organization=organization)
    if workspace is None:
        return Response(
            {"detail": "No active workspace for this account."},
            status=404,
        )
    return Response(workspace)


class DesktopAuthHandoffView(APIView):
    """Exchange a one-time desktop OAuth handoff for a Django session."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get("handoff") or request.data.get("token") or ""
        return complete_desktop_auth_handoff(request, token=str(token))
