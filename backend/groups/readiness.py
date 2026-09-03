"""Derived Group setup/readiness state for participation requirements."""

from django.db.models import Count, Q

from groups.models import (
    GroupMembership,
    GroupMembershipStatus,
    GroupOnlyParticipant,
    GroupOnlyParticipantStatus,
    GroupSection,
    GroupSectionStatus,
    GroupType,
    group_is_operationally_active,
)
from members.models import MemberStatus


def _operational_memberships(group):
    return GroupMembership.objects.filter(group=group).operational()


def _operational_group_only_participants(group):
    return GroupOnlyParticipant.objects.filter(group=group).operational()


def membership_participation_email(membership):
    from groups.participation_emails import (
        participation_emails_for_membership,
        primary_participation_email,
    )

    return primary_participation_email(participation_emails_for_membership(membership))


def membership_participation_emails(membership):
    from groups.participation_emails import participation_emails_for_membership

    return participation_emails_for_membership(membership)


def membership_has_participation_pin(membership):
    return bool(getattr(membership, "participation_pin_hash", None))


def participant_participation_email(participant):
    from groups.participation_emails import (
        participation_emails_for_visitor,
        primary_participation_email,
    )

    return primary_participation_email(participation_emails_for_visitor(participant))


def participant_participation_emails(participant):
    from groups.participation_emails import participation_emails_for_visitor

    return participation_emails_for_visitor(participant)


def participant_has_participation_pin(participant):
    return bool(getattr(participant, "pin_hash", None))


def _active_sections_with_participant_counts(group):
    return (
        GroupSection.objects.filter(
            group=group,
            status=GroupSectionStatus.ACTIVE,
        )
        .annotate(
            member_count=Count(
                "memberships",
                filter=Q(
                    memberships__status=GroupMembershipStatus.ACTIVE,
                    memberships__member__status=MemberStatus.ACTIVE,
                ),
                distinct=True,
            ),
            visitor_count=Count(
                "group_only_participants",
                filter=Q(
                    group_only_participants__status=GroupOnlyParticipantStatus.ACTIVE
                ),
                distinct=True,
            ),
        )
    )


def compute_group_setup_status(group):
    """
    Return readiness summary for an active Group.

    Archived Members are excluded via operational() on memberships.
    Structured Groups count participants only in active Classes.
    When require_class_pin is ON, every active Class must have a Class PIN.
    Launch also needs at least one Class with operational participants.
    """
    if group is None:
        return {
            "setup_complete": False,
            "missing_email_count": 0,
            "missing_pin_count": 0,
            "missing_class_pin_count": 0,
            "launchable_class_count": 0,
            "operational_participant_count": 0,
        }

    missing_email = 0
    missing_pin = 0
    missing_class_pin = 0
    launchable_class_count = 0
    memberships = list(_operational_memberships(group))
    participants = list(_operational_group_only_participants(group))
    operational_count = len(memberships) + len(participants)

    if group.require_email:
        for membership in memberships:
            if not membership_participation_email(membership):
                missing_email += 1
        for participant in participants:
            if not participant_participation_email(participant):
                missing_email += 1

    if group.require_pin:
        for membership in memberships:
            if not membership_has_participation_pin(membership):
                missing_pin += 1
        for participant in participants:
            if not participant_has_participation_pin(participant):
                missing_pin += 1

    if group.group_type == GroupType.STRUCTURED:
        sections = list(_active_sections_with_participant_counts(group))
        for section in sections:
            participant_total = (section.member_count or 0) + (section.visitor_count or 0)
            if participant_total > 0:
                launchable_class_count += 1
            if group.require_class_pin and not section.has_class_pin:
                missing_class_pin += 1

    participation_ok = True
    if group.require_email or group.require_pin:
        participation_ok = missing_email == 0 and missing_pin == 0
    class_pin_ok = missing_class_pin == 0
    launchable_ok = True
    if group.group_type == GroupType.STRUCTURED:
        launchable_ok = launchable_class_count > 0

    setup_complete = participation_ok and class_pin_ok and launchable_ok

    return {
        "setup_complete": setup_complete,
        "missing_email_count": missing_email,
        "missing_pin_count": missing_pin,
        "missing_class_pin_count": missing_class_pin,
        "launchable_class_count": launchable_class_count,
        "operational_participant_count": operational_count,
    }


def group_setup_status_payload(group):
    status = compute_group_setup_status(group)
    operational = group_is_operationally_active(group) and status["setup_complete"]
    payload = {
        "setup_complete": status["setup_complete"],
        "operational_ready": operational,
        "missing_email_count": status["missing_email_count"],
        "missing_pin_count": status["missing_pin_count"],
    }
    if group and group.group_type == GroupType.STRUCTURED:
        payload["missing_class_pin_count"] = status["missing_class_pin_count"]
        payload["launchable_class_count"] = status["launchable_class_count"]
    return payload


def group_is_operationally_ready(group):
    """Active Group whose participation requirements are satisfied."""
    if not group_is_operationally_active(group):
        return False
    return compute_group_setup_status(group)["setup_complete"]


def group_setup_incomplete_error_payload(group=None):
    status = compute_group_setup_status(group) if group else {}
    detail_parts = []
    if status.get("missing_class_pin_count"):
        count = status["missing_class_pin_count"]
        detail_parts.append(
            f"{count} Class{'es' if count != 1 else ''} need a PIN"
        )
    if (
        group
        and group.group_type == GroupType.STRUCTURED
        and status.get("launchable_class_count", 0) == 0
    ):
        detail_parts.append(
            "Add at least one Class with participants before launching the kiosk"
        )
    if status.get("missing_pin_count"):
        detail_parts.append(
            f"{status['missing_pin_count']} participant(s) need a PIN"
        )
    if status.get("missing_email_count"):
        detail_parts.append(
            f"{status['missing_email_count']} participant(s) need an email"
        )
    detail = (
        "Group setup is incomplete. "
        + (". ".join(detail_parts) if detail_parts else "Complete participant setup.")
        + ("." if detail_parts and not detail_parts[-1].endswith(".") else "")
    )
    return {
        "code": "group_setup_incomplete",
        "detail": detail,
        "missing_email_count": status.get("missing_email_count", 0),
        "missing_pin_count": status.get("missing_pin_count", 0),
        "missing_class_pin_count": status.get("missing_class_pin_count", 0),
        "launchable_class_count": status.get("launchable_class_count", 0),
    }


def structured_group_section_summary(group):
    """Active Class and participant totals for Structured Group detail."""
    if group is None or group.group_type != GroupType.STRUCTURED:
        return {
            "active_section_count": 0,
            "participant_count": 0,
        }
    active_sections = GroupSection.objects.filter(
        group=group,
        status=GroupSectionStatus.ACTIVE,
    )
    return {
        "active_section_count": active_sections.count(),
        "participant_count": compute_group_setup_status(group)[
            "operational_participant_count"
        ],
    }
