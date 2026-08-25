"""Workspace usage calculation for plan entitlements."""

from __future__ import annotations

from django.db.models import Count

from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupOnlyParticipant,
    GroupOnlyParticipantStatus,
    GroupSection,
    GroupSectionStatus,
    GroupStatus,
    GroupType,
)
from members.models import Member, MemberStatus
from organizations.entitlements.catalog import (
    LIMIT_ACTIVE_STANDARD_GROUPS,
    LIMIT_ACTIVE_STRUCTURED_GROUPS,
    LIMIT_ARCHIVED_GROUPS,
    LIMIT_CLASSES_PER_STRUCTURED_GROUP,
    LIMIT_MEMBERS,
    LIMIT_PARTICIPANTS_PER_CLASS,
    LIMIT_PARTICIPANTS_PER_STANDARD_GROUP,
    LIMIT_WORKSPACE_ADMINS,
    LIMIT_WORKSPACE_STAFF,
)
from organizations.models import WorkspaceStaffAccount, WorkspaceStaffRole, WorkspaceStaffStatus


def _active_groups_qs(organization):
    return Group.objects.filter(
        organization=organization,
        status=GroupStatus.ACTIVE,
    )


def _archived_groups_qs(organization):
    return Group.objects.filter(
        organization=organization,
        status=GroupStatus.ARCHIVED,
    )


def count_active_standard_groups(organization) -> int:
    return _active_groups_qs(organization).filter(
        group_type=GroupType.STANDARD,
        plan_unlocked=True,
    ).count()


def count_active_structured_groups(organization) -> int:
    from organizations.entitlements.catalog import FEATURE_STRUCTURED_GROUPS
    from organizations.entitlements.service import has_feature

    if not has_feature(organization, FEATURE_STRUCTURED_GROUPS):
        return 0
    return _active_groups_qs(organization).filter(
        group_type=GroupType.STRUCTURED,
        plan_unlocked=True,
    ).count()


def count_archived_groups(organization) -> int:
    return _archived_groups_qs(organization).filter(plan_unlocked=True).count()


def count_members(organization) -> int:
    """Active Members that count toward plan capacity (plan-unlocked only)."""
    return Member.objects.filter(
        organization=organization,
        status=MemberStatus.ACTIVE,
        plan_unlocked=True,
    ).count()


def count_member_records(organization) -> int:
    """All active Member profiles, including plan-locked."""
    return Member.objects.filter(
        organization=organization,
        status=MemberStatus.ACTIVE,
    ).count()


def count_workspace_admins(organization) -> int:
    return WorkspaceStaffAccount.objects.filter(
        organization=organization,
        role=WorkspaceStaffRole.ADMIN,
        status=WorkspaceStaffStatus.ACTIVE,
        plan_unlocked=True,
    ).count()


def count_workspace_staff(organization) -> int:
    return WorkspaceStaffAccount.objects.filter(
        organization=organization,
        role=WorkspaceStaffRole.STAFF,
        status=WorkspaceStaffStatus.ACTIVE,
        plan_unlocked=True,
    ).count()


def count_standard_group_participants(group) -> int:
    if group is None or group.group_type != GroupType.STANDARD:
        return 0
    memberships = GroupMembership.objects.filter(
        group=group,
        status=GroupMembershipStatus.ACTIVE,
        section__isnull=True,
    ).count()
    visitors = GroupOnlyParticipant.objects.filter(
        group=group,
        status=GroupOnlyParticipantStatus.ACTIVE,
        section__isnull=True,
    ).count()
    return memberships + visitors


def count_structured_group_classes(group) -> int:
    if group is None or group.group_type != GroupType.STRUCTURED:
        return 0
    return GroupSection.objects.filter(
        group=group,
        status=GroupSectionStatus.ACTIVE,
    ).count()


def count_class_participants(section) -> int:
    if section is None:
        return 0
    memberships = GroupMembership.objects.filter(
        section=section,
        status=GroupMembershipStatus.ACTIVE,
    ).count()
    visitors = GroupOnlyParticipant.objects.filter(
        section=section,
        status=GroupOnlyParticipantStatus.ACTIVE,
    ).count()
    return memberships + visitors


