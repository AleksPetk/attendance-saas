import datetime

from django.core.exceptions import ValidationError
from django.utils import timezone

from attendance.exceptions import AttendanceValidationError
from attendance.models import ActionRecord, ActionSource, ActionType
from groups.models import (
    Group,
    GroupOnlyParticipant,
    GroupMembership,
)


def _participant_filter(*, group: Group, participant_kind: str, member_id=None, participant_id=None):
    base = {
        "group_id": group.id,
        "participant_kind": participant_kind,
    }
    if participant_kind == "member":
        base["member_id"] = member_id
    elif participant_kind == "group_only_participant":
        base["group_only_participant_id"] = participant_id
    else:
        raise ValidationError("Invalid participant kind.")
    return base


def compute_current_attendance_state(*, group: Group, participant_kind: str, member_id=None, participant_id=None):
    """
    Compute the current attendance state strictly from ActionRecords.

    Rules implemented by this slice:
    - check-in toggles attendance on
    - check-out toggles attendance off
    - break_start/break_end manage an "on break" state inside a check-in cycle
    - max-breaks caps number of break_start records per check-in cycle
    """

    qs = ActionRecord.objects.filter(
        **_participant_filter(
            group=group,
            participant_kind=participant_kind,
            member_id=member_id,
            participant_id=participant_id,
        )
    ).order_by("performed_at", "id")

    last_check_in = None
    last_check_out = None
    last_break_start = None
    last_break_end = None

    for ar in qs:
        if ar.action_type == ActionType.CHECK_IN:
            last_check_in = ar
        elif ar.action_type == ActionType.CHECK_OUT:
            last_check_out = ar
        elif ar.action_type == ActionType.BREAK_START:
            last_break_start = ar
        elif ar.action_type == ActionType.BREAK_END:
            last_break_end = ar

    is_checked_in = bool(last_check_in) and (not last_check_out or last_check_in.performed_at > last_check_out.performed_at)
    if not is_checked_in:
        return {
            "is_checked_in": False,
            "is_on_break": False,
            "break_count": 0,
        }

    # Break calculations only matter within the current check-in cycle.
    cycle_start = last_check_in.performed_at
    cycle_end = last_check_out.performed_at if last_check_out else None

    break_qs = qs.filter(performed_at__gte=cycle_start)
    if cycle_end:
        break_qs = break_qs.filter(performed_at__lt=cycle_end)

    break_count = break_qs.filter(action_type=ActionType.BREAK_START).count()
    # On break if last break_start is newer than last break_end within the cycle.
    cycle_last_break_start = break_qs.filter(action_type=ActionType.BREAK_START).order_by("performed_at", "id").last()
    cycle_last_break_end = break_qs.filter(action_type=ActionType.BREAK_END).order_by("performed_at", "id").last()

    is_on_break = bool(cycle_last_break_start) and (not cycle_last_break_end or cycle_last_break_start.performed_at > cycle_last_break_end.performed_at)

    return {
        "is_checked_in": True,
        "is_on_break": is_on_break,
        "break_count": break_count,
    }

def ensure_automatic_check_in_action_record_for_membership(*, group: Group, membership: GroupMembership, now=None):
    if not group.automatic_check_in_enabled:
        return {"created": False, "due": False, "performed_at": None}
    if now is None:
        now = timezone.now()
    if group.automatic_check_in_time is None:
        return {"created": False, "due": False, "performed_at": None}

    scheduled_dt = timezone.make_aware(
        datetime.datetime.combine(now.date(), group.automatic_check_in_time),
        timezone.get_current_timezone(),
    )
    due = now >= scheduled_dt
    if not due:
        return {"created": False, "due": False, "performed_at": scheduled_dt}

    existing = ActionRecord.objects.filter(
        group=group,
        participant_kind="member",
        member_id=membership.member_id,
        action_type=ActionType.CHECK_IN,
        source=ActionSource.AUTOMATIC,
        performed_at__date=now.date(),
    ).first()
    if existing:
        return {"created": False, "due": True, "performed_at": existing.performed_at}

    ar = ActionRecord.objects.create(
        organization=group.organization,
        group=group,
        participant_kind="member",
        member=membership.member,
        action_type=ActionType.CHECK_IN,
        source=ActionSource.AUTOMATIC,
        performed_at=scheduled_dt,
        participant_name_snapshot=membership.effective_name,
        participant_email_snapshot=membership.effective_email,
        participant_check_in_identifier_snapshot=membership.effective_check_in_identifier,
        kiosk_note_snapshot="automatic_check_in",
    )
    return {"created": True, "due": True, "performed_at": ar.performed_at}


