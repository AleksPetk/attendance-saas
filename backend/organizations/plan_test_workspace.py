"""Local-only Business max-capacity workspace for plan-downgrade manual tests.

Not used by production defaults, billing, or entitlement catalog definitions.
"""

from __future__ import annotations

from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from accounts.deletion import permanently_delete_customer_account
from groups.models import (
    Group,
    GroupMembership,
    GroupOnlyParticipant,
    GroupSection,
    GroupStatus,
    GroupType,
)
from groups.participant_codes import format_group_participant_code
from members.models import Member
from organizations.models import (
    Organization,
    OrganizationPlan,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
)
from organizations.staff_group_access import set_staff_group_access

User = get_user_model()

OWNER_EMAIL = "cursor@gmail.com"
OWNER_PASSWORD = "cursor"
INTERNAL_LABEL = "Plan downgrade test (Business max)"

MEMBER_COUNT = 300
STANDARD_GROUP_COUNT = 30
STRUCTURED_GROUP_COUNT = 15
ARCHIVED_GROUP_COUNT = 50
ADMIN_COUNT = 5
STAFF_COUNT = 25

FULL_STANDARD_PARTICIPANTS = 150
FULL_STRUCTURED_CLASSES = 30
FULL_CLASS_PARTICIPANTS = 150
OTHER_STANDARD_PARTICIPANTS = 20
OTHER_STRUCTURED_CLASSES = 3
OTHER_CLASS_PARTICIPANTS = 10
VISITORS_PER_OTHER_STRUCTURED_CLASS = 8


@dataclass
class PlanTestWorkspaceSummary:
    workspace_id: str
    organization_id: int
    plan: str
    owner_email: str
    members: int
    active_standard_groups: int
    active_structured_groups: int
    archived_groups: int
    admins: int
    staff: int
    classes: int
    max_standard_participants: int
    max_structured_classes: int
    max_class_participants: int
    staff_assignment_pattern: str


def find_existing_owner():
    email = User.objects.normalize_email(OWNER_EMAIL)
    return User.objects.filter(email=email).first()


def destroy_existing_plan_test_workspace():
    owner = find_existing_owner()
    if owner is None:
        return False
    permanently_delete_customer_account(owner)
    return True


def _add_membership(*, organization, group, member, section=None, code_suffix: int):
    membership = GroupMembership(
        organization=organization,
        group=group,
        member=member,
        section=section,
        participation_pin=f"{1000 + (code_suffix % 9000):04d}",
        group_participant_code=format_group_participant_code(group.pk, code_suffix),
    )
    membership.save()
    return membership


def _add_visitor(*, organization, group, section, name: str, code_suffix: int):
    visitor = GroupOnlyParticipant(
        organization=organization,
        group=group,
        section=section,
        name=name,
        participation_pin=f"{2000 + (code_suffix % 8000):04d}",
        group_participant_code=format_group_participant_code(group.pk, code_suffix),
    )
    visitor.save()
    return visitor


def _create_members(organization, log):
    log(f"Creating {MEMBER_COUNT} Members…")
    members = []
    batch = []
    now = timezone.now()
    for index in range(1, MEMBER_COUNT + 1):
        batch.append(
            Member(
                organization=organization,
                name=f"Member {index:03d}",
                created_at=now,
                updated_at=now,
            )
        )
        if len(batch) >= 100:
            Member.objects.bulk_create(batch)
            batch = []
    if batch:
        Member.objects.bulk_create(batch)
    members = list(
        Member.objects.filter(organization=organization).order_by("id")
    )
    if len(members) != MEMBER_COUNT:
        raise RuntimeError(
            f"Expected {MEMBER_COUNT} Members, created {len(members)}."
        )
    return members


