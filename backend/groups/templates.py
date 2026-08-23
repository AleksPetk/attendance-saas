import re

from django.core.exceptions import ValidationError

ALLOWED_TEMPLATE_PLACEHOLDERS = frozenset({"name", "time", "group"})
PLACEHOLDER_PATTERN = re.compile(r"\{([^{}]+)\}")
SUPPORTED_PLACEHOLDER_HELP = "{name}, {time}, and {group}"


def validate_notification_template(value):
    """
    Allow documented placeholders and reject unknown {token} syntax.
    """
    text = value or ""
    unsupported = []
    for match in PLACEHOLDER_PATTERN.finditer(text):
        key = match.group(1).strip()
        if key not in ALLOWED_TEMPLATE_PLACEHOLDERS and key not in unsupported:
            unsupported.append(key)
    if unsupported:
        shown = ", ".join(f"{{{item}}}" for item in unsupported)
        raise ValidationError(
            f"Unsupported placeholder {shown}. "
            f"Supported placeholders are {SUPPORTED_PLACEHOLDER_HELP}."
        )
    return text


def render_notification_template(template, *, name, time, group):
    """Replace allowed placeholders. Unknown tokens are left unchanged."""
    text = template or ""
    replacements = {
        "name": str(name or ""),
        "time": str(time or ""),
        "group": str(group or ""),
    }

    def _replace(match):
        key = match.group(1).strip()
        if key in replacements:
            return replacements[key]
        return match.group(0)

    return PLACEHOLDER_PATTERN.sub(_replace, text)
