"""Persistent resource locks used when a workspace changes plan."""

from __future__ import annotations

from django.db import transaction
from rest_framework.exceptions import ValidationError

from groups.models import Group, GroupStatus, GroupType
from members.models import Member, MemberStatus
from organizations.entitlements.catalog import (
    FEATURE_STRUCTURED_GROUPS,
    LIMIT_ACTIVE_STANDARD_GROUPS,
    LIMIT_ACTIVE_STRUCTURED_GROUPS,
    LIMIT_ARCHIVED_GROUPS,
    LIMIT_MEMBERS,
    LIMIT_WORKSPACE_ADMINS,
    LIMIT_WORKSPACE_STAFF,
)
from organizations.entitlements.exceptions import PlanEntitlementDenied
from organizations.entitlements.service import get_plan_limit, has_feature
from organizations.models import (
    Organization,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
    WorkspaceStaffStatus,
)

SELECTION_KINDS = (
    LIMIT_ACTIVE_STANDARD_GROUPS,
    LIMIT_ARCHIVED_GROUPS,
    LIMIT_MEMBERS,
    LIMIT_WORKSPACE_ADMINS,
    LIMIT_WORKSPACE_STAFF,
)

# One-time exact capacity resolution — no later slot swapping until a new
# plan transition creates unresolved capacity again.
ONE_TIME_SELECTION_KINDS = (
    LIMIT_ACTIVE_STANDARD_GROUPS,
    LIMIT_ARCHIVED_GROUPS,
    LIMIT_MEMBERS,
)

_RESOLVED_FIELDS = {
    LIMIT_ACTIVE_STANDARD_GROUPS: "active_standard_groups_slots_resolved",
    LIMIT_ARCHIVED_GROUPS: "archived_groups_slots_resolved",
    LIMIT_MEMBERS: "members_slots_resolved",
    LIMIT_WORKSPACE_ADMINS: "workspace_admins_slots_resolved",
    LIMIT_WORKSPACE_STAFF: "workspace_staff_slots_resolved",
}


def is_group_plan_unlocked(group) -> bool:
    if group.group_type == GroupType.STRUCTURED and not has_feature(
        group.organization, FEATURE_STRUCTURED_GROUPS
    ):
        return False
    return bool(group.plan_unlocked)


def order_groups_queryset_by_plan_availability(queryset, organization):
    """
    Unlocked/operational Groups first, then plan-locked Groups.

    Structured Groups without the structured_groups feature sort as locked
    even if plan_unlocked remains True in the database.
    Within each availability bucket, keep the canonical name/id ordering.
    """
    from django.db.models import Case, IntegerField, Value, When

    if has_feature(organization, FEATURE_STRUCTURED_GROUPS):
        availability = Case(
            When(plan_unlocked=True, then=Value(0)),
            default=Value(1),
            output_field=IntegerField(),
        )
    else:
        availability = Case(
            When(group_type=GroupType.STRUCTURED, then=Value(1)),
            When(plan_unlocked=True, then=Value(0)),
            default=Value(1),
            output_field=IntegerField(),
        )
    return queryset.order_by(availability, "name", "id")


def is_staff_account_plan_unlocked(account) -> bool:
    return bool(account.plan_unlocked)


def order_staff_queryset_by_plan_availability(queryset):
    """
    Unlocked Admins, unlocked Staff, then locked Admins, locked Staff.

    Within each bucket keep username/id ordering.
    """
    from django.db.models import Case, IntegerField, Value, When

    availability = Case(
        When(plan_unlocked=True, then=Value(0)),
        default=Value(1),
        output_field=IntegerField(),
    )
    role_order = Case(
        When(role=WorkspaceStaffRole.ADMIN, then=Value(0)),
        When(role=WorkspaceStaffRole.STAFF, then=Value(1)),
        default=Value(2),
        output_field=IntegerField(),
    )
    return queryset.order_by(availability, role_order, "username", "id")


def is_member_plan_unlocked(member) -> bool:
    return bool(member.plan_unlocked)


def order_members_queryset_by_plan_availability(queryset):
    """Unlocked Members first, then plan-locked; name/id within each bucket."""
    from django.db.models import Case, IntegerField, Value, When

    availability = Case(
        When(plan_unlocked=True, then=Value(0)),
        default=Value(1),
        output_field=IntegerField(),
    )
    return queryset.order_by(availability, "name", "id")


def can_operate_group(organization, group) -> bool:
    return bool(
        group
        and group.organization_id == organization.pk
        and is_group_plan_unlocked(group)
    )


