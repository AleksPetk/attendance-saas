"""Owner backup email and primary login email change flows."""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone

from accounts.email_uniqueness import (
    email_address_claimed,
    validate_backup_email_for_user,
    validate_primary_email_for_user,
)
from accounts.emails import (
    send_backup_email_verification,
    send_primary_email_change_verification,
    send_primary_email_changed_notice,
)
from accounts.exceptions import EmailCooldown
from accounts.services import _cooldown_remaining, get_user_from_uid
from accounts.tokens import (
    backup_email_verification_token_generator,
    primary_email_change_token_generator,
)
from core.mail import EmailConfigurationError, EmailSendError

logger = logging.getLogger("accounts")
User = get_user_model()


def account_email_payload(user):
    backup_status = "none"
    backup_display = None
    if user.pending_backup_email:
        backup_status = "pending"
        backup_display = user.pending_backup_email
    elif user.backup_email:
        backup_status = "verified"
        backup_display = user.backup_email

    from accounts.customer_two_factor_models import OwnerTOTPDevice
    from django.db.utils import OperationalError, ProgrammingError

    try:
        device = OwnerTOTPDevice.objects.filter(user=user, confirmed=True).first()
        enabled_at = device.confirmed_at if device is not None else None
    except (OperationalError, ProgrammingError):
        # If the DB migration for owner 2FA hasn't been applied yet, keep the
        # account endpoint working (and default to 2FA disabled).
        device = None
        enabled_at = None

    return {
        "email": user.email,
        "email_verified": bool(user.email_verified),
        "email_verified_at": user.email_verified_at,
        "pending_primary_email": user.pending_primary_email,
        "backup_email_status": backup_status,
        "backup_email": backup_display if backup_status == "verified" else None,
        "pending_backup_email": user.pending_backup_email,
        "two_factor_status": "enabled" if device is not None else "not_enabled",
        "two_factor_enabled_at": enabled_at,
        "two_factor_label": "Two-factor authentication",
    }


def account_payload(user):
    from accounts.language import normalize_language
    from accounts.sign_in_methods import sign_in_methods_payload

    payload = account_email_payload(user)
    payload["sign_in_methods"] = sign_in_methods_payload(user)
    payload["preferred_language"] = normalize_language(
        getattr(user, "preferred_language", None)
    )
    return payload


def _verification_resend_cooldown():
    return getattr(settings, "EMAIL_VERIFICATION_RESEND_COOLDOWN", 60)


def _send_backup_verification(user):
    send_backup_email_verification(user)
    user.backup_email_verification_last_sent_at = timezone.now()
    user.save(update_fields=["backup_email_verification_last_sent_at"])


def _send_primary_change_verification(user):
    send_primary_email_change_verification(user)
    user.primary_email_change_last_sent_at = timezone.now()
    user.save(update_fields=["primary_email_change_last_sent_at"])


def request_backup_email(user, email, password):
    if not user.check_password(password):
        return "wrong_password", None
    try:
        normalized = validate_backup_email_for_user(user, email)
    except DjangoValidationError as exc:
        return "validation_error", exc.messages

    user.pending_backup_email = normalized
    user.save(update_fields=["pending_backup_email"])
    try:
        _send_backup_verification(user)
    except (EmailConfigurationError, EmailSendError) as exc:
        logger.error("Backup verification email failed for user_id=%s: %s", user.pk, exc)
        return "send_failed", None
    return "sent", normalized


def resend_backup_verification(user):
    if not user.pending_backup_email:
        return "nothing_pending"
    remaining = _cooldown_remaining(
        user.backup_email_verification_last_sent_at,
        _verification_resend_cooldown(),
    )
    if remaining:
        raise EmailCooldown(remaining)
    try:
        _send_backup_verification(user)
    except (EmailConfigurationError, EmailSendError) as exc:
        logger.error("Backup verification resend failed for user_id=%s: %s", user.pk, exc)
        return "send_failed"
    return "sent"


def cancel_pending_backup(user):
    if not user.pending_backup_email:
        return "nothing_pending"
    user.pending_backup_email = None
    user.backup_email_verification_last_sent_at = None
    user.save(
        update_fields=[
            "pending_backup_email",
            "backup_email_verification_last_sent_at",
        ]
    )
    return "cancelled"


