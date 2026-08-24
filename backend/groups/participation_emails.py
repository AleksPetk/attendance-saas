"""
Participation emails: up to 3 notification recipients per Group/Class participation.

Canonical storage is a JSON list on GroupMembership / GroupOnlyParticipant.
Legacy scalar fields (participation_email / email) mirror the first address.
"""

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from groups.forward_emails import normalize_email_address

MAX_PARTICIPATION_EMAILS = 3


def normalize_participation_emails(raw, *, field_name="participation_emails"):
    """
    Normalize and validate a participation-email list.

    Returns 0–MAX_PARTICIPATION_EMAILS unique normalized addresses.
    Empty / whitespace-only entries are dropped.
    """
    if raw is None:
        return []
    if isinstance(raw, str):
        # Allow a single scalar or JSON array string from multipart forms.
        text = raw.strip()
        if not text:
            return []
        if text.startswith("["):
            import json

            try:
                raw = json.loads(text)
            except json.JSONDecodeError as exc:
                raise ValidationError(
                    {field_name: "Participation emails must be a list."}
                ) from exc
        else:
            raw = [text]
    if not isinstance(raw, (list, tuple)):
        raise ValidationError({field_name: "Participation emails must be a list."})
    if len(raw) > MAX_PARTICIPATION_EMAILS:
        raise ValidationError(
            {
                field_name: (
                    f"At most {MAX_PARTICIPATION_EMAILS} participation email "
                    "addresses are allowed."
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
                {field_name: f"Group email {index + 1} must be a string."}
            )
        email = normalize_email_address(item)
        if not email:
            continue
        try:
            validate_email(email)
        except ValidationError as exc:
            raise ValidationError(
                {field_name: f"Group email {index + 1} is not a valid email address."}
            ) from exc
        if email in seen:
            raise ValidationError(
                {field_name: "Duplicate participation email addresses are not allowed."}
            )
        seen.add(email)
        normalized.append(email)
    return normalized


def primary_participation_email(emails):
    """First participation email, or empty string."""
    if not emails:
        return ""
    return emails[0]


def participation_emails_for_membership(membership):
    """Canonical list for a GroupMembership row."""
    raw = getattr(membership, "participation_emails", None)
    if raw:
        try:
            return normalize_participation_emails(raw)
        except ValidationError:
            pass
    legacy = normalize_email_address(getattr(membership, "participation_email", "") or "")
    return [legacy] if legacy else []


def participation_emails_for_visitor(participant):
    """Canonical list for a GroupOnlyParticipant row."""
    raw = getattr(participant, "participation_emails", None)
    if raw:
        try:
            return normalize_participation_emails(raw)
        except ValidationError:
            pass
    legacy = normalize_email_address(getattr(participant, "email", "") or "")
    return [legacy] if legacy else []


def sync_legacy_participation_email(instance, *, legacy_attr):
    """Keep deprecated scalar column equal to the first list entry."""
    emails = normalize_participation_emails(
        getattr(instance, "participation_emails", None) or []
    )
    instance.participation_emails = emails
    setattr(instance, legacy_attr, primary_participation_email(emails))
    return emails
