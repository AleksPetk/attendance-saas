"""
Kiosk design config JSON schema — version 1.

Central module for default config generation, validation, and normalization.
All config validation lives here so it is not scattered across views/serializers.

Config version history:
  1 — initial schema (header/main/footer with presets, normalized positions)

Overlay representation:
  -1.0 = fully dark (black overlay), 0.0 = no overlay, +1.0 = fully light (white overlay).

All movable positions/sizes are normalized fractions (0.0–1.0) relative to
their containing section.  Font sizes use rem.
"""

import copy
import re

from kiosk_builder.presets import (
    BUTTON_PRESETS,
    CARD_PRESETS,
    CARD_TEMPLATES,
    FONT_IDENTIFIERS,
    INPUT_PRESETS,
    INPUT_TEMPLATES,
    MAIN_LAYOUT_PRESETS,
    derive_card_template,
    derive_input_template,
)

CURRENT_CONFIG_VERSION = 1

HEADER_HEIGHT_MIN = 0.05
HEADER_HEIGHT_MAX = 0.25
FOOTER_HEIGHT_MIN = 0.04
FOOTER_HEIGHT_MAX = 0.18
FONT_SIZE_MIN = 0.5
FONT_SIZE_MAX = 6.0
OVERLAY_MIN = -1.0
OVERLAY_MAX = 1.0
ZOOM_MIN = 1.0
ZOOM_MAX = 5.0
GRADIENT_ANGLE_MIN = 0
GRADIENT_ANGLE_MAX = 360
MAX_FOOTER_LINES = 1
MAX_TITLE_LENGTH = 150
MAX_FOOTER_LINE_LENGTH = 200
MAX_TEXT_LENGTH = 500
FOOTER_LOGO_SIZE_MIN = 0.35
FOOTER_LOGO_SIZE_MAX = 1.0
HEADER_LOGO_SIZE_MIN = 0.35
HEADER_LOGO_SIZE_MAX = 1.0

BACKGROUND_MODES_HEADER = {"solid", "gradient"}
BACKGROUND_MODES_MAIN = {"solid", "gradient", "image"}
TEXT_ALIGNMENTS = {"left", "center", "right"}
FOOTER_LOGO_ALIGNMENTS = {"left", "center", "right"}
HEADER_ALIGNMENTS = {"left", "center", "right"}

_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_DANGEROUS_RE = re.compile(
    r"<\s*script|javascript\s*:|on\w+\s*=|expression\s*\(|url\s*\(",
    re.IGNORECASE,
)


def _default_text_effects():
    return {"shadow": False, "outline": False}


def default_config(*, header_title_text=""):
    """Return a complete default version-1 config."""
    return {
        "version": CURRENT_CONFIG_VERSION,
        "header": {
            # enabled is deprecated: Header/Main/Footer always exist. Kept True for legacy JSON.
            "enabled": True,
            "height": 0.12,
            "background": {
                "mode": "solid",
                "color": "#2563EB",
                "color2": None,
                "gradient_angle": 90,
            },
            "logo": None,
            "alignment": "left",
            "title": {
                "text": header_title_text or "",
                "font": "inter",
                "size_rem": 1.5,
                "color": "#FFFFFF",
                "effects": _default_text_effects(),
            },
        },
        "main": {
            "background": {
                "mode": "solid",
                "color": "#FFFFFF",
                "color2": None,
                "gradient_angle": 180,
            },
            "image_transform": {
                "focal_x": 0.5,
                "focal_y": 0.5,
                "zoom": 1.0,
            },
            "overlay": 0.0,
            "layout_preset": "centered",
            "input_template": "clean",
            "card_template": "clean",
            "title": {
                "text": "",
                "font": "inter",
                "size_rem": 2.0,
                "color": "#111827",
                "alignment": "center",
                "effects": _default_text_effects(),
            },
            "button_preset": "rounded",
            "input_preset": "outlined",
            "card_preset": "elevated",
        },
        "footer": {
            # enabled is deprecated: Footer always exists. Kept True for legacy JSON.
            "enabled": True,
            "height": 0.06,
            "background": {
                "mode": "solid",
                "color": "#1E293B",
                "color2": None,
                "gradient_angle": 90,
            },
            "logo": None,
            "text": {
                "lines": [],
                "alignment": "center",
                "font": "inter",
                "size_rem": 0.875,
                "color": "#94A3B8",
                "effects": _default_text_effects(),
            },
        },
    }


