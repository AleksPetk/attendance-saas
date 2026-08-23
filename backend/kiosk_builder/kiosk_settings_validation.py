"""Validation and readiness for Group KioskSettings."""

import re

from django.core.exceptions import ValidationError

from groups.models import Group, KioskMode, KioskIdentifierField
from kiosk_builder.kiosk_settings_constants import (
    KioskInputSecondField,
    KioskType,
)

EXIT_CODE_RE = re.compile(r"^[A-Za-z0-9]{4,10}$")


def validate_exit_code(raw):
    code = str(raw or "").strip()
    if not EXIT_CODE_RE.match(code):
        raise ValidationError(
            "Exit code must be 4–10 letters or numbers (no spaces or symbols)."
        )
    return code


def normalize_kiosk_settings_fields(settings, *, group=None):
    """Apply product rules that force field values before validation."""
    from kiosk_builder.kiosk_settings_constants import AttendanceResetMode

    group = group or settings.group
    if settings.mode == KioskType.CARD and settings.use_pin:
        settings.card_show_participant_code = True
    if settings.mode == KioskType.INPUT:
        if settings.input_field_count == 1:
            settings.input_second_field = ""
        elif settings.input_field_count != 2:
            settings.input_field_count = 1
            settings.input_second_field = ""
    if settings.attendance_reset_mode not in AttendanceResetMode.values:
        settings.attendance_reset_mode = AttendanceResetMode.DAILY
    if settings.attendance_reset_rolling_minutes >= 60:
        settings.attendance_reset_rolling_minutes = 0


def normalize_kiosk_settings_for_group_capabilities(settings, *, group=None):
    """
    Clear kiosk PIN/email dependencies when Group participation flags are OFF.

    Mutates settings in place and returns True when any stored field changed.
    """
    group = group or settings.group
    if group is None:
        return False

    changed = False

    if not group.require_pin:
        if settings.use_pin:
            settings.use_pin = False
            changed = True
        if (
            settings.mode == KioskType.INPUT
            and settings.input_field_count == 2
            and settings.input_second_field == KioskInputSecondField.PIN
        ):
            settings.input_field_count = 1
            settings.input_second_field = ""
            changed = True

    if not group.require_email:
        if settings.card_show_email:
            settings.card_show_email = False
            changed = True
        if (
            settings.mode == KioskType.INPUT
            and settings.input_field_count == 2
            and settings.input_second_field == KioskInputSecondField.EMAIL
        ):
            settings.input_field_count = 1
            settings.input_second_field = ""
            changed = True

    before = (
        settings.use_pin,
        settings.card_show_email,
        settings.input_field_count,
        settings.input_second_field,
        settings.card_show_participant_code,
    )
    normalize_kiosk_settings_fields(settings, group=group)
    after = (
        settings.use_pin,
        settings.card_show_email,
        settings.input_field_count,
        settings.input_second_field,
        settings.card_show_participant_code,
    )
    return changed or before != after


def repair_kiosk_settings_for_group_capabilities(settings, *, group=None, save=False):
    """Normalize capability-dependent kiosk fields; optionally persist repairs."""
    group = group or settings.group
    changed = normalize_kiosk_settings_for_group_capabilities(settings, group=group)
    if changed and save:
        settings.save(
            update_fields=[
                "use_pin",
                "card_show_email",
                "input_field_count",
                "input_second_field",
                "card_show_participant_code",
                "updated_at",
            ]
        )
    return changed


def repair_kiosk_settings_for_group(group, *, save=True):
    """Load a Group's kiosk settings and repair capability mismatches."""
    from kiosk_builder.models import ensure_group_kiosk_settings

    settings = ensure_group_kiosk_settings(group)
    repair_kiosk_settings_for_group_capabilities(settings, group=group, save=save)
    return settings


