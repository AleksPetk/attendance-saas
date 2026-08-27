from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.exceptions import EmailNotVerified
from accounts.verification import customer_must_verify_email
from organizations.models import (
    Organization,
    OrganizationStatus,
    WorkspaceStaffAccount,
    WorkspaceStaffGroupAccess,
    WorkspaceStaffRole,
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


def is_workspace_owner(user):
    return get_owned_organization(user) is not None


def is_workspace_staff_account(user):
    return isinstance(user, WorkspaceStaffAccount)


def is_workspace_staff_operator(user):
    """True for workspace Staff role (group-scoped operator)."""
    return (
        isinstance(user, WorkspaceStaffAccount)
        and user.role == WorkspaceStaffRole.STAFF
    )


def get_active_workspace_organization(user):
    """
    Return the active Organization a user can access in the customer workspace slice.

    - Paying owners (accounts.User) access their owned active workspace.
    - Workspace staff/admin access their attached workspace if staff and org are active.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return None

    if isinstance(user, WorkspaceStaffAccount):
        from organizations.entitlements.plan_locks import (
            is_staff_account_plan_unlocked,
        )

        if not is_staff_account_plan_unlocked(user):
            raise PermissionDenied(
                detail={
                    "code": "plan_account_locked",
                    "detail": "This workspace account is locked by the current plan.",
                    "workspace_id": user.organization.workspace_id,
                    "username": user.username,
                    "role": user.role,
                }
            )
    if isinstance(user, WorkspaceStaffAccount):
        from organizations.entitlements.plan_locks import (
            is_staff_account_plan_unlocked,
        )

        if not is_staff_account_plan_unlocked(user):
            raise PermissionDenied(
                detail={
                    "code": "plan_account_locked",
                    "detail": "This workspace account is locked by the current plan.",
                    "workspace_id": user.organization.workspace_id,
                    "username": user.username,
                    "role": user.role,
                }
            )
        if getattr(user, "status", None) != WorkspaceStaffStatus.ACTIVE:
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


def can_manage_workspace(user):
    """Owner or workspace admin may mutate operational workspace data."""
    return get_workspace_operator_role(user) in {"owner", "admin"}


def can_manage_staff_accounts(user):
    """Owner or workspace admin may access staff-management endpoints."""
    return get_workspace_operator_role(user) in {"owner", "admin"}


def can_manage_workspace_admin_accounts(user):
    """Only the paying owner may create or manage workspace admin accounts."""
    return is_workspace_owner(user)


def can_manage_owner_account(user):
    """Only the paying owner may access owner account/security endpoints."""
    return is_workspace_owner(user)


def staff_account_manageable_by_actor(actor, staff_account):
    """
    Return True when `actor` may mutate the given workspace staff account.

    Workspace admins may manage staff-role accounts only.
    """
    role = get_workspace_operator_role(actor)
    if role == "owner":
        return True
    if role == WorkspaceStaffRole.ADMIN:
        return staff_account.role == WorkspaceStaffRole.STAFF
    return False


def get_staff_assigned_group_ids(user):
    """
    Return assigned Group PKs for workspace Staff, or None when the actor
    has implicit access to all Groups in the workspace (owner/admin).
    """
    if not is_workspace_staff_operator(user):
        return None
    return set(
        WorkspaceStaffGroupAccess.objects.filter(
            staff_account=user,
        ).values_list("group_id", flat=True)
    )


def scope_groups_queryset(user, queryset):
    """Limit a Group queryset to Groups the actor may access."""
    assigned_ids = get_staff_assigned_group_ids(user)
    if assigned_ids is None:
        return queryset
    if not assigned_ids:
        return queryset.none()
    return queryset.filter(pk__in=assigned_ids)


def can_access_group(user, group):
    """True when the actor may view/operate the given Group."""
    org = get_active_workspace_organization(user)
    if org is None or group.organization_id != org.pk:
        return False
    assigned_ids = get_staff_assigned_group_ids(user)
    if assigned_ids is None:
        return True
    return group.pk in assigned_ids


def can_manage_group_configuration(user, group=None):
    """Owner/Admin only — Group/Kiosk configuration and global workspace ops."""
    if not can_manage_workspace(user):
        return False
    if group is None:
        return True
    return can_access_group(user, group)


def can_manage_group_participants(user, group):
    """Participant operations inside a Group (owner/admin or assigned Staff)."""
    if not can_access_group(user, group):
        return False
    if can_manage_workspace(user):
        return True
    return is_workspace_staff_operator(user)


def can_view_global_members(user):
    """Global Members directory/profile management — owner/admin only."""
    return can_manage_workspace(user)


def workspace_capabilities(user):
    role = get_workspace_operator_role(user)
    if role is None:
        return {}
    org = get_active_workspace_organization(user)
    is_staff = role == WorkspaceStaffRole.STAFF
    checkstation = bool(getattr(org, "is_checkstation_account", False))
    owner = role == "owner"
    can_billing = owner and not checkstation
    return {
        "can_manage_workspace": role in {"owner", "admin"},
        "can_manage_staff_accounts": role in {"owner", "admin"},
        "can_manage_workspace_admin_accounts": role == "owner",
        "can_manage_owner_account": role == "owner",
        "can_launch_kiosk": role in {"owner", "admin", "staff"},
        "can_view_billing": can_billing,
        "can_manage_subscription": can_billing,
        "can_view_global_members": not is_staff,
        "can_manage_group_configuration": role in {"owner", "admin"},
        "can_manage_group_participants": role in {"owner", "admin", "staff"},
        "is_group_scoped_staff": is_staff,
        "account_mode": "checkstation" if checkstation else "normal",
        "workspace_status": getattr(org, "status", None),
    }


class IsWorkspaceOwner(BasePermission):
    message = "Only the paying workspace owner can manage this resource."

    def has_permission(self, request, view):
        deny_unverified_customer(request.user)
        return is_workspace_owner(request.user)


class CanManageStaffAccounts(BasePermission):
    message = "Not allowed to manage workspace staff accounts."

    def has_permission(self, request, view):
        deny_unverified_customer(request.user)
        return can_manage_staff_accounts(request.user)


class CanViewWorkspace(BasePermission):
    """
    Owner/admin workspace-wide read access (Members, global lists).

    Workspace Staff use group-scoped permissions instead.
    """

    message = "Not allowed to view this workspace."

    def has_permission(self, request, view):
        deny_unverified_customer(request.user)
        return (
            request.method in SAFE_METHODS
            and get_active_workspace_organization(request.user) is not None
            and can_view_global_members(request.user)
        )


class CanViewAssignedGroup(BasePermission):
    """
    Read access to Groups: owner/admin see all; Staff see assigned Groups only.
    """

    message = "Not allowed to view this Group."

    def has_permission(self, request, view):
        deny_unverified_customer(request.user)
        return (
            request.method in SAFE_METHODS
            and get_active_workspace_organization(request.user) is not None
        )


class CanManageWorkspace(BasePermission):
    """
    Owner/admin can modify workspace data; staff is read-only at workspace level.
    """

    message = "Not allowed to modify this workspace."

    def has_permission(self, request, view):
        deny_unverified_customer(request.user)
        return can_manage_workspace(request.user)


class CanManageGroupParticipants(BasePermission):
    """
    Participant-level operations inside an assigned Group.

    Owner/admin: any Group in the workspace. Staff: assigned Groups only.
    """

    message = "Not allowed to manage participants in this Group."

    def has_permission(self, request, view):
        deny_unverified_customer(request.user)
        return get_active_workspace_organization(request.user) is not None


class CanUseKioskAndViewHistory(BasePermission):
    """
    Owner/admin/staff can use participant-facing kiosks and view history.

    Views must still filter by assigned Groups for Staff.
    """

    message = "Not allowed to access kiosk/history in this workspace."

    def has_permission(self, request, view):
        deny_unverified_customer(request.user)
        return get_active_workspace_organization(request.user) is not None


class CanManageGroupConfiguration(BasePermission):
    """Group/Kiosk configuration — owner/admin only."""

    message = "Not allowed to configure this Group."

    def has_permission(self, request, view):
        deny_unverified_customer(request.user)
        return can_manage_group_configuration(request.user)