def default_config_for_classic(title_text=""):
    """Map legacy 'classic' theme to a default design with light neutral colors."""
    config = default_config(header_title_text=title_text)
    config["header"]["background"]["color"] = "#3B82F6"
    config["header"]["title"]["color"] = "#FFFFFF"
    config["main"]["background"]["color"] = "#F8FAFC"
    config["main"]["title"]["color"] = "#1E293B"
    return config


def default_config_for_modern(title_text=""):
    """Map legacy 'modern' theme to a default design with dark colors."""
    config = default_config(header_title_text=title_text)
    config["header"]["background"]["color"] = "#0F172A"
    config["header"]["title"]["color"] = "#F8FAFC"
    config["main"]["background"]["color"] = "#1E293B"
    config["main"]["title"]["color"] = "#F1F5F9"
    config["footer"]["background"]["color"] = "#020617"
    config["footer"]["text"]["color"] = "#64748B"
    return config


class ConfigValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors if isinstance(errors, list) else [errors]
        super().__init__(", ".join(self.errors))


def _is_valid_color(value):
    if value is None:
        return True
    return isinstance(value, str) and bool(_HEX_COLOR_RE.match(value))


def _contains_dangerous_content(value):
    if not isinstance(value, str):
        return False
    return bool(_DANGEROUS_RE.search(value))


def _clamp(value, lo, hi):
    return max(lo, min(hi, value))


def _validate_safe_string(value, field_path, max_length, errors):
    if not isinstance(value, str):
        errors.append(f"{field_path}: must be a string.")
        return ""
    if len(value) > max_length:
        errors.append(f"{field_path}: exceeds maximum length of {max_length}.")
    if _contains_dangerous_content(value):
        errors.append(f"{field_path}: contains disallowed content.")
    return value


def _validate_color(value, field_path, errors, *, allow_none=False):
    if value is None and allow_none:
        return None
    if not _is_valid_color(value):
        errors.append(f"{field_path}: invalid color (expected #RRGGBB hex).")
        return "#000000"
    return value


def _validate_background(bg, section_path, errors, *, allowed_modes):
    if not isinstance(bg, dict):
        errors.append(f"{section_path}.background: must be an object.")
        return {"mode": "solid", "color": "#FFFFFF", "color2": None, "gradient_angle": 90}
    mode = bg.get("mode", "solid")
    if mode not in allowed_modes:
        errors.append(f"{section_path}.background.mode: must be one of {sorted(allowed_modes)}.")
        mode = "solid"
    bg["mode"] = mode
    bg["color"] = _validate_color(bg.get("color"), f"{section_path}.background.color", errors)
    bg["color2"] = _validate_color(
        bg.get("color2"), f"{section_path}.background.color2", errors, allow_none=True
    )
    angle = bg.get("gradient_angle", 90)
    if not isinstance(angle, (int, float)):
        angle = 90
    bg["gradient_angle"] = int(_clamp(angle, GRADIENT_ANGLE_MIN, GRADIENT_ANGLE_MAX))
    return bg


def _validate_effects(effects, field_path, errors):
    if not isinstance(effects, dict):
        return _default_text_effects()
    result = {}
    for key in ("shadow", "outline"):
        val = effects.get(key, False)
        result[key] = bool(val)
    return result