def _create_standard_groups(organization, members, log):
    log(f"Creating {STANDARD_GROUP_COUNT} active Standard Groups…")
    groups = []
    for index in range(1, STANDARD_GROUP_COUNT + 1):
        group = Group.objects.create_group(
            organization=organization,
            name=f"Standard Group {index:02d}",
            group_type=GroupType.STANDARD,
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
        )
        groups.append(group)

    # Full participant Standard Group.
    full_group = groups[0]
    log(
        f"  Filling {full_group.name} to {FULL_STANDARD_PARTICIPANTS} participants…"
    )
    for offset, member in enumerate(members[:FULL_STANDARD_PARTICIPANTS], start=1000):
        _add_membership(
            organization=organization,
            group=full_group,
            member=member,
            code_suffix=offset,
        )

    # Remaining Standard Groups reuse Members in rotating windows.
    for group_index, group in enumerate(groups[1:], start=2):
        start = ((group_index - 2) * OTHER_STANDARD_PARTICIPANTS) % MEMBER_COUNT
        window = []
        for i in range(OTHER_STANDARD_PARTICIPANTS):
            window.append(members[(start + i) % MEMBER_COUNT])
        for offset, member in enumerate(window, start=2000):
            _add_membership(
                organization=organization,
                group=group,
                member=member,
                code_suffix=offset + group_index,
            )
        if group_index % 10 == 0:
            log(f"  Populated Standard Groups through {group_index:02d}…")
    return groups


def _create_structured_groups(organization, members, log):
    log(f"Creating {STRUCTURED_GROUP_COUNT} active Structured Groups…")
    groups = []
    for index in range(1, STRUCTURED_GROUP_COUNT + 1):
        group = Group.objects.create_group(
            organization=organization,
            name=f"Structured Group {index:02d}",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            require_class_pin=False,
        )
        groups.append(group)

    full_group = groups[0]
    log(
        f"  Filling {full_group.name} with {FULL_STRUCTURED_CLASSES} Classes "
        f"(Class 01 = {FULL_CLASS_PARTICIPANTS} participants)…"
    )
    classes = []
    for class_index in range(1, FULL_STRUCTURED_CLASSES + 1):
        section = GroupSection.objects.create_section(
            group=full_group,
            name=f"Class {class_index:02d}",
        )
        classes.append(section)

    # Class 01: full 150 Members (unique_member_per_group).
    for offset, member in enumerate(members[:FULL_CLASS_PARTICIPANTS], start=3000):
        _add_membership(
            organization=organization,
            group=full_group,
            member=member,
            section=classes[0],
            code_suffix=offset,
        )

    # Remaining Classes use leftover Members + visitors (cannot reuse 1–150).
    leftover = members[FULL_CLASS_PARTICIPANTS:]
    leftover_cursor = 0
    visitor_suffix = 4000
    for section in classes[1:]:
        take = min(5, len(leftover) - leftover_cursor)
        for i in range(take):
            _add_membership(
                organization=organization,
                group=full_group,
                member=leftover[leftover_cursor + i],
                section=section,
                code_suffix=visitor_suffix,
            )
            visitor_suffix += 1
        leftover_cursor += take
        # Top up each remaining Class with Group-only visitors.
        needed = max(0, 5 - take)
        for i in range(needed):
            _add_visitor(
                organization=organization,
                group=full_group,
                section=section,
                name=f"Visitor {section.name}-{i + 1}",
                code_suffix=visitor_suffix,
            )
            visitor_suffix += 1

    # Other Structured Groups: a few Classes with visitors (and some Members).
    for group_index, group in enumerate(groups[1:], start=2):
        for class_index in range(1, OTHER_STRUCTURED_CLASSES + 1):
            section = GroupSection.objects.create_section(
                group=group,
                name=f"Class {class_index:02d}",
            )
            member_start = ((group_index + class_index) * 7) % MEMBER_COUNT
            for i in range(OTHER_CLASS_PARTICIPANTS):
                member = members[(member_start + i) % MEMBER_COUNT]
                # Skip if already attached to this Structured Group.
                if GroupMembership.objects.filter(group=group, member=member).exists():
                    _add_visitor(
                        organization=organization,
                        group=group,
                        section=section,
                        name=f"Visitor SG{group_index:02d}-C{class_index:02d}-{i + 1}",
                        code_suffix=5000 + group_index * 100 + class_index * 10 + i,
                    )
                else:
                    _add_membership(
                        organization=organization,
                        group=group,
                        member=member,
                        section=section,
                        code_suffix=5000 + group_index * 100 + class_index * 10 + i,
                    )
            for i in range(VISITORS_PER_OTHER_STRUCTURED_CLASS):
                _add_visitor(
                    organization=organization,
                    group=group,
                    section=section,
                    name=(
                        f"Extra Visitor SG{group_index:02d}-"
                        f"C{class_index:02d}-{i + 1}"
                    ),
                    code_suffix=6000 + group_index * 100 + class_index * 10 + i,
                )
        if group_index % 5 == 0:
            log(f"  Populated Structured Groups through {group_index:02d}…")
    return groups


