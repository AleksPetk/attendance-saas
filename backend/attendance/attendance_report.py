"""
Attendance Report aggregation from ActionRecords.

Timezone handling is isolated in get_report_timezone() so Organization-level
timezone can be plugged in later without rewriting report logic.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone

from attendance.models import ActionRecord, ActionType
from groups.models import (
    Group,
    GroupMembership,
    GroupOnlyParticipant,
    GroupStatus,
    GroupType,
)
from members.models import Member


REPORT_DATE_PRESETS = ("today", "this_week", "this_month", "custom")
REPORT_BY_CHOICES = ("member", "group")
# IANA names are typically short; reject oversized / empty values early.
TIMEZONE_NAME_MAX_LENGTH = 64
UNKNOWN_CLASS_LABEL = "Unknown Class"

COLUMN_DEFS = (
    {"key": "check_in", "label": "Check-in", "action_type": ActionType.CHECK_IN},
    {"key": "break", "label": "Break", "action_type": ActionType.BREAK_START},
    {"key": "check_out", "label": "Check-out", "action_type": ActionType.CHECK_OUT},
)


def normalize_report_timezone_name(timezone_name):
    """
    Validate and normalize an IANA timezone name.

    Returns the cleaned name, or raises ValueError when invalid.
    """
    if timezone_name is None:
        return None
    name = str(timezone_name).strip()
    if not name:
        return None
    if len(name) > TIMEZONE_NAME_MAX_LENGTH:
        raise ValueError("Invalid timezone.")
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError("Invalid timezone.") from exc
    return name


def get_report_timezone(organization=None, timezone_name=None):
    """
    Resolve the timezone used for local calendar-day report bucketing.

    Prefer an explicit validated IANA timezone (browser/user local for report
    requests). Fall back to Django's current/project timezone (settings.TIME_ZONE)
    until an Organization-level timezone exists.
    """
    _ = organization  # Reserved for future org timezone field.
    if timezone_name:
        return ZoneInfo(normalize_report_timezone_name(timezone_name))
    return timezone.get_current_timezone()


def resolve_report_date_range(
    *,
    preset,
    date_from=None,
    date_to=None,
    organization=None,
    timezone_name=None,
    now=None,
):
    """
    Return (date_from, date_to, date_label) as inclusive local calendar dates.
    """
    tz = get_report_timezone(organization, timezone_name=timezone_name)
    if now is None:
        now = timezone.now()
    today = now.astimezone(tz).date()

    if preset == "today":
        start = end = today
        label = today.strftime("%d %B %Y")
    elif preset == "this_week":
        # Monday–Sunday of the current local week.
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
        label = f"{start.strftime('%d %B %Y')} – {end.strftime('%d %B %Y')}"
    elif preset == "this_month":
        start = today.replace(day=1)
        if today.month == 12:
            next_month = today.replace(year=today.year + 1, month=1, day=1)
        else:
            next_month = today.replace(month=today.month + 1, day=1)
        end = next_month - timedelta(days=1)
        label = today.strftime("%B %Y")
    elif preset == "custom":
        if date_from is None or date_to is None:
            raise ValueError("Custom range requires date_from and date_to.")
        if date_to < date_from:
            raise ValueError("date_to must be on or after date_from.")
        start, end = date_from, date_to
        if start == end:
            label = start.strftime("%d %B %Y")
        else:
            label = f"{start.strftime('%d %B %Y')} – {end.strftime('%d %B %Y')}"
    else:
        raise ValueError(f"Unknown date preset: {preset}")

    return start, end, label


def _local_day_bounds(day: date, tz):
    start = timezone.make_aware(datetime.combine(day, time.min), tz)
    end = timezone.make_aware(datetime.combine(day, time.max), tz)
    return start, end


def _format_local_time(dt, tz):
    return timezone.localtime(dt, tz).strftime("%H:%M")


def format_local_action_time(dt, *, organization=None, timezone_name=None):
    """
    Format an action instant as 24-hour HH:MM in the report timezone.

    Uses the same resolution as Attendance Report and Activity Log display
    (browser IANA name when provided; otherwise project/workspace timezone).
    """
    if dt is None:
        dt = timezone.now()
    tz = get_report_timezone(organization, timezone_name=timezone_name)
    return _format_local_time(dt, tz)


def _participant_key(record: ActionRecord) -> str:
    if record.member_id:
        return f"member:{record.member_id}"
    if record.group_only_participant_id:
        return f"group_only:{record.group_only_participant_id}"
    identifier = (record.participant_check_in_identifier_snapshot or "").strip()
    name = (record.participant_name_snapshot or "").strip()
    return f"snapshot:{record.participant_kind}:{name}:{identifier}"


def _class_identity_key(record: ActionRecord) -> str:
    if record.source_section_id:
        return f"section:{record.source_section_id}"
    name = (record.class_name_snapshot or "").strip()
    if name:
        return f"snap:{name.lower()}"
    return "unknown"


def _row_identity_key(record: ActionRecord, *, structured: bool) -> str:
    participant = _participant_key(record)
    if not structured:
        return participant
    return f"{participant}|{_class_identity_key(record)}"


def _class_display_name(record: ActionRecord) -> str:
    name = (record.class_name_snapshot or "").strip()
    return name or UNKNOWN_CLASS_LABEL


def _visible_columns(action_types_present: set[str]) -> list[dict]:
    columns = []
    for col in COLUMN_DEFS:
        if col["action_type"] in action_types_present:
            columns.append({"key": col["key"], "label": col["label"]})
    return columns


def _cell_values_for_day(records: list[ActionRecord], tz) -> dict:
    """
    Build display cells for one participant on one local day.

    - check_in: first check-in time
    - break: all break_start times, joined
    - check_out: last check-out time when multiple exist
    """
    check_ins = []
    breaks = []
    check_outs = []
    for record in sorted(records, key=lambda r: (r.performed_at, r.id)):
        stamp = _format_local_time(record.performed_at, tz)
        if record.action_type == ActionType.CHECK_IN:
            check_ins.append(stamp)
        elif record.action_type == ActionType.BREAK_START:
            breaks.append(stamp)
        elif record.action_type == ActionType.CHECK_OUT:
            check_outs.append(stamp)

    cells = {}
    if check_ins:
        cells["check_in"] = check_ins[0]
    if breaks:
        cells["break"] = ", ".join(breaks)
    if check_outs:
        cells["check_out"] = check_outs[-1]
    return cells


def _resolve_group_type(*, organization, source_group_id: int, live_group=None) -> str:
    """
    Resolve report group_type from the live Group, else historical snapshots.

    Does not invent Structured solely from a single Class field on one row:
    prefers live Group.group_type, then any non-empty group_type_snapshot.
    """
    if live_group is not None:
        return live_group.group_type

    snapshot = (
        ActionRecord.objects.filter(
            organization=organization,
            source_group_id=source_group_id,
        )
        .exclude(group_type_snapshot="")
        .order_by("-performed_at", "-id")
        .values_list("group_type_snapshot", flat=True)
        .first()
    )
    if snapshot in GroupType.values:
        return snapshot
    return GroupType.STANDARD


def list_report_groups(*, organization, allowed_group_ids=None):
    """
    Groups selectable for Attendance Report: active, archived, and deleted.

    When allowed_group_ids is provided (workspace Staff), only those Groups are
    returned plus archived assigned Groups. Permanently deleted Groups remain
    visible in report selection when ActionRecords exist for assigned ids.
    """
    items = []

    live_groups = Group.objects.filter(organization=organization).order_by("name", "id")
    if allowed_group_ids is not None:
        if not allowed_group_ids:
            live_groups = live_groups.none()
        else:
            live_groups = live_groups.filter(pk__in=allowed_group_ids)
    live_ids = set()
    for group in live_groups:
        live_ids.add(group.pk)
        items.append(
            {
                "source_group_id": group.pk,
                "name": group.name,
                "status": group.status,
                "group_type": group.group_type,
            }
        )

    deleted_ids = (
        ActionRecord.objects.filter(
            organization=organization,
            source_group_id__isnull=False,
        )
        .exclude(source_group_id__in=live_ids)
        .values_list("source_group_id", flat=True)
        .distinct()
    )
    if allowed_group_ids is not None:
        deleted_ids = [gid for gid in deleted_ids if gid in allowed_group_ids]
    for source_group_id in deleted_ids:
        latest_name = (
            ActionRecord.objects.filter(
                organization=organization,
                source_group_id=source_group_id,
            )
            .order_by("-performed_at", "-id")
            .values_list("group_name_snapshot", flat=True)
            .first()
        )
        items.append(
            {
                "source_group_id": source_group_id,
                "name": latest_name or f"Deleted group #{source_group_id}",
                "status": "deleted",
                "group_type": _resolve_group_type(
                    organization=organization,
                    source_group_id=source_group_id,
                ),
            }
        )

    # Active, then archived, then deleted; name within status.
    status_order = {
        GroupStatus.ACTIVE: 0,
        GroupStatus.ARCHIVED: 1,
        "deleted": 2,
    }
    items.sort(key=lambda item: (status_order.get(item["status"], 9), item["name"].lower(), item["source_group_id"]))
    return items


def resolve_report_group(*, organization, source_group_id: int):
    """
    Resolve group display name + status for a report source_group_id.
    Returns None if this workspace has no matching live group and no records.
    """
    group = Group.objects.filter(organization=organization, pk=source_group_id).first()
    if group is not None:
        return {
            "source_group_id": group.pk,
            "name": group.name,
            "status": group.status,
            "group_type": group.group_type,
        }

    has_records = ActionRecord.objects.filter(
        organization=organization,
        source_group_id=source_group_id,
    ).exists()
    if not has_records:
        return None

    latest = (
        ActionRecord.objects.filter(
            organization=organization,
            source_group_id=source_group_id,
        )
        .order_by("-performed_at", "-id")
        .values_list("group_name_snapshot", flat=True)
        .first()
    )
    return {
        "source_group_id": source_group_id,
        "name": latest or f"Deleted group #{source_group_id}",
        "status": "deleted",
        "group_type": _resolve_group_type(
            organization=organization,
            source_group_id=source_group_id,
        ),
    }


def list_report_members(*, organization, allowed_group_ids=None):
    """Reusable Members available as report subjects, scoped for Staff."""
    members = Member.objects.filter(organization=organization)
    if allowed_group_ids is not None:
        ids = set(allowed_group_ids)
        member_ids = set(
            GroupMembership.objects.filter(
                organization=organization,
                group_id__in=ids,
            ).values_list("member_id", flat=True)
        )
        member_ids.update(
            ActionRecord.objects.filter(
                organization=organization,
                source_group_id__in=ids,
                member_id__isnull=False,
            ).values_list("member_id", flat=True)
        )
        members = members.filter(pk__in=member_ids)
    return [
        {"id": member.pk, "name": member.name, "status": member.status}
        for member in members.order_by("name", "id")
    ]


def report_member_group_ids(*, organization, member_id, allowed_group_ids=None):
    ids = set(
        GroupMembership.objects.filter(
            organization=organization,
            member_id=member_id,
        ).values_list("group_id", flat=True)
    )
    ids.update(
        ActionRecord.objects.filter(
            organization=organization,
            member_id=member_id,
            source_group_id__isnull=False,
        ).values_list("source_group_id", flat=True)
    )
    if allowed_group_ids is not None:
        ids.intersection_update(set(allowed_group_ids))
    return ids


def list_member_report_groups(*, organization, member_id, allowed_group_ids=None):
    member_ids = report_member_group_ids(
        organization=organization,
        member_id=member_id,
        allowed_group_ids=allowed_group_ids,
    )
    return [
        item
        for item in list_report_groups(
            organization=organization,
            allowed_group_ids=allowed_group_ids,
        )
        if item["source_group_id"] in member_ids
    ]


def list_group_report_participants(*, organization, source_group_id):
    """Current operational Group identities; history itself remains immutable."""
    memberships = (
        GroupMembership.objects.filter(
            organization=organization,
            group_id=source_group_id,
        )
        .operational()
        .select_related("member")
        .order_by("member__name", "id")
    )
    visitors = (
        GroupOnlyParticipant.objects.filter(
            organization=organization,
            group_id=source_group_id,
        )
        .operational()
        .order_by("name", "id")
    )
    items = [
        {
            "kind": "member",
            "id": membership.pk,
            "name": membership.effective_name,
            "participant_code": membership.group_participant_code,
        }
        for membership in memberships
    ]
    items.extend(
        {
            "kind": "group_only_participant",
            "id": participant.pk,
            "name": participant.name,
            "participant_code": participant.group_participant_code,
        }
        for participant in visitors
    )
    return sorted(items, key=lambda item: (item["name"].lower(), item["kind"], item["id"]))


def build_attendance_report(
    *,
    organization,
    source_group_id: int | None = None,
    report_by: str = "group",
    member_id: int | None = None,
    participant_kind: str | None = None,
    participant_id: int | None = None,
    allowed_group_ids=None,
    preset: str,
    date_from: date | None = None,
    date_to: date | None = None,
    timezone_name: str | None = None,
    now=None,
):
    if report_by not in REPORT_BY_CHOICES:
        raise ValueError("Invalid report mode.")

    group_meta = None
    member = None
    selected_participant = None
    if source_group_id is not None:
        group_meta = resolve_report_group(
            organization=organization,
            source_group_id=source_group_id,
        )
        if group_meta is None:
            return None

    if report_by == "group" and group_meta is None:
        raise ValueError("Group mode requires a Group.")
    if report_by == "member":
        member = Member.objects.filter(organization=organization, pk=member_id).first()
        if member is None:
            return None
        member_group_ids = report_member_group_ids(
            organization=organization,
            member_id=member.pk,
            allowed_group_ids=allowed_group_ids,
        )
        if source_group_id is not None and source_group_id not in member_group_ids:
            return None

    start_day, end_day, date_label = resolve_report_date_range(
        preset=preset,
        date_from=date_from,
        date_to=date_to,
        organization=organization,
        timezone_name=timezone_name,
        now=now,
    )
    tz = get_report_timezone(organization, timezone_name=timezone_name)
    range_start, _ = _local_day_bounds(start_day, tz)
    _, range_end = _local_day_bounds(end_day, tz)

    records_qs = ActionRecord.objects.filter(
        organization=organization,
        performed_at__gte=range_start,
        performed_at__lte=range_end,
    )
    if allowed_group_ids is not None:
        records_qs = records_qs.filter(source_group_id__in=set(allowed_group_ids))
    if source_group_id is not None:
        records_qs = records_qs.filter(source_group_id=source_group_id)
    if report_by == "member":
        records_qs = records_qs.filter(member_id=member.pk)
    elif participant_id is not None:
        if participant_kind == "member":
            membership = GroupMembership.objects.filter(
                organization=organization,
                group_id=source_group_id,
                pk=participant_id,
            ).select_related("member").first()
            if membership is None:
                return None
            selected_participant = {
                "kind": "member",
                "id": membership.pk,
                "name": membership.effective_name,
                "participant_code": membership.group_participant_code,
            }
            records_qs = records_qs.filter(member_id=membership.member_id)
        elif participant_kind == "group_only_participant":
            participant = GroupOnlyParticipant.objects.filter(
                organization=organization,
                group_id=source_group_id,
                pk=participant_id,
            ).first()
            if participant is None:
                return None
            selected_participant = {
                "kind": "group_only_participant",
                "id": participant.pk,
                "name": participant.name,
                "participant_code": participant.group_participant_code,
            }
            records_qs = records_qs.filter(group_only_participant_id=participant.pk)
        else:
            raise ValueError("Invalid participant selection.")

    records = list(records_qs.order_by("-performed_at", "-id"))

    action_types_present = {r.action_type for r in records}
    # break_end never drives a column in this MVP.
    action_types_present.discard(ActionType.BREAK_END)
    columns = _visible_columns(action_types_present)

    show_group_column = report_by == "member" and source_group_id is None
    is_structured = bool(group_meta and group_meta["group_type"] == GroupType.STRUCTURED)
    show_class_column = is_structured or any(
        record.group_type_snapshot == GroupType.STRUCTURED or record.source_section_id
        for record in records
    )

    # Bucket: local_day -> row_identity_key -> records (chronological later)
    by_day: dict[date, dict[str, list[ActionRecord]]] = defaultdict(lambda: defaultdict(list))
    names: dict[str, str] = {}
    class_names: dict[str, str] = {}
    class_source_ids: dict[str, int | None] = {}
    group_names: dict[str, str] = {}
    for record in records:
        if record.action_type == ActionType.BREAK_END:
            continue
        local_day = timezone.localtime(record.performed_at, tz).date()
        structured_record = is_structured or (
            show_group_column
            and (record.group_type_snapshot == GroupType.STRUCTURED or record.source_section_id)
        )
        key = _row_identity_key(record, structured=structured_record)
        if show_group_column:
            key = f"group:{record.source_group_id or 'unknown'}|{key}"
        by_day[local_day][key].append(record)
        if key not in names:
            names[key] = record.participant_name_snapshot or "Unknown"
        if show_group_column and key not in group_names:
            group_names[key] = record.group_name_snapshot or (
                record.group.name if record.group_id and record.group is not None else "Unknown Group"
            )
        if show_class_column and key not in class_names:
            class_names[key] = _class_display_name(record)
            class_source_ids[key] = record.source_section_id

    sections = []
    for day in sorted(by_day.keys(), reverse=True):
        day_participants = by_day[day]
        rows = []
        if show_group_column or show_class_column:
            sorted_keys = sorted(
                day_participants.keys(),
                key=lambda k: (
                    group_names.get(k, "").lower(),
                    class_names.get(k, "").lower(),
                    names.get(k, "").lower(),
                    k,
                ),
            )
        else:
            sorted_keys = sorted(
                day_participants.keys(),
                key=lambda k: (names.get(k, "").lower(), k),
            )
        for key in sorted_keys:
            cells = _cell_values_for_day(day_participants[key], tz)
            row = {
                "participant_key": key,
                "name": names.get(key, "Unknown"),
                "cells": {col["key"]: cells.get(col["key"]) for col in columns},
            }
            if show_group_column:
                row["group_name"] = group_names.get(key, "Unknown Group")
            if show_class_column:
                row["class_name"] = class_names.get(key, UNKNOWN_CLASS_LABEL)
                row["class_source_id"] = class_source_ids.get(key)
            rows.append(row)
        sections.append(
            {
                "date": day.isoformat(),
                "label": day.strftime("%d %B %Y"),
                "rows": rows,
            }
        )

    return {
        "report_by": report_by,
        "member_id": member.pk if member else None,
        "member_name": member.name if member else "",
        "member_status": member.status if member else "",
        "participant": selected_participant,
        "group_name": group_meta["name"] if group_meta else "",
        "group_status": group_meta["status"] if group_meta else "",
        "group_type": group_meta["group_type"] if group_meta else "mixed",
        "source_group_id": group_meta["source_group_id"] if group_meta else None,
        "show_group_column": show_group_column,
        "show_class_column": show_class_column,
        "date_preset": preset,
        "date_from": start_day.isoformat(),
        "date_to": end_day.isoformat(),
        "date_label": date_label,
        "columns": columns,
        "sections": sections,
    }