def can_reuse_member_for_new_participation(organization, member) -> bool:
    """Reusable Member profile may start a new Group participation."""
    return bool(
        member
        and member.organization_id == organization.pk
        and member.status == MemberStatus.ACTIVE
        and is_member_plan_unlocked(member)
    )


def require_group_plan_unlocked(group):
    if is_group_plan_unlocked(group):
        return
    raise PlanEntitlementDenied(
        code="plan_resource_locked",
        message="This Group is locked by the current workspace plan.",
        plan_key=group.organization.plan,
    )


def require_staff_account_plan_unlocked(account):
    if is_staff_account_plan_unlocked(account):
        return
    raise PlanEntitlementDenied(
        code="plan_resource_locked",
        message="This workspace account is locked by the current plan.",
        plan_key=account.organization.plan,
    )


def require_member_plan_unlocked(member):
    if is_member_plan_unlocked(member):
        return
    raise PlanEntitlementDenied(
        code="plan_resource_locked",
        message="This Member is locked by the current workspace plan.",
        plan_key=member.organization.plan,
    )


def require_no_unresolved_group_selection(organization):
    if (
        organization.active_standard_groups_slots_resolved
        and organization.archived_groups_slots_resolved
    ):
        return
    raise PlanEntitlementDenied(
        code="plan_selection_required",
        message="Choose which existing Groups remain available before creating another Group.",
        plan_key=organization.plan,
    )


def require_no_unresolved_member_selection(organization):
    if organization.members_slots_resolved:
        return
    raise PlanEntitlementDenied(
        code="plan_selection_required",
        message="Choose which existing Members remain available before managing Member profiles.",
        plan_key=organization.plan,
    )


def _group_candidates(organization, kind):
    queryset = Group.objects.filter(organization=organization)
    if kind == LIMIT_ACTIVE_STANDARD_GROUPS:
        return queryset.filter(
            status=GroupStatus.ACTIVE,
            group_type=GroupType.STANDARD,
        )
    if kind == LIMIT_ARCHIVED_GROUPS:
        return queryset.filter(status=GroupStatus.ARCHIVED)
    raise KeyError(kind)


def _member_candidates(organization):
    return Member.objects.filter(
        organization=organization,
        status=MemberStatus.ACTIVE,
    )


def _staff_candidates(organization, kind, *, active_only=True):
    role = {
        LIMIT_WORKSPACE_ADMINS: WorkspaceStaffRole.ADMIN,
        LIMIT_WORKSPACE_STAFF: WorkspaceStaffRole.STAFF,
    }[kind]
    queryset = WorkspaceStaffAccount.objects.filter(
        organization=organization,
        role=role,
    )
    if active_only:
        queryset = queryset.filter(status=WorkspaceStaffStatus.ACTIVE)
    return queryset


def _candidate_queryset(organization, kind):
    if kind in (LIMIT_ACTIVE_STANDARD_GROUPS, LIMIT_ARCHIVED_GROUPS):
        return _group_candidates(organization, kind)
    if kind == LIMIT_MEMBERS:
        return _member_candidates(organization)
    if kind in (LIMIT_WORKSPACE_ADMINS, LIMIT_WORKSPACE_STAFF):
        return _staff_candidates(organization, kind)
    raise ValidationError({"kind": "Unknown plan-lock selection kind."})


def _sync_selectable_category(organization, kind):
    candidates = _candidate_queryset(organization, kind)
    total = candidates.count()
    limit = get_plan_limit(organization, kind)
    resolved_field = _RESOLVED_FIELDS[kind]
    was_resolved = bool(getattr(organization, resolved_field))
    unlocked_count = candidates.filter(plan_unlocked=True).count()

    if kind in (LIMIT_WORKSPACE_ADMINS, LIMIT_WORKSPACE_STAFF):
        all_records = _staff_candidates(organization, kind, active_only=False)
    elif kind == LIMIT_MEMBERS:
        # Active Members are the capacity candidates; archived stay lifecycle-only.
        all_records = candidates
    else:
        all_records = candidates

    if limit == 0:
        all_records.update(plan_unlocked=False)
        setattr(organization, resolved_field, True)
    elif total <= limit:
        # Fits entirely — unlock all and resolve (upgrade or under-capacity).
        candidates.update(plan_unlocked=True)
        setattr(organization, resolved_field, True)
    elif kind in ONE_TIME_SELECTION_KINDS:
        # Over capacity: lock everything until Owner completes one-time selection.
        all_records.update(plan_unlocked=False)
        setattr(organization, resolved_field, False)
    elif was_resolved and unlocked_count == limit:
        # Staff/Admin: preserve a still-valid prior subset across plan changes.
        setattr(organization, resolved_field, True)
    else:
        all_records.update(plan_unlocked=False)
        setattr(organization, resolved_field, False)


