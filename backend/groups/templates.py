import re

from django.core.exceptions import ValidationError

ALLOWED_TEMPLATE_PLACEHOLDERS = frozenset({"name", "time", "group"})
PLACEHOLDER_PATTERN = re.compile(r"\{([^{}]+)\}")
SUPPORTED_PLACEHOLDER_HELP = "{name}, {time}, and {group}"


def validate_notification_template(value):
    """
    Allow documented placeholders and reject unknown {token} syntax.

    Templates are stored only. This slice does not render or send email.
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
