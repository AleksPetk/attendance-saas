"""CSV exporter for Attendance Report payloads."""

from __future__ import annotations

import csv
import io

from attendance.report_export.common import (
    cell_text,
    flatten_report_rows,
    period_lines,
    status_label,
)


def build_attendance_report_csv(report: dict) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    writer.writerow([report.get("group_name") or "Group"])
    status = status_label(report.get("group_status"))
    if status and report.get("group_status") in {"archived", "deleted"}:
        writer.writerow([status])
    writer.writerow(["Attendance Report"])
    for line in period_lines(report):
        writer.writerow([line])
    writer.writerow([])

    columns = list(report.get("columns") or [])
    writer.writerow(["Date", "Name", *[col.get("label") or col.get("key") for col in columns]])

    for row in flatten_report_rows(report):
        writer.writerow(
            [
                row["date"],
                row["name"],
                *[cell_text(row["cells"].get(col["key"])) for col in columns],
            ]
        )

    return buffer.getvalue()