def ensure_automatic_check_in_action_record_for_participant(*, group: Group, participant: GroupOnlyParticipant, now=None):
    if not group.automatic_check_in_enabled:
        return {"created": False, "due": False, "performed_at": None}
    if now is None:
        now = timezone.now()
    if group.automatic_check_in_time is None:
        return {"created": False, "due": False, "performed_at": None}

    scheduled_dt = timezone.make_aware(
        datetime.datetime.combine(now.date(), group.automatic_check_in_time),
        timezone.get_current_timezone(),
    )
    due = now >= scheduled_dt
    if not due:
        return {"created": False, "due": False, "performed_at": scheduled_dt}

    existing = ActionRecord.objects.filter(
        group=group,
        participant_kind="group_only_participant",
        group_only_participant_id=participant.id,
        action_type=ActionType.CHECK_IN,
        source=ActionSource.AUTOMATIC,
        performed_at__date=now.date(),
    ).first()
    if existing:
        return {"created": False, "due": True, "performed_at": existing.performed_at}

    ar = ActionRecord.objects.create(
        organization=group.organization,
        group=group,
        participant_kind="group_only_participant",
        group_only_participant=participant,
        action_type=ActionType.CHECK_IN,
        source=ActionSource.AUTOMATIC,
        performed_at=scheduled_dt,
        participant_name_snapshot=participant.name,
        participant_email_snapshot=participant.email,
        participant_check_in_identifier_snapshot=participant.check_in_identifier,
        kiosk_note_snapshot="automatic_check_in",
    )
    return {"created": True, "due": True, "performed_at": ar.performed_at}


def get_valid_actions_for_state(*, group: Group, state: dict):
    allowed = []
    if group.check_in_enabled and not state["is_checked_in"]:
        allowed.append(ActionType.CHECK_IN)
    # Support check-out-only Groups (no check-in action exists in this workflow).
    # In that case, the kiosk must allow check-out from the starting state.
    if group.check_out_enabled and (
        (state["is_checked_in"] and not state["is_on_break"]) or (not group.check_in_enabled)
    ):
        allowed.append(ActionType.CHECK_OUT)
    if group.breaks_enabled and state["is_checked_in"]:
        if not state["is_on_break"] and state["break_count"] < (group.max_breaks or 0):
            allowed.append(ActionType.BREAK_START)
        if state["is_on_break"]:
            allowed.append(ActionType.BREAK_END)
    return allowed


def perform_action_record_from_kiosk(
    *,
    group: Group,
    participant_kind: str,
    action_type: str,
    member=None,
    group_only_participant=None,
    membership=None,
    pin_verified=False,
    snapshot=None,
    now=None,
):
    if now is None:
        now = timezone.now()

    if participant_kind == "member":
        if membership is None:
            raise AttendanceValidationError("missing_membership", "Member actions require GroupMembership for effective values.")
        state = compute_current_attendance_state(group=group, participant_kind="member", member_id=membership.member_id)
    elif participant_kind == "group_only_participant":
        if group_only_participant is None:
            raise AttendanceValidationError("missing_participant", "Group-only participant actions require participant identity.")
        state = compute_current_attendance_state(group=group, participant_kind="group_only_participant", participant_id=group_only_participant.id)
    else:
        raise AttendanceValidationError("invalid_participant_kind", "Invalid participant kind.")

    allowed = get_valid_actions_for_state(group=group, state=state)
    if action_type not in allowed:
        raise AttendanceValidationError(
            "invalid_action_for_state",
            f"Action {action_type} is not valid for this participant's current attendance state.",
        )

    if participant_kind == "member":
        member_obj = membership.member
        snapshot = snapshot or {
            "participant_name_snapshot": membership.effective_name,
            "participant_email_snapshot": membership.effective_email,
            "participant_check_in_identifier_snapshot": membership.effective_check_in_identifier,
        }
    else:
        snapshot = snapshot or {
            "participant_name_snapshot": group_only_participant.name,
            "participant_email_snapshot": group_only_participant.email,
            "participant_check_in_identifier_snapshot": group_only_participant.check_in_identifier,
        }

    ar = ActionRecord.objects.create(
        organization=group.organization,
        group=group,
        participant_kind=participant_kind,
        member=member_obj if participant_kind == "member" else None,
        group_only_participant=group_only_participant if participant_kind == "group_only_participant" else None,
        action_type=action_type,
        source=ActionSource.KIOSK,
        performed_at=now,
        kiosk_note_snapshot="kiosk",
        participant_name_snapshot=snapshot["participant_name_snapshot"],
        participant_email_snapshot=snapshot.get("participant_email_snapshot", ""),
        participant_check_in_identifier_snapshot=snapshot.get("participant_check_in_identifier_snapshot", ""),
    )
    return ar