def validate_kiosk_settings(settings, *, group=None):
    """
    Validate KioskSettings against Group participation availability.
    Returns list of human-readable issue strings (empty when valid).
    """
    group = group or settings.group
    if group is None:
        return ["Group is required."]

    normalize_kiosk_settings_fields(settings, group=group)
    issues = []

    if settings.mode == KioskType.CARD:
        if not (
            settings.card_show_name
            or settings.card_show_participant_code
            or settings.card_show_email
        ):
            issues.append("Select at least one card display field.")
        if settings.card_show_email and not group.require_email:
            issues.append(
                "Email display is selected but Email is not enabled for this Group."
            )
        if settings.use_pin and not group.require_pin:
            issues.append(
                "PIN is no longer enabled for this Group."
            )
        if settings.use_pin and not settings.card_show_participant_code:
            issues.append(
                "Group Participant Code must be visible when PIN is required after card selection."
            )

    elif settings.mode == KioskType.INPUT:
        if settings.input_field_count not in (1, 2):
            issues.append("Input field count must be 1 or 2.")
        if settings.input_field_count == 1:
            pass  # code only — enforced by normalization
        elif settings.input_field_count == 2:
            second = settings.input_second_field
            if second not in KioskInputSecondField.values:
                issues.append("Select a valid second identification field.")
            elif second == KioskInputSecondField.EMAIL and not group.require_email:
                issues.append(
                    "Email second field is selected but Email is not enabled for this Group."
                )
            elif second == KioskInputSecondField.PIN and not group.require_pin:
                issues.append(
                    "PIN is no longer enabled for this Group."
                )
    else:
        issues.append("Select Card or Input kiosk type.")

    if not settings.has_exit_code:
        issues.append("Exit code required")

    return issues


def compute_kiosk_readiness(settings, *, group=None):
    """
    Return readiness summary for kiosk launch.
    """
    group = group or settings.group
    repair_kiosk_settings_for_group_capabilities(settings, group=group, save=True)
    issues = validate_kiosk_settings(settings, group=group)
    return {
        "ready": len(issues) == 0,
        "issues": issues,
        "exit_code_configured": settings.has_exit_code,
    }


def kiosk_readiness_payload(settings, *, group=None):
    status = compute_kiosk_readiness(settings, group=group)
    return {
        "ready": status["ready"],
        "issues": status["issues"],
        "exit_code_configured": status["exit_code_configured"],
    }


def migrate_legacy_group_to_settings(group):
    """Build default field dict from deprecated Group kiosk columns."""
    from kiosk_builder.models import KioskSettings

    mode = KioskType.INPUT
    if group.kiosk_mode == KioskMode.MEMBER_LIST:
        mode = KioskType.CARD

    card_show_name = bool(group.kiosk_list_show_name)
    card_show_code = bool(group.kiosk_list_show_identifier)
    card_show_email = bool(group.kiosk_list_show_email)
    if mode == KioskType.CARD and not (
        card_show_name or card_show_code or card_show_email
    ):
        card_show_name = True
        card_show_code = True

    use_pin = False
    input_field_count = 1
    input_second_field = ""

    if mode == KioskType.INPUT:
        f1 = group.kiosk_input_field_1 or ""
        f2 = group.kiosk_input_field_2 or ""
        if f1 == KioskIdentifierField.IDENTIFIER and not f2:
            input_field_count = 1
        elif f2:
            input_field_count = 2
            if f2 == KioskIdentifierField.NAME:
                input_second_field = KioskInputSecondField.NAME
            elif f2 == KioskIdentifierField.EMAIL:
                input_second_field = KioskInputSecondField.EMAIL
            elif f2 == KioskIdentifierField.PIN:
                input_second_field = KioskInputSecondField.PIN
                use_pin = True
            else:
                input_second_field = KioskInputSecondField.NAME
        else:
            input_field_count = 1

    return {
        "organization_id": group.organization_id,
        "mode": mode,
        "card_show_name": card_show_name,
        "card_show_participant_code": card_show_code or mode == KioskType.CARD,
        "card_show_email": card_show_email,
        "use_pin": use_pin,
        "input_field_count": input_field_count,
        "input_second_field": input_second_field,
    }