def _validate_text_style(ts, section_path, errors, *, has_position=False, has_alignment=False):
    if not isinstance(ts, dict):
        errors.append(f"{section_path}: must be an object.")
        return default_config()["header"]["title"]
    text = _validate_safe_string(
        ts.get("text", ""), f"{section_path}.text", MAX_TITLE_LENGTH, errors
    )
    if "\n" in text:
        errors.append(f"{section_path}.text: multiline text is not allowed here.")
        text = text.replace("\n", " ")
    ts["text"] = text

    font = ts.get("font", "inter")
    if font not in FONT_IDENTIFIERS:
        errors.append(f"{section_path}.font: unknown font identifier '{font}'.")
        font = "inter"
    ts["font"] = font

    size = ts.get("size_rem", 1.5)
    if not isinstance(size, (int, float)):
        size = 1.5
    ts["size_rem"] = round(_clamp(float(size), FONT_SIZE_MIN, FONT_SIZE_MAX), 3)

    ts["color"] = _validate_color(ts.get("color"), f"{section_path}.color", errors)
    ts["effects"] = _validate_effects(ts.get("effects", {}), f"{section_path}.effects", errors)

    if has_position:
        for coord in ("x", "y"):
            val = ts.get(coord, 0.5)
            if not isinstance(val, (int, float)):
                val = 0.5
            ts[coord] = round(_clamp(float(val), 0.0, 1.0), 4)
    else:
        # Free-position coordinates are obsolete for Main/Header titles.
        ts.pop("x", None)
        ts.pop("y", None)

    if has_alignment:
        alignment = ts.get("alignment", "center")
        if alignment not in TEXT_ALIGNMENTS:
            errors.append(
                f"{section_path}.alignment: must be one of {sorted(TEXT_ALIGNMENTS)}."
            )
            alignment = "center"
        ts["alignment"] = alignment

    return ts


def _derive_header_alignment(header):
    """Map legacy free-position x values to left/center/right when needed."""
    explicit = header.get("alignment")
    if explicit in HEADER_ALIGNMENTS:
        return explicit

    def from_x(raw):
        if not isinstance(raw, (int, float)):
            return None
        if raw < 0.33:
            return "left"
        if raw > 0.66:
            return "right"
        return "center"

    logo = header.get("logo")
    if isinstance(logo, dict):
        derived = from_x(logo.get("x"))
        if derived:
            return derived

    title = header.get("title")
    if isinstance(title, dict):
        derived = from_x(title.get("x"))
        if derived:
            return derived

    return "left"


def _validate_header_logo(logo, errors):
    """Header logo: size only. Alignment lives on header.alignment."""
    if logo is None:
        return None
    if not isinstance(logo, dict):
        errors.append("header.logo: must be an object or null.")
        return None
    size = logo.get("size")
    if not isinstance(size, (int, float)):
        height = logo.get("height")
        width = logo.get("width")
        if isinstance(height, (int, float)):
            size = height
        elif isinstance(width, (int, float)):
            size = min(1.0, float(width) * 2.5)
        else:
            size = 0.75
    size = round(_clamp(float(size), HEADER_LOGO_SIZE_MIN, HEADER_LOGO_SIZE_MAX), 3)
    return {"size": size}


def _validate_logo(logo, errors):
    """Deprecated free-position logo box — retained only for migration helpers."""
    return _validate_header_logo(logo, errors)


def _validate_image_transform(it, errors):
    if not isinstance(it, dict):
        return {"focal_x": 0.5, "focal_y": 0.5, "zoom": 1.0}
    for key in ("focal_x", "focal_y"):
        val = it.get(key, 0.5)
        if not isinstance(val, (int, float)):
            val = 0.5
        it[key] = round(_clamp(float(val), 0.0, 1.0), 4)
    zoom = it.get("zoom", 1.0)
    if not isinstance(zoom, (int, float)):
        zoom = 1.0
    it["zoom"] = round(_clamp(float(zoom), ZOOM_MIN, ZOOM_MAX), 3)
    return it