def get_workspace_usage(organization) -> dict[str, int]:
    """Aggregate workspace-level usage (not per-Group nested limits)."""
    from organizations.entitlements.catalog import FEATURE_STRUCTURED_GROUPS
    from organizations.entitlements.service import has_feature

    active = (
        Group.objects.filter(
            organization=organization,
            status=GroupStatus.ACTIVE,
            plan_unlocked=True,
        )
        .values("group_type")
        .annotate(total=Count("id"))
    )
    by_type = {row["group_type"]: row["total"] for row in active}
    structured_unlocked = (
        int(by_type.get(GroupType.STRUCTURED, 0))
        if has_feature(organization, FEATURE_STRUCTURED_GROUPS)
        else 0
    )
    staff_rows = (
        WorkspaceStaffAccount.objects.filter(
            organization=organization,
            status=WorkspaceStaffStatus.ACTIVE,
            plan_unlocked=True,
        )
        .values("role")
        .annotate(total=Count("id"))
    )
    staff_by_role = {row["role"]: row["total"] for row in staff_rows}
    return {
        LIMIT_ACTIVE_STANDARD_GROUPS: int(by_type.get(GroupType.STANDARD, 0)),
        LIMIT_ACTIVE_STRUCTURED_GROUPS: structured_unlocked,
        LIMIT_ARCHIVED_GROUPS: count_archived_groups(organization),
        LIMIT_MEMBERS: count_members(organization),
        LIMIT_WORKSPACE_ADMINS: int(staff_by_role.get(WorkspaceStaffRole.ADMIN, 0)),
        LIMIT_WORKSPACE_STAFF: int(staff_by_role.get(WorkspaceStaffRole.STAFF, 0)),
    }


def get_workspace_record_totals(organization) -> dict[str, int]:
    """Workspace record totals, including plan-locked rows."""
    active = (
        Group.objects.filter(
            organization=organization,
            status=GroupStatus.ACTIVE,
        )
        .values("group_type")
        .annotate(total=Count("id"))
    )
    by_type = {row["group_type"]: row["total"] for row in active}
    staff_rows = (
        WorkspaceStaffAccount.objects.filter(
            organization=organization,
            status=WorkspaceStaffStatus.ACTIVE,
        )
        .values("role")
        .annotate(total=Count("id"))
    )
    staff_by_role = {row["role"]: row["total"] for row in staff_rows}
    return {
        LIMIT_ACTIVE_STANDARD_GROUPS: int(by_type.get(GroupType.STANDARD, 0)),
        LIMIT_ACTIVE_STRUCTURED_GROUPS: int(by_type.get(GroupType.STRUCTURED, 0)),
        LIMIT_ARCHIVED_GROUPS: _archived_groups_qs(organization).count(),
        LIMIT_MEMBERS: count_member_records(organization),
        LIMIT_WORKSPACE_ADMINS: int(
            staff_by_role.get(WorkspaceStaffRole.ADMIN, 0)
        ),
        LIMIT_WORKSPACE_STAFF: int(
            staff_by_role.get(WorkspaceStaffRole.STAFF, 0)
        ),
    }



def get_usage_for_limit(
    organization,
    limit_key: str,
    *,
    group=None,
    section=None,
) -> int:
    if limit_key == LIMIT_ACTIVE_STANDARD_GROUPS:
        return count_active_standard_groups(organization)
    if limit_key == LIMIT_ACTIVE_STRUCTURED_GROUPS:
        return count_active_structured_groups(organization)
    if limit_key == LIMIT_ARCHIVED_GROUPS:
        return count_archived_groups(organization)
    if limit_key == LIMIT_MEMBERS:
        return count_members(organization)
    if limit_key == LIMIT_WORKSPACE_ADMINS:
        return count_workspace_admins(organization)
    if limit_key == LIMIT_WORKSPACE_STAFF:
        return count_workspace_staff(organization)
    if limit_key == LIMIT_PARTICIPANTS_PER_STANDARD_GROUP:
        return count_standard_group_participants(group)
    if limit_key == LIMIT_CLASSES_PER_STRUCTURED_GROUP:
        return count_structured_group_classes(group)
    if limit_key == LIMIT_PARTICIPANTS_PER_CLASS:
        return count_class_participants(section)
    raise KeyError(f"Unknown usage limit key: {limit_key}")
