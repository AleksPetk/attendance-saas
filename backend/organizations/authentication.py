from rest_framework.authentication import BasicAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.contrib.auth.backends import BaseBackend

from organizations.models import (
    Organization,
    OrganizationStatus,
    WorkspaceStaffAccount,
    WorkspaceStaffStatus,
    normalize_workspace_id,
)

WORKSPACE_ID_HEADER = "HTTP_X_WORKSPACE_ID"


class WorkspaceStaffBasicAuthentication(BasicAuthentication):
    """
    Authenticate a WorkspaceStaffAccount with Workspace ID + username + password.

    The Workspace ID header selects the Organization. Username is then looked
    up only inside that workspace. This is not accounts.User authentication.
    """

    def authenticate(self, request):
        if not request.META.get(WORKSPACE_ID_HEADER):
            return None
        return super().authenticate(request)

    def authenticate_credentials(self, userid, password, request=None):
        raw_workspace_id = request.META.get(WORKSPACE_ID_HEADER) if request else ""
        workspace_id = normalize_workspace_id(raw_workspace_id)
        organization = Organization.objects.filter(
            workspace_id=workspace_id,
            status=OrganizationStatus.ACTIVE,
        ).first()
        if organization is None:
            raise AuthenticationFailed("Invalid workspace staff credentials.")

        username = WorkspaceStaffAccount._normalized_username(userid)
        staff = (
            WorkspaceStaffAccount.objects.select_related("organization")
            .filter(
                organization=organization,
                username=username,
                status=WorkspaceStaffStatus.ACTIVE,
            )
            .first()
        )
        if staff is None or not staff.check_password(password):
            raise AuthenticationFailed("Invalid workspace staff credentials.")
        return (staff, None)


class WorkspaceStaffSessionAuthenticationBackend(BaseBackend):
    """
    Enable Django session/cookie auth for `WorkspaceStaffAccount`.

    Staff login uses Workspace ID + username + password (no Organization PK).
    """

    def authenticate(self, request, *, workspace_id=None, username=None, password=None, **kwargs):
        if not workspace_id or username is None or password is None:
            return None

        workspace_id = normalize_workspace_id(workspace_id)
        organization = Organization.objects.filter(
            workspace_id=workspace_id,
            status=OrganizationStatus.ACTIVE,
        ).first()
        if organization is None:
            return None

        staff_username = WorkspaceStaffAccount._normalized_username(username)
        staff = (
            WorkspaceStaffAccount.objects.select_related("organization")
            .filter(
                organization=organization,
                username=staff_username,
                status=WorkspaceStaffStatus.ACTIVE,
            )
            .first()
        )
        if staff is None or not staff.check_password(password):
            return None

        return staff

    def get_user(self, user_id):
        if not user_id:
            return None
        staff = (
            WorkspaceStaffAccount.objects.select_related("organization")
            .filter(pk=user_id)
            .first()
        )
        if staff is None:
            return None
        org = getattr(staff, "organization", None)
        if org is None or getattr(org, "status", None) != OrganizationStatus.ACTIVE:
            return None
        if getattr(staff, "status", None) != WorkspaceStaffStatus.ACTIVE:
            return None
        return staff
