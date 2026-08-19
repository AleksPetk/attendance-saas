from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.exceptions import EmailNotVerified
from accounts.verification import customer_must_verify_email
from organizations.models import (
    Organization,
    OrganizationStatus,
    WorkspaceStaffAccount,
    WorkspaceStaffStatus,
)


def deny_unverified_customer(user):
    if customer_must_verify_email(user):
        raise EmailNotVerified()


def get_owned_organization(user):
    """
    Return the paying owner's active workspace, or None.

    Workspace staff and platform operators without an owned workspace
    cannot manage Members/Groups in this slice.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    if isinstance(user, WorkspaceStaffAccount):
        return None
    if customer_must_verify_email(user):
        return None
    return Organization.objects.filter(
        owner=user,
        status=OrganizationStatus.ACTIVE,
    ).first()


class IsWorkspaceOwner(BasePermission):
    message = "Only the paying workspace owner can manage this resource."

    def has_permission(self, request, view):
        deny_unverified_customer(request.user)
        return get_owned_organization(request.user) is not None


def get_active_workspace_organization(user):
    """
    Return the active Organization a user can access in the customer workspace slice.

    - Paying owners (accounts.User) access their owned active workspace.
    - Workspace staff/admin access their attached workspace if staff and org are active.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return None

    if isinstance(user, WorkspaceStaffAccount):
        if getattr(user, "status", None) != WorkspaceStaffStatus.ACTIVE:
            # Fallback: rely on staff-level `is_active` when present.
            if hasattr(user, "is_active") and not user.is_active:
                return None
        org = getattr(user, "organization", None)
        if org is None or getattr(org, "status", None) != OrganizationStatus.ACTIVE:
            return None
        return org

    return get_owned_organization(user)


def get_workspace_operator_role(user):
    """
    Returns "owner", "admin", "staff", or None.
    """
    org = get_active_workspace_organization(user)
    if org is None:
        return None

    if isinstance(user, WorkspaceStaffAccount):
        return user.role

    return "owner"


class CanViewWorkspace(BasePermission):
    """
    Owner/admin/staff can view workspace data (safe methods).
    """

    message = "Not allowed to view this workspace."

    def has_permission(self, request, view):
        deny_unverified_customer(request.user)
        return request.method in SAFE_METHODS and get_active_workspace_organization(request.user) is not None


class CanManageWorkspace(BasePermission):
    """
    Owner/admin can modify workspace data; staff is read-only.
    """

    message = "Not allowed to modify this workspace."

    def has_permission(self, request, view):
        deny_unverified_customer(request.user)
        role = get_workspace_operator_role(request.user)
        return role in {"owner", "admin"}


class CanUseKioskAndViewHistory(BasePermission):
    """
    Owner/admin/staff can use participant-facing kiosks and view history.
    """

    message = "Not allowed to access kiosk/history in this workspace."

    def has_permission(self, request, view):
        deny_unverified_customer(request.user)
        return get_active_workspace_organization(request.user) is not None
