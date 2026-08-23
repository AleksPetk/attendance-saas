from attendance.exceptions import AttendanceValidationError
from attendance.models import ActionRecord, ActionSource, ActionType
from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupOnlyParticipant,
    group_is_operationally_active,
)
from groups.readiness import group_is_operationally_ready
from groups.operations import maybe_run_after_action
from members.models import member_is_operationally_active
from kiosk_builder.attendance_reset import compute_effective_reset_boundary
from kiosk_builder.kiosk_settings_constants import AttendanceResetMode
from kiosk_builder.models import ensure_group_kiosk_settings

from django.core.exceptions import ValidationError
from django.utils import timezone


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


def compute_current_attendance_state(
    *,
    group: Group,
    participant_kind: str,
    member_id=None,
    participant_id=None,
    now=None,
):
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

    if now is None:
        now = timezone.now()

    kiosk_settings = ensure_group_kiosk_settings(group)
    if kiosk_settings.attendance_reset_mode == AttendanceResetMode.ROLLING:
        participant_records = list(qs)
        boundary = compute_effective_reset_boundary(
            kiosk_settings=kiosk_settings,
            organization=group.organization,
            participant_records=participant_records,
            now=now,
        )
    else:
        boundary = compute_effective_reset_boundary(
            kiosk_settings=kiosk_settings,
            organization=group.organization,
            participant_records=[],
            now=now,
        )
    if boundary is not None:
        qs = qs.filter(performed_at__gte=boundary)

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
    """Deprecated no-op. Automatic check-in was removed from the product."""
    return {"created": False, "due": False, "performed_at": None}


def ensure_automatic_check_in_action_record_for_participant(*, group: Group, participant: GroupOnlyParticipant, now=None):
    """Deprecated no-op. Automatic check-in was removed from the product."""
    return {"created": False, "due": False, "performed_at": None}


def build_kiosk_identify_payload(*, group: Group, participant_kind: str, membership=None, group_only_participant=None):
    """Return identify response data after a participant is resolved."""
    if participant_kind == "member":
        state = compute_current_attendance_state(
            group=group, participant_kind="member", member_id=membership.member_id
        )
        participant = {
            "participant_kind": "member",
            "membership_id": membership.id,
            "name": membership.effective_name,
            "participant_code": membership.group_participant_code,
        }
    elif participant_kind == "group_only_participant":
        state = compute_current_attendance_state(
            group=group,
            participant_kind="group_only_participant",
            participant_id=group_only_participant.id,
        )
        participant = {
            "participant_kind": "group_only_participant",
            "group_only_participant_id": group_only_participant.id,
            "name": group_only_participant.name,
            "participant_code": group_only_participant.group_participant_code,
        }
    else:
        raise ValidationError("Invalid participant kind.")

    return {
        "code": "ok",
        "participant": participant,
        "attendance_state": state,
        "allowed_actions": get_valid_actions_for_state(group=group, state=state),
    }


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

    if not group_is_operationally_active(group):
        raise AttendanceValidationError(
            "group_archived",
            "Archived Groups cannot perform attendance actions.",
        )

    if participant_kind == "member":
        if membership is None:
            raise AttendanceValidationError("missing_membership", "Member actions require GroupMembership for effective values.")
        if membership.status != GroupMembershipStatus.ACTIVE:
            raise AttendanceValidationError(
                "member_not_operational",
                "This Member is not active in this Group.",
            )
        if not member_is_operationally_active(membership.member):
            raise AttendanceValidationError(
                "member_archived",
                "Archived Members cannot perform attendance actions.",
            )
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
            "participant_email_snapshot": (membership.participation_email or "").strip(),
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
        source_group_id=group.pk,
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
        group_name_snapshot=group.name,
    )
    maybe_run_after_action(
        group,
        action_type,
        action_record=ar,
        membership=membership if participant_kind == "member" else None,
        group_only_participant=(
            group_only_participant if participant_kind == "group_only_participant" else None
        ),
    )
    return ar

