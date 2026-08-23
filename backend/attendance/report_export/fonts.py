"""Font registration for Unicode Attendance Report PDFs."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont

FONTS_DIR = Path(__file__).resolve().parent / "fonts"

FONT_REGULAR = "AttendanceReportSans"
FONT_BOLD = "AttendanceReportSans-Bold"
FONT_CJK = "HeiseiKakuGo-W5"

_CJK_RE = re.compile(
    r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff"
    r"\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]"
)


@lru_cache(maxsize=1)
def ensure_report_fonts() -> dict:
    """
    Register embedded Noto Sans (Latin/Cyrillic/Greek/etc.) and a CID CJK font.

    Noto Sans covers Bulgarian and accented European scripts. CJK names use the
    ReportLab Asian CID font so glyphs are not replaced with boxes.
    """
    regular_path = FONTS_DIR / "NotoSans-Regular.ttf"
    bold_path = FONTS_DIR / "NotoSans-Bold.ttf"
    if not regular_path.exists():
        raise FileNotFoundError(
            f"Missing PDF font file: {regular_path}. "
            "Noto Sans Regular/Bold must be present under report_export/fonts/."
        )

    registered = set(pdfmetrics.getRegisteredFontNames())
    if FONT_REGULAR not in registered:
        pdfmetrics.registerFont(TTFont(FONT_REGULAR, str(regular_path)))
    if FONT_BOLD not in registered:
        pdfmetrics.registerFont(
            TTFont(FONT_BOLD, str(bold_path if bold_path.exists() else regular_path))
        )
    if FONT_CJK not in set(pdfmetrics.getRegisteredFontNames()):
        pdfmetrics.registerFont(UnicodeCIDFont(FONT_CJK))

    return {
        "regular": FONT_REGULAR,
        "bold": FONT_BOLD,
        "cjk": FONT_CJK,
    }


def font_for_text(text: str, *, bold: bool = False) -> str:
    fonts = ensure_report_fonts()
    value = text or ""
    if _CJK_RE.search(value):
        return fonts["cjk"]
    return fonts["bold"] if bold else fonts["regular"]