def _create_archived_groups(organization, log):
    log(f"Creating {ARCHIVED_GROUP_COUNT} archived Groups…")
    groups = []
    for index in range(1, ARCHIVED_GROUP_COUNT + 1):
        group = Group.objects.create_group(
            organization=organization,
            name=f"Archived Group {index:02d}",
            group_type=GroupType.STANDARD,
            check_in_enabled=True,
        )
        group.archive()
        groups.append(group)
        if index % 10 == 0:
            log(f"  Archived through {index:02d}…")
    return groups


def _create_staff_accounts(organization, log):
    log(f"Creating {ADMIN_COUNT} Workspace Admins and {STAFF_COUNT} Staff…")
    admins = []
    for index in range(1, ADMIN_COUNT + 1):
        account = WorkspaceStaffAccount.objects.create_account(
            organization=organization,
            username=f"admin{index}",
            email=f"admin{index}@cursor.test",
            password=OWNER_PASSWORD,
            role=WorkspaceStaffRole.ADMIN,
        )
        admins.append(account)

    staff = []
    for index in range(1, STAFF_COUNT + 1):
        account = WorkspaceStaffAccount.objects.create_account(
            organization=organization,
            username=f"staff{index}",
            password=OWNER_PASSWORD,
            role=WorkspaceStaffRole.STAFF,
        )
        staff.append(account)
    return admins, staff


def _assign_staff_groups(organization, staff_accounts, standard_groups, structured_groups, log):
    """
    Predictable Staff ↔ Group access:

    - staff1–5   → Standard Groups 01–06
    - staff6–10  → Standard Groups 07–12
    - staff11–15 → Standard Groups 13–18
    - staff16–20 → Standard Groups 19–24
    - staff21–25 → Standard Groups 25–30 + Structured Groups 01–03

    Each staff member gets multiple Groups.
    """
    log("Assigning Staff Group access…")
    pattern = (
        "staff1-5→Std01-06; staff6-10→Std07-12; staff11-15→Std13-18; "
        "staff16-20→Std19-24; staff21-25→Std25-30+Struct01-03"
    )
    chunks = [
        (0, 5, standard_groups[0:6]),
        (5, 10, standard_groups[6:12]),
        (10, 15, standard_groups[12:18]),
        (15, 20, standard_groups[18:24]),
        (20, 25, standard_groups[24:30] + structured_groups[0:3]),
    ]
    for start, end, group_slice in chunks:
        group_ids = [group.pk for group in group_slice]
        for account in staff_accounts[start:end]:
            set_staff_group_access(
                staff_account=account,
                organization=organization,
                group_ids=group_ids,
            )
    return pattern