def _normalize_footer_line(raw, field_path, errors):
    """Footer allows at most one visual line; strip embedded newlines."""
    if raw is None:
        return ""
    if not isinstance(raw, str):
        errors.append(f"{field_path}: must be a string.")
        return ""
    if "\n" in raw or "\r" in raw:
        errors.append(f"{field_path}: must be a single line (no line breaks).")
        raw = " ".join(raw.splitlines()).strip()
    return _validate_safe_string(raw, field_path, MAX_FOOTER_LINE_LENGTH, errors)


def _validate_footer_text(ft, errors):
    if not isinstance(ft, dict):
        errors.append("footer.text: must be an object.")
        d = default_config()["footer"]["text"]
        return d
    lines = ft.get("lines", [])
    if not isinstance(lines, list):
        errors.append("footer.text.lines: must be a list.")
        lines = []
    # Legacy multiline values: keep the first non-empty line only.
    normalized = []
    for i, line in enumerate(lines):
        if normalized:
            break
        line_str = _normalize_footer_line(line, f"footer.text.lines[{i}]", errors)
        if line_str:
            normalized.append(line_str)
    ft["lines"] = normalized

    alignment = ft.get("alignment", "center")
    if alignment not in TEXT_ALIGNMENTS:
        errors.append(f"footer.text.alignment: must be one of {sorted(TEXT_ALIGNMENTS)}.")
        alignment = "center"
    ft["alignment"] = alignment

    font = ft.get("font", "inter")
    if font not in FONT_IDENTIFIERS:
        errors.append(f"footer.text.font: unknown font '{font}'.")
        font = "inter"
    ft["font"] = font

    size = ft.get("size_rem", 0.875)
    if not isinstance(size, (int, float)):
        size = 0.875
    ft["size_rem"] = round(_clamp(float(size), FONT_SIZE_MIN, FONT_SIZE_MAX), 3)

    ft["color"] = _validate_color(ft.get("color"), "footer.text.color", errors)
    ft["effects"] = _validate_effects(ft.get("effects", {}), "footer.text.effects", errors)
    return ft


def _validate_footer_logo(logo, errors):
    """Footer image placement presets (not free-drag). None means no placement config."""
    if logo is None:
        return None
    if not isinstance(logo, dict):
        errors.append("footer.logo: must be an object or null.")
        return None
    alignment = logo.get("alignment", "left")
    if alignment not in FOOTER_LOGO_ALIGNMENTS:
        errors.append(
            f"footer.logo.alignment: must be one of {sorted(FOOTER_LOGO_ALIGNMENTS)}."
        )
        alignment = "left"
    size = logo.get("size", 0.75)
    if not isinstance(size, (int, float)):
        size = 0.75
    size = round(_clamp(float(size), FOOTER_LOGO_SIZE_MIN, FOOTER_LOGO_SIZE_MAX), 3)
    return {"alignment": alignment, "size": size}