@transaction.atomic
def sync_plan_locks_after_plan_change(organization):
    organization = Organization.objects.select_for_update().get(pk=organization.pk)

    structured = Group.objects.filter(
        organization=organization,
        group_type=GroupType.STRUCTURED,
    )
    structured_enabled = has_feature(organization, FEATURE_STRUCTURED_GROUPS)
    structured_limit = get_plan_limit(
        organization, LIMIT_ACTIVE_STRUCTURED_GROUPS
    )
    if not structured_enabled or structured_limit <= 0:
        structured.update(plan_unlocked=False)
    else:
        active_structured = structured.filter(status=GroupStatus.ACTIVE).order_by("id")
        active_ids = list(active_structured.values_list("id", flat=True))
        unlocked_ids = active_ids[:structured_limit]
        active_structured.update(plan_unlocked=False)
        if unlocked_ids:
            Group.objects.filter(pk__in=unlocked_ids).update(plan_unlocked=True)

    for kind in SELECTION_KINDS:
        _sync_selectable_category(organization, kind)

    # Archived selection must not re-enable a plan-excluded Structured Group.
    if not structured_enabled:
        structured.update(plan_unlocked=False)

    organization.save(
        update_fields=[
            "active_standard_groups_slots_resolved",
            "archived_groups_slots_resolved",
            "members_slots_resolved",
            "workspace_admins_slots_resolved",
            "workspace_staff_slots_resolved",
            "updated_at",
        ]
    )
    return organization


def plan_locks_are_inconsistent(organization) -> bool:
    """
    Detect lock state that cannot be valid for the current plan.

    Happens when plan was Basic before lock-sync existed, or plan was updated
    without going through Organization.save() plan-change hooks.
    Structured access is also feature-gated, so DB plan_unlocked may still be True.
    """
    structured_enabled = has_feature(organization, FEATURE_STRUCTURED_GROUPS)
    if not structured_enabled and Group.objects.filter(
        organization=organization,
        group_type=GroupType.STRUCTURED,
        plan_unlocked=True,
    ).exists():
        return True

    for kind in SELECTION_KINDS:
        candidates = _candidate_queryset(organization, kind)
        total = candidates.count()
        limit = get_plan_limit(organization, kind)
        unlocked = candidates.filter(plan_unlocked=True).count()
        resolved = bool(getattr(organization, _RESOLVED_FIELDS[kind]))

        if total <= limit:
            if unlocked != total or not resolved:
                return True
            continue

        # Over capacity: never more unlocked than the plan allows.
        if unlocked > limit:
            return True
        # Unresolved downgrade must keep every candidate locked until selection.
        if not resolved and unlocked > 0:
            return True
    return False


@transaction.atomic
def ensure_plan_locks_consistent(organization):
    """Repair invalid lock state so UI/API match current plan capacity."""
    organization = Organization.objects.select_for_update().get(pk=organization.pk)
    if not plan_locks_are_inconsistent(organization):
        return organization
    return sync_plan_locks_after_plan_change(organization)


def _category_counts(organization, kind):
    candidates = _candidate_queryset(organization, kind)
    total = candidates.count()
    unlocked = candidates.filter(plan_unlocked=True).count()
    return {"total": total, "unlocked": unlocked, "locked": total - unlocked}


def get_plan_lock_state(organization) -> dict:
    counts = {kind: _category_counts(organization, kind) for kind in SELECTION_KINDS}
    structured_locked_count = Group.objects.filter(
        organization=organization,
        group_type=GroupType.STRUCTURED,
    ).exclude(plan_unlocked=True).count()
    return {
        "groups_selection_required": (
            not organization.active_standard_groups_slots_resolved
            and counts[LIMIT_ACTIVE_STANDARD_GROUPS]["total"]
            > get_plan_limit(organization, LIMIT_ACTIVE_STANDARD_GROUPS)
        ),
        "archived_groups_selection_required": (
            not organization.archived_groups_slots_resolved
            and counts[LIMIT_ARCHIVED_GROUPS]["total"]
            > get_plan_limit(organization, LIMIT_ARCHIVED_GROUPS)
        ),
        "members_selection_required": (
            not organization.members_slots_resolved
            and counts[LIMIT_MEMBERS]["total"]
            > get_plan_limit(organization, LIMIT_MEMBERS)
        ),
        "admins_selection_required": (
            not organization.workspace_admins_slots_resolved
            and counts[LIMIT_WORKSPACE_ADMINS]["total"]
            > get_plan_limit(organization, LIMIT_WORKSPACE_ADMINS)
        ),
        "staff_selection_required": (
            not organization.workspace_staff_slots_resolved
            and counts[LIMIT_WORKSPACE_STAFF]["total"]
            > get_plan_limit(organization, LIMIT_WORKSPACE_STAFF)
        ),
        "locked_counts": {key: value["locked"] for key, value in counts.items()},
        "unlocked_counts": {key: value["unlocked"] for key, value in counts.items()},
        "totals": {key: value["total"] for key, value in counts.items()},
        "structured_locked": bool(structured_locked_count),
        "structured_locked_count": structured_locked_count,
    }


