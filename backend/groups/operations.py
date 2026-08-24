"""Operational Group rules used by Group APIs, kiosk, and attendance."""

from groups.email_sender import group_email_sender_is_ready, send_after_action_email
from groups.models import GroupType, group_is_operationally_active
from groups.readiness import group_is_operationally_ready, group_setup_incomplete_error_payload
from kiosk_builder.kiosk_settings_validation import compute_kiosk_readiness
from kiosk_builder.models import ensure_group_kiosk_settings


AFTER_CHECK_IN = "check_in"
AFTER_CHECK_OUT = "check_out"
AFTER_BREAK = "break"


def after_action_should_run(group, kind):
    """
    Whether stored after-action notification config may execute.

    Requires an operational Group, the matching action enabled, after-action
    email enabled for that action, and a Ready Group email sender.
    """
    if not group_is_operationally_active(group):
        return False
    if not group_email_sender_is_ready(group):
        return False
    if kind == AFTER_CHECK_IN:
        return bool(group.check_in_enabled and group.send_email_after_check_in)
    if kind == AFTER_CHECK_OUT:
        return bool(group.check_out_enabled and group.send_email_after_check_out)
    if kind == AFTER_BREAK:
        return bool(group.breaks_enabled and group.send_email_after_break)
    return False


def after_action_kind_for_action_type(action_type):
    if action_type == "check_in":
        return AFTER_CHECK_IN
    if action_type == "check_out":
        return AFTER_CHECK_OUT
    if action_type in ("break_start", "break_end"):
        return AFTER_BREAK
    return None


def maybe_run_after_action(
    group,
    action_type,
    *,
    action_record=None,
    membership=None,
    group_only_participant=None,
    timezone_name=None,
):
    """
    Send after-action email when configured.

    Email failures are recorded and must not affect the ActionRecord.
    """
    kind = after_action_kind_for_action_type(action_type)
    if kind is None:
        return False
    if not after_action_should_run(group, kind):
        return False
    if action_record is None:
        return False
    participant_name = ""
    if membership is not None:
        participant_name = membership.effective_name
    elif group_only_participant is not None:
        participant_name = group_only_participant.name
    else:
        participant_name = getattr(action_record, "participant_name_snapshot", "") or ""
    return send_after_action_email(
        group=group,
        kind=kind,
        action_record=action_record,
        participant_name=participant_name,
        membership=membership,
        group_only_participant=group_only_participant,
        timezone_name=timezone_name,
    )


def group_archived_error_payload(detail=None):
    return {
        "code": "group_archived",
        "detail": detail
        or "Archived Groups cannot be edited. Restore the Group first.",
    }


def kiosk_settings_invalid_error_payload(group):
    settings = ensure_group_kiosk_settings(group)
    readiness = compute_kiosk_readiness(settings, group=group)
    return {
        "code": "kiosk_settings_invalid",
        "detail": "Kiosk settings need attention before launch.",
        "issues": readiness["issues"],
        "exit_code_configured": readiness["exit_code_configured"],
    }


def structured_kiosk_deferred_error_payload():
    return {
        "code": "structured_kiosk_deferred",
        "detail": (
            "Structured Group kiosk setup is coming next. "
            "Standard Group kiosks are unchanged."
        ),
    }


def ensure_group_operationally_ready(group):
    """
    Return an error payload when real operations must be blocked.

    Design editing (Kiosk Builder) may remain available; launch/identify/perform
    and automatic attendance require a ready Group.
    """
    if not group_is_operationally_active(group):
        return group_archived_error_payload(
            "This Group is archived and cannot be used operationally."
        )
    if not group_is_operationally_ready(group):
        return group_setup_incomplete_error_payload(group)
    return None


def ensure_kiosk_launch_ready(group):
    """
    Return an error payload when real kiosk launch/operation must be blocked.

    Group setup and kiosk settings must both be valid.
    Structured Groups use Card-only Class → Participant flow.
    """
    blocked = ensure_group_operationally_ready(group)
    if blocked:
        return blocked
    settings = ensure_group_kiosk_settings(group)
    if getattr(group, "group_type", None) == GroupType.STRUCTURED:
        from kiosk_builder.kiosk_settings_validation import (
            repair_kiosk_settings_for_group_capabilities,
        )

        repair_kiosk_settings_for_group_capabilities(settings, group=group, save=True)
        settings.refresh_from_db()
    readiness = compute_kiosk_readiness(settings, group=group)
    if not readiness["ready"]:
        return kiosk_settings_invalid_error_payload(group)
    return None
