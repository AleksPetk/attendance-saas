"""WorkspaceStaffAccount email normalization and per-workspace validation."""

from django.core.exceptions import ValidationError

STAFF_EMAIL_DUPLICATE_MESSAGE = (
    "An account with this email already exists in this workspace."
)
STAFF_ADMIN_EMAIL_REQUIRED_MESSAGE = "Email is required for admin accounts."


def normalize_staff_email(email):
    if email is None:
        return ""
    normalized = str(email).strip().lower()
    return normalized


def validate_staff_account_email(*, organization, role, email, exclude_pk=None):
    """
    Normalize and validate a workspace staff/admin email for the given role.

    Raises django.core.exceptions.ValidationError with field keys on failure.
    Returns the normalized email (possibly empty for staff).
    """
    from organizations.models import WorkspaceStaffAccount, WorkspaceStaffRole

    normalized = normalize_staff_email(email)

    if role == WorkspaceStaffRole.ADMIN and not normalized:
        raise ValidationError({"email": STAFF_ADMIN_EMAIL_REQUIRED_MESSAGE})

    if normalized:
        qs = WorkspaceStaffAccount.objects.filter(
            organization=organization,
            email__iexact=normalized,
        )
        if exclude_pk is not None:
            qs = qs.exclude(pk=exclude_pk)
        if qs.exists():
            raise ValidationError({"email": STAFF_EMAIL_DUPLICATE_MESSAGE})

    return normalized
