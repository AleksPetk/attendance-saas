"""
Attendance Report file exporters.

All formats consume the same build_attendance_report() payload.
"""

from attendance.report_export.common import (
    EXPORT_FORMATS,
    build_export_filename,
    enrich_report_for_export,
)
from attendance.report_export.csv_export import build_attendance_report_csv
from attendance.report_export.excel_export import build_attendance_report_xlsx
from attendance.report_export.pdf_export import build_attendance_report_pdf

__all__ = [
    "EXPORT_FORMATS",
    "build_export_filename",
    "enrich_report_for_export",
    "build_attendance_report_csv",
    "build_attendance_report_xlsx",
    "build_attendance_report_pdf",
    "render_attendance_report_export",
]


def render_attendance_report_export(*, report: dict, export_format: str, organization=None):
    """
    Render bytes + content_type + filename for an attendance report payload.
    """
    payload = enrich_report_for_export(report, organization=organization)
    fmt = (export_format or "").strip().lower()
    if fmt == "csv":
        content = build_attendance_report_csv(payload)
        return {
            "content": content.encode("utf-8-sig"),
            "content_type": "text/csv; charset=utf-8",
            "filename": build_export_filename(payload, "csv"),
        }
    if fmt in {"xlsx", "excel"}:
        return {
            "content": build_attendance_report_xlsx(payload),
            "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "filename": build_export_filename(payload, "xlsx"),
        }
    if fmt == "pdf":
        return {
            "content": build_attendance_report_pdf(payload),
            "content_type": "application/pdf",
            "filename": build_export_filename(payload, "pdf"),
        }
    raise ValueError(f"Unsupported export format: {export_format}")