def list_selection_candidates(organization, kind):
    queryset = _candidate_queryset(organization, kind).order_by("id")
    if kind in (LIMIT_ACTIVE_STANDARD_GROUPS, LIMIT_ARCHIVED_GROUPS):
        return [
            {
                "id": item.pk,
                "name": item.name,
                "group_type": item.group_type,
                "status": item.status,
                "plan_unlocked": is_group_plan_unlocked(item),
            }
            for item in queryset
        ]
    if kind == LIMIT_MEMBERS:
        return [
            {
                "id": item.pk,
                "name": item.name,
                "email": item.email,
                "status": item.status,
                "plan_unlocked": item.plan_unlocked,
            }
            for item in queryset
        ]
    return [
        {
            "id": item.pk,
            "username": item.username,
            "email": item.email,
            "role": item.role,
            "status": item.status,
            "plan_unlocked": item.plan_unlocked,
        }
        for item in queryset
    ]


@transaction.atomic
def apply_slot_selection(
    organization, kind, selected_ids, *, actor_user=None
):
    if kind not in SELECTION_KINDS:
        raise ValidationError({"kind": "Unknown plan-lock selection kind."})
    try:
        selected = {int(value) for value in selected_ids}
    except (TypeError, ValueError):
        raise ValidationError({"selected_ids": "IDs must be integers."})

    organization = Organization.objects.select_for_update().get(pk=organization.pk)
    candidates = _candidate_queryset(organization, kind).select_for_update()
    candidate_ids = set(candidates.values_list("id", flat=True))
    if not selected.issubset(candidate_ids):
        raise ValidationError(
            {"selected_ids": "Every selected record must belong to this workspace and category."}
        )

    limit = get_plan_limit(organization, kind)
    resolved_field = _RESOLVED_FIELDS[kind]
    already_resolved = bool(getattr(organization, resolved_field))
    required_count = min(limit, len(candidate_ids))

    # One-time downgrade resolution — no later slot swapping.
    if kind in ONE_TIME_SELECTION_KINDS and already_resolved:
        label = "Member" if kind == LIMIT_MEMBERS else "Group"
        raise ValidationError(
            {
                "detail": (
                    f"{label} capacity for this plan has already been resolved. "
                    "Availability can only be re-selected after a later plan change "
                    "that creates a new unresolved capacity state."
                )
            }
        )

    if len(selected) > limit:
        raise ValidationError(
            {"selected_ids": f"Select no more than {limit} record(s)."}
        )

    # Exact capacity on first resolve (and always for one-time kinds).
    if kind in ONE_TIME_SELECTION_KINDS or not already_resolved:
        if len(selected) != required_count:
            raise ValidationError(
                {"selected_ids": f"Select exactly {required_count} record(s)."}
            )

    if kind in (LIMIT_WORKSPACE_ADMINS, LIMIT_WORKSPACE_STAFF):
        _staff_candidates(organization, kind, active_only=False).update(
            plan_unlocked=False
        )
    else:
        candidates.update(plan_unlocked=False)
    if selected:
        candidates.filter(pk__in=selected).update(plan_unlocked=True)

    if kind == LIMIT_ARCHIVED_GROUPS and not has_feature(
        organization, FEATURE_STRUCTURED_GROUPS
    ):
        Group.objects.filter(
            organization=organization,
            status=GroupStatus.ARCHIVED,
            group_type=GroupType.STRUCTURED,
        ).update(plan_unlocked=False)

    setattr(organization, resolved_field, True)
    organization.save(update_fields=[resolved_field, "updated_at"])
    return list_selection_candidates(organization, kind)
