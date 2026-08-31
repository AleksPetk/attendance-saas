"""Shared helpers for Attendance Report exporters."""

from __future__ import annotations

import calendar
import re
import uuid
from datetime import date, datetime, timezone

EXPORT_FORMATS = ("pdf", "xlsx", "csv")

STATUS_LABELS = {
    "active": "Active",
    "archived": "Archived",
    "deleted": "Deleted",
}

_MONTH_LABEL_RE = re.compile(
    r"^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$",
    re.IGNORECASE,
)


def status_label(status: str | None) -> str:
    if not status:
        return ""
    return STATUS_LABELS.get(status, status.replace("_", " ").title())


def enrich_report_for_export(report: dict, organization=None) -> dict:
    payload = dict(report or {})
    if organization is not None and "organization_name" not in payload:
        label = (getattr(organization, "internal_label", "") or "").strip()
        workspace_id = (getattr(organization, "workspace_id", "") or "").strip()
        payload["organization_name"] = label or workspace_id
    return payload


def format_iso_date_long(iso_date: str | None) -> str:
    if not iso_date:
        return ""
    try:
        value = date.fromisoformat(iso_date)
    except ValueError:
        return iso_date
    return f"{value.day} {value.strftime('%B %Y')}"


def format_iso_date_short(iso_date: str | None) -> str:
    if not iso_date:
        return ""
    try:
        value = date.fromisoformat(iso_date)
    except ValueError:
        return iso_date
    return f"{value.day} {value.strftime('%b %Y')}"


def period_lines(report: dict) -> list[str]:
    lines = []
    label = (report.get("date_label") or "").strip()
    if label:
        lines.append(label)
    date_from = report.get("date_from") or ""
    date_to = report.get("date_to") or ""
    if date_from and date_to and date_from != date_to:
        range_line = f"{format_iso_date_long(date_from)} - {format_iso_date_long(date_to)}"
        if range_line != label:
            lines.append(range_line)
    elif date_from and date_from == date_to and not label:
        lines.append(format_iso_date_long(date_from))
    return lines


def flatten_report_rows(report: dict) -> list[dict]:
    """Flatten sections into export rows with date label + identity + cells."""
    columns = list(report.get("columns") or [])
    show_class = report_shows_class_column(report)
    rows = []
    for section in report.get("sections") or []:
        date_label = section.get("label") or section.get("date") or ""
        for row in section.get("rows") or []:
            cells = row.get("cells") or {}
            item = {
                "date": date_label,
                "name": row.get("name") or "",
                "cells": {col["key"]: cells.get(col["key"]) for col in columns},
            }
            if report_shows_group_column(report):
                item["group_name"] = row.get("group_name") or ""
            if show_class:
                item["class_name"] = row.get("class_name") or ""
            rows.append(item)
    return rows


def report_shows_class_column(report: dict) -> bool:
    if "show_class_column" in report:
        return bool(report.get("show_class_column"))
    return (report.get("group_type") or "") == "structured"


def report_shows_group_column(report: dict) -> bool:
    return bool(report.get("show_group_column"))


def report_identity_headers(report: dict) -> list[str]:
    headers = ["Date"]
    if report_shows_group_column(report):
        headers.append("Group")
    if report_shows_class_column(report):
        headers.append("Class")
    headers.append("Name")
    return headers


def report_identity_values(row: dict, report: dict) -> list[str]:
    values = [row.get("date") or ""]
    if report_shows_group_column(report):
        values.append(row.get("group_name") or "")
    if report_shows_class_column(report):
        values.append(row.get("class_name") or "")
    values.append(row.get("name") or "")
    return values


def report_context_lines(report: dict) -> list[str]:
    if report.get("report_by") == "member":
        lines = [f"Member: {report.get('member_name') or 'Unknown'}"]
        lines.append(
            f"Group: {report.get('group_name')}"
            if report.get("source_group_id")
            else "Groups: All member Groups"
        )
    else:
        lines = [f"Group: {report.get('group_name') or 'Unknown'}"]
        participant = report.get("participant") or {}
        lines.append(
            f"Participant: {participant.get('name')}"
            if participant
            else "Participants: All"
        )
    if report.get("date_label"):
        lines.append(f"Date range: {report['date_label']}")
    return lines


def cell_text(value) -> str:
    if value is None or value == "":
        return ""
    return str(value)


def slugify_filename_part(value: str, *, fallback: str = "attendance") -> str:
    text = (value or "").strip().lower()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text or fallback


def safe_display_filename_part(value: str | None, *, fallback: str) -> str:
    raw = str(value or "").strip()
    if "@" in raw or re.search(r"\d{7,}", raw):
        return fallback
    return slugify_filename_part(raw, fallback=fallback)


def period_filename_token(report: dict) -> str:
    date_from = report.get("date_from") or ""
    date_to = report.get("date_to") or ""
    date_label = (report.get("date_label") or "").strip()

    if date_from and date_to and date_from != date_to:
        if date_label and _MONTH_LABEL_RE.match(date_label):
            try:
                start = date.fromisoformat(date_from)
                end = date.fromisoformat(date_to)
                last_day = calendar.monthrange(start.year, start.month)[1]
                if (
                    start.day == 1
                    and end.day == last_day
                    and start.month == end.month
                    and start.year == end.year
                ):
                    return slugify_filename_part(date_label, fallback="period")
            except ValueError:
                pass
        return f"{date_from}-to-{date_to}"

    if date_from:
        return date_from

    if date_label:
        return slugify_filename_part(date_label, fallback="period")

    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def build_export_filename(report: dict, extension: str, *, now=None) -> str:
    if report.get("report_by") == "member":
        primary = safe_display_filename_part(report.get("member_name"), fallback="member")
        secondary = safe_display_filename_part(
            report.get("group_name") or "all-groups",
            fallback="all-groups",
        )
    else:
        primary = safe_display_filename_part(report.get("group_name"), fallback="group")
        participant = report.get("participant") or {}
        secondary = safe_display_filename_part(
            participant.get("name") or "all-participants",
            fallback="all-participants",
        )
    period = period_filename_token(report).replace("-to-", "_to_")
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%d-%H%M%S-%f")
    unique = uuid.uuid4().hex[:6]
    ext = extension.lstrip(".")
    return f"attendance_{primary}_{secondary}_{period}_{stamp}-{unique}.{ext}"
