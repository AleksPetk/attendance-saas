"""Global email ownership checks for owner login and backup addresses."""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db.models import Q

User = get_user_model()


def normalize_owner_email(email):
    return User.objects.normalize_email(email or "")


def email_address_claimed(email, *, exclude_user=None):
    """
    Return True if `email` is already used as another account's primary login,
    verified backup, or pending backup/primary change address.

    Includes unverified provisional password signups so concurrent password
    registration still collapses onto one pending User row.
    """
    normalized = normalize_owner_email(email)
    if not normalized:
        return False

    qs = User.objects.all()
    if exclude_user is not None:
        qs = qs.exclude(pk=exclude_user.pk)

    if qs.filter(email=normalized).exists():
        return True
    if qs.filter(backup_email=normalized).exists():
        return True
    if qs.filter(pending_backup_email=normalized).exists():
        return True
    if qs.filter(pending_primary_email=normalized).exists():
        return True
    return False


def email_ownership_established(email, *, exclude_user=None) -> bool:
    """
    Return True when ownership of `email` is established (not merely reserved).

    Established ownership includes:
    - a verified primary login address
    - platform operator accounts using the address
    - verified backup / pending backup / pending primary-change addresses
    """
    normalized = normalize_owner_email(email)
    if not normalized:
        return False

    qs = User.objects.all()
    if exclude_user is not None:
        qs = qs.exclude(pk=exclude_user.pk)

    if qs.filter(email=normalized, email_verified=True).exists():
        return True
    if qs.filter(email=normalized).filter(
        Q(is_staff=True) | Q(is_superuser=True)
    ).exists():
        return True
    if qs.filter(backup_email=normalized).exists():
        return True
    if qs.filter(pending_backup_email=normalized).exists():
        return True
    if qs.filter(pending_primary_email=normalized).exists():
        return True
    return False


def get_provisional_unverified_owner(email):
    """
    Return the pending User for this primary email, if any.

    Provisional = never verified, not a platform operator, no OAuth links yet.
    May be inactive (abandoned / deactivated pending signup).
    """
    normalized = normalize_owner_email(email)
    if not normalized:
        return None

    user = User.objects.filter(email=normalized).first()
    if user is None:
        return None
    if user.email_verified or user.is_staff or user.is_superuser:
        return None
    from accounts.owner_auth_provider_models import OwnerAuthProviderLink

    if OwnerAuthProviderLink.objects.filter(user=user).exists():
        return None
    return user


def validate_backup_email_for_user(user, email):
    normalized = normalize_owner_email(email)
    if not normalized:
        raise ValidationError("Enter a valid email address.")

    if normalized == user.email:
        raise ValidationError("Backup email cannot match your login email.")
    if normalized == user.pending_primary_email:
        raise ValidationError(
            "Finish or cancel your pending login email change before using this address as backup."
        )
    if email_address_claimed(normalized, exclude_user=user):
        raise ValidationError("This email address is already in use.")
    return normalized


def validate_primary_email_for_user(user, email):
    normalized = normalize_owner_email(email)
    if not normalized:
        raise ValidationError("Enter a valid email address.")

    if normalized == user.email:
        raise ValidationError("This is already your login email.")
    if normalized == user.backup_email:
        raise ValidationError(
            "Remove or change your backup email before using it as your login email."
        )
    if normalized == user.pending_backup_email:
        raise ValidationError(
            "Finish or cancel your pending backup email change before using this address as login email."
        )
    if email_address_claimed(normalized, exclude_user=user):
        raise ValidationError("This email address is already in use.")
    return normalized
