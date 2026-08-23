"""PDF exporter for Attendance Report payloads."""

from __future__ import annotations

import io

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from attendance.report_export.common import (
    cell_text,
    flatten_report_rows,
    period_lines,
    report_identity_headers,
    report_identity_values,
    report_shows_class_column,
    status_label,
)
from attendance.report_export.fonts import ensure_report_fonts, font_for_text


def _paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    safe = (
        (text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    # Pick a font that can render this text (CJK vs Latin/Cyrillic).
    font_name = font_for_text(text or "", bold=("Bold" in (style.fontName or "")))
    local = ParagraphStyle(
        f"{style.name}-{font_name}",
        parent=style,
        fontName=font_name,
    )
    return Paragraph(safe, local)


def build_attendance_report_pdf(report: dict) -> bytes:
    ensure_report_fonts()
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="Attendance Report",
        author=report.get("organization_name") or "Check Station",
    )

    styles = getSampleStyleSheet()
    fonts = ensure_report_fonts()

    org_style = ParagraphStyle(
        "ReportOrg",
        parent=styles["Normal"],
        fontName=fonts["regular"],
        fontSize=9,
        textColor=colors.HexColor("#64748B"),
        leading=12,
        spaceAfter=2,
    )
    group_style = ParagraphStyle(
        "ReportGroup",
        parent=styles["Normal"],
        fontName=fonts["bold"],
        fontSize=16,
        textColor=colors.HexColor("#0F172A"),
        leading=20,
        spaceAfter=2,
    )
    meta_style = ParagraphStyle(
        "ReportMeta",
        parent=styles["Normal"],
        fontName=fonts["regular"],
        fontSize=10,
        textColor=colors.HexColor("#475569"),
        leading=13,
        spaceAfter=1,
    )
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Normal"],
        fontName=fonts["bold"],
        fontSize=11,
        textColor=colors.HexColor("#334155"),
        leading=14,
        spaceBefore=4,
        spaceAfter=2,
    )
    period_style = ParagraphStyle(
        "ReportPeriod",
        parent=styles["Normal"],
        fontName=fonts["bold"],
        fontSize=12,
        textColor=colors.HexColor("#0F172A"),
        leading=15,
        spaceAfter=1,
    )
    cell_style = ParagraphStyle(
        "ReportCell",
        parent=styles["Normal"],
        fontName=fonts["regular"],
        fontSize=9,
        leading=12,
        alignment=TA_LEFT,
    )
    header_cell_style = ParagraphStyle(
        "ReportHeaderCell",
        parent=styles["Normal"],
        fontName=fonts["bold"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#334155"),
        alignment=TA_LEFT,
    )

    story = []
    org_name = (report.get("organization_name") or "").strip()
    if org_name:
        story.append(_paragraph(org_name, org_style))

    story.append(_paragraph(report.get("group_name") or "Group", group_style))

    status = status_label(report.get("group_status"))
    if status:
        story.append(_paragraph(f"Status: {status}", meta_style))

    story.append(_paragraph("Attendance Report", title_style))
    for line in period_lines(report):
        story.append(_paragraph(line, period_style if line == (report.get("date_label") or "") else meta_style))

    story.append(Spacer(1, 8))

    columns = list(report.get("columns") or [])
    headers = [
        *report_identity_headers(report),
        *[col.get("label") or col.get("key") for col in columns],
    ]
    table_data = [[_paragraph(h, header_cell_style) for h in headers]]

    for row in flatten_report_rows(report):
        values = [
            *report_identity_values(row, report),
            *[cell_text(row["cells"].get(col["key"])) for col in columns],
        ]
        table_data.append([_paragraph(v, cell_style) for v in values])

    # Column widths adapt to available page width.
    usable_width = A4[0] - doc.leftMargin - doc.rightMargin
    show_class = report_shows_class_column(report)
    if show_class:
        date_width = usable_width * 0.18
        class_width = usable_width * 0.18
        name_width = usable_width * 0.22
        remaining = usable_width - date_width - class_width - name_width
        action_count = max(len(columns), 1)
        action_width = remaining / action_count
        col_widths = [date_width, class_width, name_width] + [action_width] * len(columns)
    else:
        name_width = usable_width * 0.28
        date_width = usable_width * 0.22
        remaining = usable_width - name_width - date_width
        action_count = max(len(columns), 1)
        action_width = remaining / action_count
        col_widths = [date_width, name_width] + [action_width] * len(columns)

    table = Table(table_data, colWidths=col_widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEF2F7")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#334155")),
                ("FONTNAME", (0, 0), (-1, 0), fonts["bold"]),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D0D7E2")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ]
        )
    )
    story.append(KeepTogether([table]) if len(table_data) <= 8 else table)

    def _page(canvas, _doc):
        canvas.saveState()
        canvas.setFont(fonts["regular"], 8)
        canvas.setFillColor(colors.HexColor("#94A3B8"))
        canvas.drawString(16 * mm, 10 * mm, "Attendance Report")
        canvas.drawRightString(A4[0] - 16 * mm, 10 * mm, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()

    doc.build(story, onFirstPage=_page, onLaterPages=_page)
    return buffer.getvalue()
