"""
Attendance Reset boundary calculation for live kiosk state.

Reset affects operational state only — ActionRecords are never deleted or modified.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta

from django.utils import timezone

from attendance.attendance_report import get_report_timezone
from attendance.models import ActionType
from kiosk_builder.kiosk_settings_constants import (
    ATTENDANCE_RESET_ROLLING_MAX_MINUTES,
    ATTENDANCE_RESET_ROLLING_MIN_MINUTES,
    AttendanceResetMode,
)


def get_attendance_reset_timezone(organization=None):
    """
    Local timezone for Daily reset boundaries.

    Uses the same canonical source as Attendance Report bucketing
    (get_report_timezone) until Organization-level timezone exists.
    """
    return get_report_timezone(organization)


def rolling_duration_timedelta(*, hours: int, minutes: int) -> timedelta:
    return timedelta(hours=int(hours or 0), minutes=int(minutes or 0))


def validate_rolling_duration(*, hours: int, minutes: int) -> None:
    total_minutes = int(hours or 0) * 60 + int(minutes or 0)
    if total_minutes < ATTENDANCE_RESET_ROLLING_MIN_MINUTES:
        raise ValueError("Rolling reset duration must be at least 1 minute.")
    if total_minutes > ATTENDANCE_RESET_ROLLING_MAX_MINUTES:
        raise ValueError("Rolling reset duration cannot exceed 7 days.")


def compute_daily_reset_boundary(*, reset_time: time, tz, now=None) -> datetime:
    """
    Most recent Daily reset instant at or before now in the workspace local timezone.

    Records with performed_at >= boundary belong to the current operational cycle.
    """
    if now is None:
        now = timezone.now()
    local_now = now.astimezone(tz)
    boundary_today = timezone.make_aware(datetime.combine(local_now.date(), reset_time), tz)
    if local_now >= boundary_today:
        return boundary_today
    yesterday = local_now.date() - timedelta(days=1)
    return timezone.make_aware(datetime.combine(yesterday, reset_time), tz)


def _records_after_boundary(records, boundary):
    if boundary is None:
        return list(records)
    return [record for record in records if record.performed_at >= boundary]


def _rolling_cycle_anchor(records):
    """
    Anchor for Rolling reset — the participant's current cycle start.

    Prefer the most recent check-in. When no check-in exists (e.g. check-out-only
    Groups), fall back to the earliest action in the current record window.
    """
    last_check_in = None
    for record in records:
        if record.action_type == ActionType.CHECK_IN:
            last_check_in = record
    if last_check_in is not None:
        return last_check_in.performed_at
    if not records:
        return None
    return min(record.performed_at for record in records)


def compute_rolling_participant_boundary(
    *,
    records,
    rolling_duration: timedelta,
    manual_boundary,
    now=None,
):
    """
    Participant-specific Rolling boundary, combined with manual_reset_at when present.
    """
    if now is None:
        now = timezone.now()

    scoped = _records_after_boundary(records, manual_boundary)
    anchor = _rolling_cycle_anchor(scoped)
    if anchor is None:
        return manual_boundary

    rolling_boundary = anchor + rolling_duration
    if now < rolling_boundary:
        return manual_boundary

    if manual_boundary is not None:
        return max(manual_boundary, rolling_boundary)
    return rolling_boundary


def compute_effective_reset_boundary(
    *,
    kiosk_settings,
    organization,
    participant_records,
    now=None,
):
    """
    Canonical effective boundary for filtering ActionRecords before state calculation.
    """
    if now is None:
        now = timezone.now()

    manual_boundary = kiosk_settings.manual_reset_at
    mode = kiosk_settings.attendance_reset_mode

    if mode == AttendanceResetMode.DAILY:
        tz = get_attendance_reset_timezone(organization)
        daily_boundary = compute_daily_reset_boundary(
            reset_time=kiosk_settings.attendance_reset_daily_time,
            tz=tz,
            now=now,
        )
        boundaries = [value for value in (manual_boundary, daily_boundary) if value is not None]
        return max(boundaries) if boundaries else None

    if mode == AttendanceResetMode.ROLLING:
        duration = rolling_duration_timedelta(
            hours=kiosk_settings.attendance_reset_rolling_hours,
            minutes=kiosk_settings.attendance_reset_rolling_minutes,
        )
        return compute_rolling_participant_boundary(
            records=participant_records,
            rolling_duration=duration,
            manual_boundary=manual_boundary,
            now=now,
        )

    return manual_boundary


def filter_records_queryset(qs, boundary):
    if boundary is None:
        return qs
    return qs.filter(performed_at__gte=boundary)
