"""CSV exporter for Attendance Report payloads."""

from __future__ import annotations

import csv
import io

from attendance.report_export.common import (
    cell_text,
    flatten_report_rows,
    report_context_lines,
    report_identity_headers,
    report_identity_values,
    status_label,
)


def build_attendance_report_csv(report: dict) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    writer.writerow(["Attendance Report"])
    for line in report_context_lines(report):
        writer.writerow([line])
    status = status_label(report.get("group_status"))
    if status and report.get("group_status") in {"archived", "deleted"}:
        writer.writerow([status])
    writer.writerow([])

    columns = list(report.get("columns") or [])
    writer.writerow(
        [
            *report_identity_headers(report),
            *[col.get("label") or col.get("key") for col in columns],
        ]
    )

    for row in flatten_report_rows(report):
        writer.writerow(
            [
                *report_identity_values(row, report),
                *[cell_text(row["cells"].get(col["key"])) for col in columns],
            ]
        )

    return buffer.getvalue()
