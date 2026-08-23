"""Participant identification for kiosk Card and Input modes."""

from groups.models import (
    GroupMembership,
    GroupOnlyParticipant,
    GroupOnlyParticipantStatus,
)
from kiosk_builder.kiosk_settings_constants import KioskInputSecondField, KioskType


def normalize_participant_code(raw):
    return str(raw or "").strip().upper()


def normalize_name(raw):
    return str(raw or "").strip().casefold()


def normalize_email(raw):
    return str(raw or "").strip().casefold()


def membership_participation_email(membership):
    return (membership.participation_email or membership.effective_email or "").strip()


def participant_email(participant):
    return (participant.email or "").strip()


def verify_second_field(*, settings, membership=None, participant=None, data):
    """Verify optional second input field after code lookup."""
    second = settings.input_second_field
    if settings.mode != KioskType.INPUT or settings.input_field_count != 2 or not second:
        return True

    if second == KioskInputSecondField.NAME:
        expected = membership.effective_name if membership else participant.name
        return normalize_name(data.get("name")) == normalize_name(expected)

    if second == KioskInputSecondField.EMAIL:
        if membership:
            expected = membership_participation_email(membership)
        else:
            expected = participant_email(participant)
        return normalize_email(data.get("email")) == normalize_email(expected)

    if second == KioskInputSecondField.PIN:
        pin = data.get("pin") or ""
        if membership:
            return membership.check_effective_pin(pin)
        return participant.check_pin(pin)

    return False


def find_by_participant_code(*, group, organization, code):
    """Return (kind, obj) or (None, None). kind is 'member' or 'group_only_participant'."""
    normalized = normalize_participant_code(code)
    if not normalized:
        return None, None

    membership = (
        GroupMembership.objects.filter(
            organization=organization,
            group=group,
            group_participant_code__iexact=normalized,
        )
        .operational()
        .select_related("member")
        .first()
    )
    if membership:
        return "member", membership

    participant = GroupOnlyParticipant.objects.filter(
        organization=organization,
        group=group,
        status=GroupOnlyParticipantStatus.ACTIVE,
        group_participant_code__iexact=normalized,
    ).first()
    if participant:
        return "group_only_participant", participant

    return None, None