def _verify_counts(organization) -> PlanTestWorkspaceSummary:
    from organizations.entitlements.usage import (
        count_active_standard_groups,
        count_active_structured_groups,
        count_archived_groups,
        count_class_participants,
        count_members,
        count_structured_group_classes,
        count_workspace_admins,
        count_workspace_staff,
    )

    standard_groups = list(
        Group.objects.filter(
            organization=organization,
            group_type=GroupType.STANDARD,
            status=GroupStatus.ACTIVE,
        ).order_by("name", "id")
    )
    structured_groups = list(
        Group.objects.filter(
            organization=organization,
            group_type=GroupType.STRUCTURED,
            status=GroupStatus.ACTIVE,
        ).order_by("name", "id")
    )
    max_standard_participants = 0
    if standard_groups:
        from organizations.entitlements.usage import count_standard_group_participants

        max_standard_participants = max(
            count_standard_group_participants(group) for group in standard_groups
        )

    max_classes = 0
    max_class_participants = 0
    total_classes = 0
    for group in structured_groups:
        class_count = count_structured_group_classes(group)
        total_classes += class_count
        max_classes = max(max_classes, class_count)
        for section in group.sections.filter(status="active"):
            max_class_participants = max(
                max_class_participants, count_class_participants(section)
            )

    return PlanTestWorkspaceSummary(
        workspace_id=organization.workspace_id,
        organization_id=organization.pk,
        plan=organization.plan,
        owner_email=organization.owner.email,
        members=count_members(organization),
        active_standard_groups=count_active_standard_groups(organization),
        active_structured_groups=count_active_structured_groups(organization),
        archived_groups=count_archived_groups(organization),
        admins=count_workspace_admins(organization),
        staff=count_workspace_staff(organization),
        classes=total_classes,
        max_standard_participants=max_standard_participants,
        max_structured_classes=max_classes,
        max_class_participants=max_class_participants,
        staff_assignment_pattern="",
    )


@transaction.atomic
def create_plan_test_workspace(*, log=print) -> PlanTestWorkspaceSummary:
    if find_existing_owner() is not None:
        raise RuntimeError(
            f"Owner {OWNER_EMAIL} already exists. Re-run with --reset to rebuild."
        )

    log(f"Creating Owner {OWNER_EMAIL}…")
    owner = User.objects.create_user(
        email=OWNER_EMAIL,
        password=OWNER_PASSWORD,
    )
    owner.mark_email_verified()

    organization = Organization.objects.create_with_owner(
        owner=owner,
        internal_label=INTERNAL_LABEL,
    )
    organization.plan = OrganizationPlan.BUSINESS
    organization.save(update_fields=["plan", "updated_at"])
    log(
        f"Workspace {organization.workspace_id} created on plan={organization.plan}."
    )

    members = _create_members(organization, log)
    standard_groups = _create_standard_groups(organization, members, log)
    structured_groups = _create_structured_groups(organization, members, log)
    _create_archived_groups(organization, log)
    _admins, staff_accounts = _create_staff_accounts(organization, log)
    pattern = _assign_staff_groups(
        organization,
        staff_accounts,
        standard_groups,
        structured_groups,
        log,
    )

    organization.refresh_from_db()
    summary = _verify_counts(organization)
    summary.staff_assignment_pattern = pattern

    expected = {
        "plan": OrganizationPlan.BUSINESS,
        "members": MEMBER_COUNT,
        "active_standard_groups": STANDARD_GROUP_COUNT,
        "active_structured_groups": STRUCTURED_GROUP_COUNT,
        "archived_groups": ARCHIVED_GROUP_COUNT,
        "admins": ADMIN_COUNT,
        "staff": STAFF_COUNT,
        "max_standard_participants": FULL_STANDARD_PARTICIPANTS,
        "max_structured_classes": FULL_STRUCTURED_CLASSES,
        "max_class_participants": FULL_CLASS_PARTICIPANTS,
    }
    actual = {
        "plan": summary.plan,
        "members": summary.members,
        "active_standard_groups": summary.active_standard_groups,
        "active_structured_groups": summary.active_structured_groups,
        "archived_groups": summary.archived_groups,
        "admins": summary.admins,
        "staff": summary.staff,
        "max_standard_participants": summary.max_standard_participants,
        "max_structured_classes": summary.max_structured_classes,
        "max_class_participants": summary.max_class_participants,
    }
    mismatches = {
        key: (expected[key], actual[key])
        for key in expected
        if expected[key] != actual[key]
    }
    if mismatches:
        raise RuntimeError(f"Plan test workspace count mismatch: {mismatches}")

    log("Plan test workspace ready.")
    return summary
