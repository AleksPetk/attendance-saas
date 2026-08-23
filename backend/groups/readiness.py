"""Derived Group setup/readiness state for participation requirements."""

from groups.models import (
    Group,
    GroupMembership,
    GroupOnlyParticipant,
    GroupOnlyParticipantStatus,
    GroupStatus,
    group_is_operationally_active,
)


def _operational_memberships(group):
    return GroupMembership.objects.filter(group=group).operational()


def _operational_group_only_participants(group):
    return GroupOnlyParticipant.objects.filter(
        group=group,
        status=GroupOnlyParticipantStatus.ACTIVE,
    )


def membership_participation_email(membership):
    return (membership.participation_email or "").strip()


def membership_has_participation_pin(membership):
    return bool((membership.participation_pin or "").strip()) or bool(
        membership.override_pin_hash
    )


def participant_participation_email(participant):
    return (participant.email or "").strip()


def participant_has_participation_pin(participant):
    return bool((participant.participation_pin or "").strip()) or bool(participant.pin_hash)


def compute_group_setup_status(group):
    """
    Return readiness summary for an active Group.

    Archived Members are excluded via operational() on memberships.
    """
    if group is None:
        return {
            "setup_complete": False,
            "missing_email_count": 0,
            "missing_pin_count": 0,
            "operational_participant_count": 0,
        }

    missing_email = 0
    missing_pin = 0
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

    if not group.require_email and not group.require_pin:
        setup_complete = True
    else:
        setup_complete = missing_email == 0 and missing_pin == 0

    return {
        "setup_complete": setup_complete,
        "missing_email_count": missing_email,
        "missing_pin_count": missing_pin,
        "operational_participant_count": operational_count,
    }


def group_setup_status_payload(group):
    status = compute_group_setup_status(group)
    operational = group_is_operationally_active(group) and status["setup_complete"]
    return {
        "setup_complete": status["setup_complete"],
        "operational_ready": operational,
        "missing_email_count": status["missing_email_count"],
        "missing_pin_count": status["missing_pin_count"],
    }


def group_is_operationally_ready(group):
    """Active Group whose participation requirements are satisfied."""
    if not group_is_operationally_active(group):
        return False
    return compute_group_setup_status(group)["setup_complete"]


def group_setup_incomplete_error_payload(group=None):
    status = compute_group_setup_status(group) if group else {}
    detail_parts = []
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
    )
    return {
        "code": "group_setup_incomplete",
        "detail": detail,
        "missing_email_count": status.get("missing_email_count", 0),
        "missing_pin_count": status.get("missing_pin_count", 0),
    }
