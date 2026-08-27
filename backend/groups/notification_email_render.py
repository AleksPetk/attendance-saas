"""
After-action notification email rendering (plain text + email-safe HTML).

Uses the Group's active Card/Input kiosk template family as the visual source.
Customer message text is escaped; no arbitrary HTML from templates.
"""

import logging
from html import escape

from attendance.attendance_report import format_local_action_time

from groups.notification_email_themes import get_email_theme, normalize_email_theme_key
from groups.templates import render_notification_template

logger = logging.getLogger("groups.notification_email_render")

ACTION_SUMMARY_LABELS = {
    "check_in": "Checked in",
    "check_out": "Checked out",
    "break_start": "Break started",
    "break_end": "Break ended",
}

ACTION_HEADLINE_LABELS = {
    "check_in": "Check-in",
    "check_out": "Check-out",
    "break_start": "Break start",
    "break_end": "Break end",
}


def resolve_group_flow_template_key(group):
    """
    Canonical visual template for notification email — same source as kiosk flow.

    Card / Structured → card_template
    Input → input_template
    """
    from groups.models import GroupType
    from kiosk_builder.kiosk_settings_constants import KioskType
    from kiosk_builder.models import ensure_group_kiosk_design, ensure_group_kiosk_settings
    from kiosk_builder.presets import CARD_TEMPLATES, INPUT_TEMPLATES

    settings = ensure_group_kiosk_settings(group)
    design = ensure_group_kiosk_design(group)
    main = (getattr(design, "config", None) or {}).get("main") or {}

    structured = getattr(group, "group_type", None) == GroupType.STRUCTURED
    use_card = structured or getattr(settings, "mode", None) == KioskType.CARD

    if use_card:
        key = main.get("card_template")
        if key in CARD_TEMPLATES:
            return key
        return "clean"

    key = main.get("input_template")
    if key in INPUT_TEMPLATES:
        return key
    return "clean"


def action_summary_label(action_type):
    return ACTION_SUMMARY_LABELS.get(action_type, "Attendance updated")


def action_headline_label(action_type):
    return ACTION_HEADLINE_LABELS.get(action_type, "Attendance")


def format_notification_time(performed_at, *, organization=None, timezone_name=None):
    """24-hour HH:MM using the same timezone source as Attendance Report / History."""
    return format_local_action_time(
        performed_at,
        organization=organization,
        timezone_name=timezone_name,
    )


def escape_multiline_html(text):
    """Escape text and convert newlines to <br> (no raw HTML from customers)."""
    escaped = escape(text or "")
    # Normalize Windows/Mac newlines then break.
    escaped = escaped.replace("\r\n", "\n").replace("\r", "\n")
    return escaped.replace("\n", "<br>\n")


def build_plain_text_body(
    *,
    brand_name,
    participant_name,
    action_type,
    display_time,
    customer_message,
):
    action = action_summary_label(action_type)
    headline = action_headline_label(action_type)
    brand = (brand_name or "").strip()
    name = (participant_name or "").strip() or "Participant"
    message = (customer_message or "").strip()

    lines = []
    if brand:
        lines.append(brand)
        lines.append("")
    lines.append(headline)
    lines.append("")
    lines.append(f"Participant: {name}")
    lines.append(f"Action: {action}")
    lines.append(f"Time: {display_time}")
    if message:
        lines.append("")
        lines.append(message)
    lines.append("")
    lines.append("Sent via CheckStation")
    return "\n".join(lines)


def _summary_rows_html(*, participant_name, action_label, display_time, theme):
    muted = theme["muted"]
    text = theme["text"]
    border = theme["border"]
    rows = [
        ("Participant", participant_name),
        ("Action", action_label),
        ("Time", display_time),
    ]
    parts = []
    for label, value in rows:
        parts.append(
            "<tr>"
            f'<td style="padding:6px 0;color:{muted};font-size:13px;'
            f'border-bottom:1px solid {border};width:38%;vertical-align:top;">'
            f"{escape(label)}</td>"
            f'<td style="padding:6px 0;color:{text};font-size:14px;font-weight:600;'
            f'border-bottom:1px solid {border};vertical-align:top;">'
            f"{escape(value)}</td>"
            "</tr>"
        )
    return "".join(parts)


def _panel_border_style(theme):
    style = theme["style"]
    accent = theme["accent"]
    border = theme["border"]
    if style == "executive":
        return f"border:1px solid {border};border-left:4px solid {accent};"
    if style == "ticket":
        return f"border:2px dashed {border};"
    if style == "comic":
        return f"border:3px solid {border};"
    if style == "terminal":
        return f"border:1px solid {border};"
    if style == "cyber":
        return f"border:1px solid {accent};"
    if style == "playful":
        return f"border:3px solid {border};"
    if style == "heart":
        return f"border:2px solid {border};"
    if style == "minimal":
        return f"border:1px solid {border};"
    return f"border:1px solid {border};"


