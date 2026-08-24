"""Assign and query workspace Staff ↔ Group access."""

from django.core.exceptions import ValidationError
from django.db import transaction

from groups.models import Group, GroupStatus
from organizations.models import (
    WorkspaceStaffAccount,
    WorkspaceStaffGroupAccess,
    WorkspaceStaffRole,
)


def staff_assigned_group_ids(staff_account):
    """Return group PKs explicitly assigned to a Staff account."""
    return set(
        WorkspaceStaffGroupAccess.objects.filter(
            staff_account=staff_account,
        ).values_list("group_id", flat=True)
    )


def list_staff_group_access(*, staff_account, organization):
    """
    Return active Groups in the workspace with an assigned flag for this Staff account.
    """
    assigned_ids = staff_assigned_group_ids(staff_account)
    groups = Group.objects.filter(
        organization=organization,
        status=GroupStatus.ACTIVE,
    ).order_by("name", "id")
    return [
        {
            "group_id": group.pk,
            "name": group.name,
            "group_type": group.group_type,
            "assigned": group.pk in assigned_ids,
        }
        for group in groups
    ]


@transaction.atomic
def set_staff_group_access(*, staff_account, organization, group_ids):
    """
    Replace Group access assignments for a Staff account.

    Only Staff-role accounts may receive assignments. All groups must belong
    to the same organization. New Staff accounts start with zero assignments.
    """
    if staff_account.role != WorkspaceStaffRole.STAFF:
        raise ValidationError(
            {"detail": "Group access can only be assigned to Staff accounts."}
        )
    if staff_account.organization_id != organization.pk:
        raise ValidationError({"detail": "Staff account is not in this workspace."})

    normalized_ids = []
    seen = set()
    for raw_id in group_ids or []:
        group_id = int(raw_id)
        if group_id in seen:
            continue
        seen.add(group_id)
        normalized_ids.append(group_id)

    valid_ids = set(
        Group.objects.filter(
            organization=organization,
            pk__in=normalized_ids,
        ).values_list("pk", flat=True)
    )
    invalid = [gid for gid in normalized_ids if gid not in valid_ids]
    if invalid:
        raise ValidationError(
            {"group_ids": f"Unknown Group id(s) in this workspace: {invalid}"}
        )

    WorkspaceStaffGroupAccess.objects.filter(staff_account=staff_account).delete()
    WorkspaceStaffGroupAccess.objects.bulk_create(
        [
            WorkspaceStaffGroupAccess(staff_account=staff_account, group_id=group_id)
            for group_id in normalized_ids
        ]
    )
    return normalized_ids


def clear_staff_group_access(staff_account):
    """Remove all Group access rows (e.g. when demoting Admin → Staff)."""
    WorkspaceStaffGroupAccess.objects.filter(staff_account=staff_account).delete()
