"""Build kiosk API payloads from KioskSettings + Group."""

from groups.models import (
    Group,
    GroupMembership,
    GroupOnlyParticipant,
    GroupOnlyParticipantStatus,
    KioskMode,
)
from kiosk_builder.kiosk_confirmation import confirmation_settings_payload
from kiosk_builder.kiosk_settings_constants import KioskInputSecondField, KioskType
from kiosk_builder.models import KioskSettings, ensure_group_kiosk_settings


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
    return {
        "kiosk_mode": kiosk_mode_api_value(settings),
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
        "input_fields": input_fields_payload(settings),
        "input_field_count": settings.input_field_count,
        "input_second_field": settings.input_second_field or None,
    }


def participant_card_payload(*, request, settings, membership=None, participant=None, absolute_file_url):
    if membership:
        code = membership.group_participant_code
        return {
            "participant_kind": "member",
            "membership_id": membership.id,
            "member_id": membership.member_id,
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


def build_card_people(*, request, group, organization, settings, absolute_file_url):
    memberships = (
        GroupMembership.objects.filter(organization=organization, group=group)
        .operational()
        .select_related("member")
    )
    participants = GroupOnlyParticipant.objects.filter(
        organization=organization,
        group=group,
        status=GroupOnlyParticipantStatus.ACTIVE,
    )
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


def get_kiosk_settings_for_group(group):
    return ensure_group_kiosk_settings(group)
