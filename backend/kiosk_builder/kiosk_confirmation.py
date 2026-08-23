"""Confirmation screen message resolution for kiosk perform success."""

import re

from django.utils import timezone

from attendance.models import ActionType
from kiosk_builder.kiosk_settings_constants import (
    ACTION_TYPE_TO_CONFIRMATION_FIELD,
    CONFIRMATION_RETURN_SECONDS_CHOICES,
    CONFIRMATION_RETURN_SECONDS_DEFAULT,
    DEFAULT_CONFIRMATION_MESSAGES,
)

ALLOWED_TEMPLATE_VARIABLES = frozenset({"name", "time", "group"})
_TEMPLATE_VAR_RE = re.compile(r"\{(\w+)\}")


def normalize_return_seconds(value):
    """Map stored value to an allowed return delay (1, 3, or 5 seconds)."""
    try:
        seconds = int(value)
    except (TypeError, ValueError):
        return CONFIRMATION_RETURN_SECONDS_DEFAULT
    if seconds in CONFIRMATION_RETURN_SECONDS_CHOICES:
        return seconds
    return CONFIRMATION_RETURN_SECONDS_DEFAULT


def format_performed_time(performed_at, *, tz=None):
    """Format action time as 24-hour HH:MM in the workspace timezone."""
    if performed_at is None:
        return ""
    active_tz = tz or timezone.get_current_timezone()
    if timezone.is_naive(performed_at):
        performed_at = timezone.make_aware(performed_at, active_tz)
    local = timezone.localtime(performed_at, active_tz)
    return local.strftime("%H:%M")


def render_confirmation_message(
    template_text,
    *,
    name="",
    group_name="",
    performed_at=None,
    tz=None,
):
    """
    Replace supported template variables safely.

    Unknown variables are removed (empty replacement). No code execution.
    """
    time_str = format_performed_time(performed_at, tz=tz)
    replacements = {
        "name": str(name or ""),
        "time": time_str,
        "group": str(group_name or ""),
    }

    def _replace(match):
        key = match.group(1)
        if key in ALLOWED_TEMPLATE_VARIABLES:
            return replacements[key]
        return ""

    return _TEMPLATE_VAR_RE.sub(_replace, str(template_text or ""))


def stored_message_for_action(settings, action_type):
    """Return the stored message template for an action (may be blank)."""
    field_name = ACTION_TYPE_TO_CONFIRMATION_FIELD.get(action_type)
    if not field_name:
        return ""
    return (getattr(settings, field_name, "") or "").strip()


def default_message_for_action(action_type):
    return DEFAULT_CONFIRMATION_MESSAGES.get(action_type, "")


def message_template_for_action(settings, action_type):
    """Stored custom message or product default for the action."""
    stored = stored_message_for_action(settings, action_type)
    if stored:
        return stored
    return default_message_for_action(action_type)


def resolve_confirmation_message(
    settings,
    *,
    group,
    action_type,
    participant_name,
    performed_at=None,
    tz=None,
):
    """Build the display message for a completed kiosk action."""
    template = message_template_for_action(settings, action_type)
    return render_confirmation_message(
        template,
        name=participant_name,
        group_name=group.name if group else "",
        performed_at=performed_at,
        tz=tz,
    )


def confirmation_payload_for_perform(
    settings,
    *,
    group,
    action_type,
    participant_name,
    performed_at,
    tz=None,
):
    """Payload fragment for kiosk perform success responses."""
    return {
        "template": settings.confirmation_template,
        "message": resolve_confirmation_message(
            settings,
            group=group,
            action_type=action_type,
            participant_name=participant_name,
            performed_at=performed_at,
            tz=tz,
        ),
        "return_delay_seconds": normalize_return_seconds(
            settings.confirmation_return_seconds
        ),
        "action": action_type,
    }


def confirmation_settings_payload(settings, *, group):
    """Kiosk start / settings API confirmation block."""
    messages = {}
    for action_type in ActionType.values:
        field = ACTION_TYPE_TO_CONFIRMATION_FIELD.get(action_type)
        if not field:
            continue
        raw = (getattr(settings, field, "") or "").strip()
        messages[action_type] = raw or default_message_for_action(action_type)
    return {
        "template": settings.confirmation_template,
        "return_delay_seconds": normalize_return_seconds(
            settings.confirmation_return_seconds
        ),
        "messages": messages,
        "defaults": dict(DEFAULT_CONFIRMATION_MESSAGES),
        "group_actions": {
            "check_in_enabled": bool(group.check_in_enabled),
            "check_out_enabled": bool(group.check_out_enabled),
            "breaks_enabled": bool(group.breaks_enabled),
        },
    }
