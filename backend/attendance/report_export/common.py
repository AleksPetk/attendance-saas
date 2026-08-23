"""Shared helpers for Attendance Report exporters."""

from __future__ import annotations

import calendar
import re
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
    """Flatten sections into export rows with date label + name + cells."""
    columns = list(report.get("columns") or [])
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
            rows.append(item)
    return rows


def cell_text(value) -> str:
    if value is None or value == "":
        return ""
    return str(value)


def slugify_filename_part(value: str, *, fallback: str = "attendance") -> str:
    text = (value or "").strip().lower()
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text or fallback


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


def build_export_filename(report: dict, extension: str) -> str:
    group = slugify_filename_part(report.get("group_name") or "group", fallback="group")
    period = period_filename_token(report)
    ext = extension.lstrip(".")
    return f"{group}-attendance-{period}.{ext}"