def validate_config(config):
    """
    Validate and normalize a kiosk design config dict.

    Returns (normalized_config, errors).  If errors is non-empty the config
    should be rejected.  The normalized config has clamped/corrected values
    for minor issues; structural problems produce errors.
    """
    if not isinstance(config, dict):
        return default_config(), ["config: must be a JSON object."]

    errors = []
    result = {}

    version = config.get("version")
    if version != CURRENT_CONFIG_VERSION:
        errors.append(f"version: expected {CURRENT_CONFIG_VERSION}, got {version}.")
    result["version"] = CURRENT_CONFIG_VERSION

    # --- Header ---
    header = config.get("header")
    if not isinstance(header, dict):
        errors.append("header: must be an object.")
        result["header"] = default_config()["header"]
    else:
        h = {}
        # Structural sections always exist; ignore legacy enabled=false.
        h["enabled"] = True
        height = header.get("height", 0.12)
        if not isinstance(height, (int, float)):
            height = 0.12
        h["height"] = round(_clamp(float(height), HEADER_HEIGHT_MIN, HEADER_HEIGHT_MAX), 4)
        h["background"] = _validate_background(
            header.get("background", {}), "header", errors,
            allowed_modes=BACKGROUND_MODES_HEADER,
        )
        h["alignment"] = _derive_header_alignment(header)
        if header.get("alignment") is not None and header.get("alignment") not in HEADER_ALIGNMENTS:
            errors.append(
                f"header.alignment: must be one of {sorted(HEADER_ALIGNMENTS)}."
            )
        h["logo"] = _validate_header_logo(header.get("logo"), errors)
        # Title: style only — free x/y positioning removed.
        h["title"] = _validate_text_style(
            header.get("title", {}), "header.title", errors, has_position=False
        )
        result["header"] = h

    # --- Main ---
    main = config.get("main")
    if not isinstance(main, dict):
        errors.append("main: must be an object.")
        result["main"] = default_config()["main"]
    else:
        m = {}
        m["background"] = _validate_background(
            main.get("background", {}), "main", errors,
            allowed_modes=BACKGROUND_MODES_MAIN,
        )
        m["image_transform"] = _validate_image_transform(
            main.get("image_transform", {}), errors
        )
        overlay = main.get("overlay", 0.0)
        if not isinstance(overlay, (int, float)):
            overlay = 0.0
        m["overlay"] = round(_clamp(float(overlay), OVERLAY_MIN, OVERLAY_MAX), 3)

        layout = main.get("layout_preset", "centered")
        if layout not in MAIN_LAYOUT_PRESETS:
            errors.append(f"main.layout_preset: unknown preset '{layout}'.")
            layout = "centered"
        m["layout_preset"] = layout

        m["title"] = _validate_text_style(
            main.get("title", {}),
            "main.title",
            errors,
            has_position=False,
            has_alignment=True,
        )

        for preset_key, registry in [
            ("button_preset", BUTTON_PRESETS),
            ("input_preset", INPUT_PRESETS),
            ("card_preset", CARD_PRESETS),
        ]:
            val = main.get(preset_key, next(iter(registry)))
            if val not in registry:
                errors.append(f"main.{preset_key}: unknown preset '{val}'.")
                val = next(iter(registry))
            m[preset_key] = val

        # Canonical Input template id. Prefer explicit value; otherwise derive from
        # legacy layout/button/input so older designs keep working.
        # Do not force-sync layout from the template here — Card mode still owns
        # layout_preset independently. The builder writes the full package when
        # the user picks an Input template.
        template = main.get("input_template")
        if template not in INPUT_TEMPLATES:
            if template is not None:
                errors.append(f"main.input_template: unknown template '{template}'.")
            template = derive_input_template(
                m["layout_preset"], m["button_preset"], m["input_preset"]
            )
        m["input_template"] = template

        # Canonical Card template id. Prefer explicit value; otherwise derive from
        # legacy layout/card so older designs keep working.
        # Do not force-sync layout from the template here — Input mode still owns
        # layout_preset via input_template. The builder writes the full package when
        # the user picks a Card template.
        card_template = main.get("card_template")
        if card_template not in CARD_TEMPLATES:
            if card_template is not None:
                errors.append(f"main.card_template: unknown template '{card_template}'.")
            card_template = derive_card_template(m["layout_preset"], m["card_preset"])
        m["card_template"] = card_template

        result["main"] = m

    # --- Footer ---
    footer = config.get("footer")
    if not isinstance(footer, dict):
        errors.append("footer: must be an object.")
        result["footer"] = default_config()["footer"]
    else:
        f = {}
        # Structural sections always exist; ignore legacy enabled=false.
        f["enabled"] = True
        height = footer.get("height", 0.06)
        if not isinstance(height, (int, float)):
            height = 0.06
        f["height"] = round(_clamp(float(height), FOOTER_HEIGHT_MIN, FOOTER_HEIGHT_MAX), 4)
        f["background"] = _validate_background(
            footer.get("background", {}), "footer", errors,
            allowed_modes=BACKGROUND_MODES_HEADER,
        )
        f["logo"] = _validate_footer_logo(footer.get("logo"), errors)
        f["text"] = _validate_footer_text(footer.get("text", {}), errors)
        result["footer"] = f

    return result, errors
