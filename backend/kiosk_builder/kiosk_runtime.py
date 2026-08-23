"""Build kiosk API payloads from KioskSettings + Group."""

from django.db.models import Count, Q

from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupOnlyParticipant,
    GroupOnlyParticipantStatus,
    GroupSection,
    GroupSectionStatus,
    GroupType,
    KioskMode,
)
from kiosk_builder.kiosk_confirmation import confirmation_settings_payload
from kiosk_builder.kiosk_settings_constants import KioskInputSecondField, KioskType
from kiosk_builder.models import KioskSettings, ensure_group_kiosk_settings
from members.models import MemberStatus


def kiosk_mode_api_value(settings: KioskSettings) -> str:
    """API kiosk_mode for frontend: 'card' or 'input'."""
    return settings.mode


def legacy_kiosk_mode(settings: KioskSettings) -> str:
    """Map to legacy member_list/input strings where needed."""
    if settings.mode == KioskType.CARD:
        return KioskMode.MEMBER_LIST
    return KioskMode.INPUT


def input_fields_payload(settings: KioskSettings):
    if settings.mode != KioskType.INPUT:
        return []
    fields = ["participant_code"]
    if settings.input_field_count == 2 and settings.input_second_field:
        fields.append(settings.input_second_field)
    return fields


def kiosk_settings_payload(group: Group, settings: KioskSettings):
    confirmation = confirmation_settings_payload(settings, group=group)
    return_delay = confirmation["return_delay_seconds"]
    structured = group.group_type == GroupType.STRUCTURED
    payload = {
        "kiosk_mode": KioskType.CARD if structured else kiosk_mode_api_value(settings),
        "theme": group.kiosk_theme,
        "title": group.kiosk_title or group.name,
        "welcome_text": group.kiosk_welcome_text,
        "confirmation": confirmation,
        "return_delay_seconds": return_delay,
        "use_pin": settings.use_pin,
        "card_display": {
            "show_name": settings.card_show_name,
            "show_participant_code": settings.card_show_participant_code,
            "show_email": settings.card_show_email,
        },
        "input_fields": [] if structured else input_fields_payload(settings),
        "input_field_count": 1 if structured else settings.input_field_count,
        "input_second_field": None if structured else (settings.input_second_field or None),
        "structured": structured,
        "require_class_pin": bool(structured and group.require_class_pin),
        "participant_code_label": (
            "Class Participant Code" if structured else "Group Participant Code"
        ),
        "return_to": "classes" if structured else "start",
    }
    return payload


def participant_card_payload(*, request, settings, membership=None, participant=None, absolute_file_url):
    if membership:
        code = membership.group_participant_code
        return {
            "participant_kind": "member",
            "membership_id": membership.id,
            "member_id": membership.member_id,
            "section_id": membership.section_id,
            "name": membership.effective_name if settings.card_show_name else None,
            "participant_code": code if settings.card_show_participant_code else None,
            "email": membership_participation_email(membership)
            if settings.card_show_email
            else None,
            "requires_pin": settings.use_pin,
        }
    code = participant.group_participant_code
    return {
        "participant_kind": "group_only_participant",
        "group_only_participant_id": participant.id,
        "section_id": participant.section_id,
        "name": participant.name if settings.card_show_name else None,
        "participant_code": code if settings.card_show_participant_code else None,
        "email": participant.email if settings.card_show_email else None,
        "requires_pin": settings.use_pin,
    }


def membership_participation_email(membership):
    email = (membership.participation_email or "").strip()
    if email:
        return email
    return (membership.effective_email or "").strip()


def build_card_people(
    *,
    request,
    group,
    organization,
    settings,
    absolute_file_url,
    section=None,
):
    memberships = (
        GroupMembership.objects.filter(organization=organization, group=group)
        .operational()
        .select_related("member", "section")
    )
    participants = GroupOnlyParticipant.objects.filter(
        organization=organization,
        group=group,
    ).operational()
    if section is not None:
        memberships = memberships.filter(section=section)
        participants = participants.filter(section=section)
    elif group.group_type == GroupType.STRUCTURED:
        # Structured start loads Class cards first; never dump all people.
        return []

    people = []
    for m in memberships:
        people.append(
            participant_card_payload(
                request=request,
                settings=settings,
                membership=m,
                absolute_file_url=absolute_file_url,
            )
        )
    for p in participants:
        people.append(
            participant_card_payload(
                request=request,
                settings=settings,
                participant=p,
                absolute_file_url=absolute_file_url,
            )
        )
    return people


def build_structured_class_cards(*, group, organization):
    """
    Active Classes with at least one operational participant.

    Empty Classes are hidden to avoid dead-end kiosk taps.
    Class PIN values are never included.
    """
    sections = (
        GroupSection.objects.filter(
            organization=organization,
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
        .order_by("name", "id")
    )
    cards = []
    for section in sections:
        participant_count = (section.member_count or 0) + (section.visitor_count or 0)
        if participant_count <= 0:
            continue
        cards.append(
            {
                "id": section.id,
                "name": section.name,
                "participant_count": participant_count,
                "requires_class_pin": bool(group.require_class_pin),
            }
        )
    return cards


def get_active_kiosk_section(*, group, organization, section_id):
    return GroupSection.objects.filter(
        pk=section_id,
        group=group,
        organization=organization,
        status=GroupSectionStatus.ACTIVE,
    ).first()


def get_kiosk_settings_for_group(group):
    return ensure_group_kiosk_settings(group)
