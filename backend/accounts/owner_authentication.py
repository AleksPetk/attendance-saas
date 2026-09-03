"""
Shared post-first-factor owner authentication completion.

Password login, future OAuth login, and owner 2FA challenge completion all
converge here after the owner identity has already been established.
"""

from __future__ import annotations

from django.contrib.auth import login
from rest_framework.response import Response

from accounts.language import normalize_language
from accounts.owner_two_factor import (
    OWNER_AUTHENTICATION_BACKEND,
    begin_pending_owner_2fa,
    has_confirmed_owner_totp,
)
from accounts.verification import customer_must_verify_email
from attendance.kiosk_lock import attach_kiosk_status
from billing.builtin_trial import attach_builtin_trial
from organizations.account_mode import account_mode_key
from organizations.entitlements import build_entitlement_payload
from organizations.entitlements.advertising import attach_workspace_advertising
from organizations.models import Organization, OrganizationStatus
from organizations.permissions import workspace_capabilities
from organizations.serializers import CurrentWorkspaceSerializer


def get_active_owner_organization(user):
    return Organization.objects.filter(
        owner=user,
        status=OrganizationStatus.ACTIVE,
    ).first()


def build_owner_workspace_payload(request, user, organization):
    payload = {
        "account_kind": "owner",
        "role": "owner",
        "identity": user.email,
        "is_platform_operator": bool(
            getattr(user, "is_staff", False) or getattr(user, "is_superuser", False)
        ),
        "workspace_id": organization.workspace_id,
        "account_mode": account_mode_key(organization),
        "workspace_status": organization.status,
        "capabilities": workspace_capabilities(user),
        "entitlements": build_entitlement_payload(organization),
        "preferred_language": normalize_language(
            getattr(user, "preferred_language", None)
        ),
    }
    attach_workspace_advertising(payload, organization)
    attach_builtin_trial(payload, organization)
    return CurrentWorkspaceSerializer(attach_kiosk_status(request, payload)).data


def establish_owner_session(request, user, *, organization=None):
    """
    Create a normal authenticated owner session and return the workspace payload.

    Used after first-factor authentication when owner 2FA is not enabled, and
    after a successful owner 2FA challenge.
    """
    if organization is None:
        organization = get_active_owner_organization(user)
    if organization is None:
        return None
    login(request, user, backend=OWNER_AUTHENTICATION_BACKEND)
    return build_owner_workspace_payload(request, user, organization)


def complete_owner_authentication(request, user):
    """
    Finish owner login after first-factor authentication succeeded.

    The caller must have already validated credentials (password, OAuth, etc.).
    This helper enforces email verification, active workspace, and owner 2FA
    before establishing a normal authenticated session.
    """
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

    if has_confirmed_owner_totp(user):
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
    return Response(workspace)