def remove_backup_email(user, password):
    if not user.check_password(password):
        return False
    user.backup_email = None
    user.backup_email_verified_at = None
    user.pending_backup_email = None
    user.backup_email_verification_last_sent_at = None
    user.save(
        update_fields=[
            "backup_email",
            "backup_email_verified_at",
            "pending_backup_email",
            "backup_email_verification_last_sent_at",
        ]
    )
    return True


def verify_backup_email_uid_token(uid, token):
    user = get_user_from_uid(uid)
    if user is None or not user.is_active:
        return "invalid", None
    if not user.pending_backup_email:
        return "invalid", None

    status = backup_email_verification_token_generator.inspect(user, token)
    if status != "valid":
        return status, None

    pending = user.pending_backup_email
    if email_address_claimed(pending, exclude_user=user):
        return "email_unavailable", None

    now = timezone.now()
    with transaction.atomic():
        user.backup_email = pending
        user.backup_email_verified_at = now
        user.pending_backup_email = None
        user.backup_email_verification_last_sent_at = None
        user.save(
            update_fields=[
                "backup_email",
                "backup_email_verified_at",
                "pending_backup_email",
                "backup_email_verification_last_sent_at",
            ]
        )
    return "verified", user


def request_primary_email_change(user, email, password):
    if not user.check_password(password):
        return "wrong_password", None
    try:
        normalized = validate_primary_email_for_user(user, email)
    except DjangoValidationError as exc:
        return "validation_error", exc.messages

    now = timezone.now()
    user.pending_primary_email = normalized
    user.pending_primary_email_requested_at = now
    user.save(update_fields=["pending_primary_email", "pending_primary_email_requested_at"])
    try:
        _send_primary_change_verification(user)
    except (EmailConfigurationError, EmailSendError) as exc:
        logger.error("Primary email change verification failed for user_id=%s: %s", user.pk, exc)
        return "send_failed", None
    return "sent", normalized


def resend_primary_email_change(user):
    if not user.pending_primary_email:
        return "nothing_pending"
    remaining = _cooldown_remaining(
        user.primary_email_change_last_sent_at,
        _verification_resend_cooldown(),
    )
    if remaining:
        raise EmailCooldown(remaining)
    try:
        _send_primary_change_verification(user)
    except (EmailConfigurationError, EmailSendError) as exc:
        logger.error("Primary email change resend failed for user_id=%s: %s", user.pk, exc)
        return "send_failed"
    return "sent"


def cancel_pending_primary_email(user):
    if not user.pending_primary_email:
        return "nothing_pending"
    user.pending_primary_email = None
    user.pending_primary_email_requested_at = None
    user.primary_email_change_last_sent_at = None
    user.save(
        update_fields=[
            "pending_primary_email",
            "pending_primary_email_requested_at",
            "primary_email_change_last_sent_at",
        ]
    )
    return "cancelled"


def verify_primary_email_uid_token(uid, token):
    user = get_user_from_uid(uid)
    if user is None or not user.is_active:
        return "invalid", None
    if not user.pending_primary_email:
        return "invalid", None

    status = primary_email_change_token_generator.inspect(user, token)
    if status != "valid":
        return status, None

    new_email = user.pending_primary_email
    if email_address_claimed(new_email, exclude_user=user):
        return "email_unavailable", None

    old_email = user.email
    now = timezone.now()
    with transaction.atomic():
        user.email = new_email
        user.email_verified = True
        user.email_verified_at = now
        user.pending_primary_email = None
        user.pending_primary_email_requested_at = None
        user.primary_email_change_last_sent_at = None
        user.save(
            update_fields=[
                "email",
                "email_verified",
                "email_verified_at",
                "pending_primary_email",
                "pending_primary_email_requested_at",
                "primary_email_change_last_sent_at",
            ]
        )

    try:
        send_primary_email_changed_notice(
            old_email=old_email,
            language=getattr(user, "preferred_language", None),
        )
    except (EmailConfigurationError, EmailSendError) as exc:
        logger.error(
            "Primary email change notice failed for user_id=%s old_email=%s: %s",
            user.pk,
            old_email,
            exc,
        )

    return "verified", user