def build_html_body(
    *,
    brand_name,
    participant_name,
    action_type,
    display_time,
    customer_message,
    theme_key,
):
    theme = get_email_theme(theme_key)
    brand = (brand_name or "").strip() or "CheckStation"
    name = (participant_name or "").strip() or "Participant"
    action = action_summary_label(action_type)
    headline = action_headline_label(action_type)
    message_html = escape_multiline_html(customer_message)
    prefix = theme.get("header_prefix") or ""
    mark = theme.get("mark") or "✓"
    border_style = _panel_border_style(theme)

    deco = ""
    if theme["style"] == "playful":
        deco = (
            f'<div style="color:{theme["accent"]};font-size:16px;'
            f'letter-spacing:4px;margin:0 0 10px;">★ · ★ · ★</div>'
        )
    elif theme["style"] == "victory":
        deco = (
            f'<div style="color:{theme["accent"]};font-size:14px;'
            f'letter-spacing:3px;margin:0 0 10px;">★ ✦ ★</div>'
        )
    elif theme["style"] == "heart":
        deco = (
            f'<div style="color:{theme["accent"]};font-size:18px;'
            f'margin:0 0 8px;">♥</div>'
        )

    message_block = ""
    if (customer_message or "").strip():
        message_block = (
            f'<div style="margin-top:18px;padding-top:14px;'
            f'border-top:1px solid {theme["border"]};'
            f'color:{theme["text"]};font-size:15px;line-height:1.55;">'
            f"{message_html}"
            f"</div>"
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{escape(headline)}</title>
</head>
<body style="margin:0;padding:0;background:{theme["page_bg"]};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
 style="background:{theme["page_bg"]};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="max-width:560px;background:{theme["panel_bg"]};{border_style}
       border-radius:{theme["radius"]};font-family:{theme["font"]};">
        <tr>
          <td style="padding:28px 24px 24px;color:{theme["text"]};">
            {deco}
            <div style="font-size:12px;letter-spacing:0.04em;text-transform:uppercase;
             color:{theme["muted"]};margin:0 0 8px;font-weight:600;">
              {escape(prefix + brand)}
            </div>
            <div style="font-size:22px;font-weight:700;line-height:1.3;margin:0 0 6px;
             color:{theme["text"]};">
              <span style="color:{theme["accent"]};margin-right:6px;">{escape(mark)}</span>
              {escape(headline)}
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin-top:16px;border-collapse:collapse;">
              {_summary_rows_html(
                  participant_name=name,
                  action_label=action,
                  display_time=display_time,
                  theme=theme,
              )}
            </table>
            {message_block}
            <div style="margin-top:22px;font-size:12px;color:{theme["muted"]};">
              Sent via CheckStation
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
"""


def render_after_action_notification(
    *,
    group,
    action_record,
    participant_name,
    kind,
    customer_template,
    brand_name="",
    theme_key=None,
    timezone_name=None,
):
    """
    Build multipart bodies for an after-action notification.

    Returns dict: theme_key, text_body, html_body, display_time, action_type.
    On unexpected HTML failure, html_body falls back to a simple escaped paragraph.
    """
    action_type = getattr(action_record, "action_type", None) or kind
    performed_at = getattr(action_record, "performed_at", None)
    organization = getattr(group, "organization", None)
    display_time = format_notification_time(
        performed_at,
        organization=organization,
        timezone_name=timezone_name,
    )
    name = participant_name or getattr(action_record, "participant_name_snapshot", "") or ""
    group_name = getattr(group, "name", "") or ""

    customer_message = render_notification_template(
        customer_template,
        name=name,
        time=display_time,
        group=group_name,
    )

    if theme_key is None:
        try:
            theme_key = resolve_group_flow_template_key(group)
        except Exception:
            logger.exception(
                "Could not resolve kiosk template for notification email group_id=%s",
                getattr(group, "id", None),
            )
            theme_key = "clean"
    theme_key = normalize_email_theme_key(theme_key)

    brand = (brand_name or "").strip()
    if not brand:
        brand = group_name

    text_body = build_plain_text_body(
        brand_name=brand,
        participant_name=name,
        action_type=action_type,
        display_time=display_time,
        customer_message=customer_message,
    )

    try:
        html_body = build_html_body(
            brand_name=brand,
            participant_name=name,
            action_type=action_type,
            display_time=display_time,
            customer_message=customer_message,
            theme_key=theme_key,
        )
    except Exception:
        logger.exception(
            "Themed HTML render failed; using plain HTML fallback group_id=%s theme=%s",
            getattr(group, "id", None),
            theme_key,
        )
        html_body = f"<p>{escape(customer_message)}</p>"

    return {
        "theme_key": theme_key,
        "text_body": text_body,
        "html_body": html_body,
        "display_time": display_time,
        "action_type": action_type,
        "customer_message": customer_message,
    }
