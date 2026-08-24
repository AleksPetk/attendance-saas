"""
Group-level Forward Emails: normalization and validation.

Forward addresses are Group configuration recipients for after-action copies.
They are not part of GroupEmailSender credentials.
"""

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

MAX_FORWARD_EMAILS = 3


def normalize_email_address(value):
    """Canonical email normalization for Group mail recipients."""
    return (value or "").strip().lower()


def normalize_forward_emails(raw):
    """
    Normalize and validate a forward-email list.

    Returns a deduplicated list of 0–MAX_FORWARD_EMAILS addresses.
    Empty / whitespace-only entries are dropped.
    Raises ValidationError for invalid shape, invalid emails, or too many.
    """
    if raw is None:
        return []
    if not isinstance(raw, (list, tuple)):
        raise ValidationError({"forward_emails": "Forward emails must be a list."})
    if len(raw) > MAX_FORWARD_EMAILS:
        raise ValidationError(
            {
                "forward_emails": (
                    f"At most {MAX_FORWARD_EMAILS} forwarding email addresses are allowed."
                )
            }
        )

    normalized = []
    seen = set()
    for index, item in enumerate(raw):
        if item is None:
            continue
        if not isinstance(item, str):
            raise ValidationError(
                {"forward_emails": f"Forward email {index + 1} must be a string."}
            )
        email = normalize_email_address(item)
        if not email:
            continue
        try:
            validate_email(email)
        except ValidationError as exc:
            raise ValidationError(
                {"forward_emails": f"Forward email {index + 1} is not a valid email address."}
            ) from exc
        if email in seen:
            raise ValidationError(
                {"forward_emails": "Duplicate forwarding email addresses are not allowed."}
            )
        seen.add(email)
        normalized.append(email)
    return normalized


def unique_after_action_recipients(
    *,
    participant_emails=None,
    participant_email=None,
    forward_emails=None,
):
    """
    Build ordered unique deliveries: participant addresses first, then forwards.

    ``participant_email`` remains accepted for a single address.
    Returns list of (email, recipient_kind) where kind is
    ``participant`` or ``forward``.
    """
    from groups.email_sender_models import GroupEmailRecipientKind

    result = []
    seen = set()
    emails = list(participant_emails or [])
    if not emails and participant_email:
        emails = [participant_email]
    for email in emails:
        normalized = normalize_email_address(email)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append((normalized, GroupEmailRecipientKind.PARTICIPANT))
    for email in forward_emails or []:
        normalized = normalize_email_address(email)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append((normalized, GroupEmailRecipientKind.FORWARD))
    return result
