"""Paying-customer email verification, password reset, and password change."""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode

from accounts.emails import send_password_reset_email, send_verification_email
from accounts.exceptions import EmailCooldown
from accounts.sessions import invalidate_owner_sessions
from accounts.tokens import (
    email_verification_token_generator,
    password_reset_token_generator,
)
from core.mail import EmailConfigurationError, EmailSendError

logger = logging.getLogger("accounts")
User = get_user_model()

FORGOT_PASSWORD_MESSAGE = (
    "If an account exists for that email, we sent a password reset link."
)
RESEND_PUBLIC_MESSAGE = (
    "If that email needs verification, we sent a new verification link."
)


def _decode_uid(uid):
    try:
        return force_str(urlsafe_base64_decode(uid))
    except (TypeError, ValueError, OverflowError, UnicodeDecodeError):
        return None


def get_user_from_uid(uid):
    decoded = _decode_uid(uid)
    if not decoded:
        return None
    try:
        return User.objects.filter(pk=decoded).first()
    except (TypeError, ValueError, OverflowError):
        return None


def _cooldown_remaining(last_sent_at, cooldown_seconds):
    if last_sent_at is None:
        return 0
    elapsed = (timezone.now() - last_sent_at).total_seconds()
    remaining = int(cooldown_seconds) - int(elapsed)
    return remaining if remaining > 0 else 0


def verification_cooldown_remaining(user):
    return _cooldown_remaining(
        user.email_verification_last_sent_at,
        getattr(settings, "EMAIL_VERIFICATION_RESEND_COOLDOWN", 60),
    )


def _mark_verification_sent(user):
    user.email_verification_last_sent_at = timezone.now()
    user.save(update_fields=["email_verification_last_sent_at"])


def _mark_password_reset_sent(user):
    user.password_reset_last_sent_at = timezone.now()
    user.save(update_fields=["password_reset_last_sent_at"])


def send_verification_email_for_user(user):
    """
    Attempt to send a verification email.

    Returns True on success. Raises EmailConfigurationError / EmailSendError
    on failure without deleting the account.
    """
    send_verification_email(user)
    _mark_verification_sent(user)
    return True


def resend_verification_authenticated(user):
    if user.email_verified:
        return "already_verified"
    remaining = verification_cooldown_remaining(user)
    if remaining:
        raise EmailCooldown(remaining)
    send_verification_email_for_user(user)
    return "sent"


def resend_verification_public(email):
    """
    Neutral public resend. Never reveals whether the email exists.

    Cooldown and provider failures are swallowed into the same response so
    this endpoint cannot be used for account enumeration.
    """
    normalized = User.objects.normalize_email(email or "")
    user = User.objects.filter(email=normalized, is_active=True).first()
    if user is None or user.email_verified:
        return RESEND_PUBLIC_MESSAGE
    remaining = verification_cooldown_remaining(user)
    if remaining:
        return RESEND_PUBLIC_MESSAGE
    try:
        send_verification_email_for_user(user)
    except (EmailConfigurationError, EmailSendError) as exc:
        logger.error("Public verification resend failed for user_id=%s: %s", user.pk, exc)
    return RESEND_PUBLIC_MESSAGE


def _provision_verified_owner_locked(user):
    """Mark a pending owner verified and idempotently create its workspace."""
    if not user.email_verified:
        user.email_verified = True
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified", "email_verified_at"])

    if user.is_staff or user.is_superuser:
        return user, None, False

    from organizations.models import Organization

    organization, created = Organization.objects.get_or_create(owner=user)
    return user, organization, created


@transaction.atomic
def provision_verified_owner(user):
    """Provision one owner workspace exactly once for a verified account."""
    locked = User.objects.select_for_update().get(pk=user.pk)
    return _provision_verified_owner_locked(locked)


@transaction.atomic
def verify_email_uid_token(uid, token):
    """
    Return ("verified", user), ("expired", None), or ("invalid", None).
    """
    user = get_user_from_uid(uid)
    if user is None or not user.is_active:
        return "invalid", None
    user = User.objects.select_for_update().get(pk=user.pk)
    status = email_verification_token_generator.inspect(user, token)
    if status != "valid":
        return status, None
    user, _organization, _created = _provision_verified_owner_locked(user)
    return "verified", user


def request_password_reset(email):
    """Always return the same public message (anti-enumeration)."""
    normalized = User.objects.normalize_email(email or "")
    user = User.objects.filter(email=normalized, is_active=True).first()
    if user is None:
        return FORGOT_PASSWORD_MESSAGE
    remaining = _cooldown_remaining(
        user.password_reset_last_sent_at,
        getattr(settings, "PASSWORD_RESET_RESEND_COOLDOWN", 60),
    )
    if remaining:
        return FORGOT_PASSWORD_MESSAGE
    try:
        send_password_reset_email(user)
        _mark_password_reset_sent(user)
    except (EmailConfigurationError, EmailSendError) as exc:
        logger.error("Password reset email failed for user_id=%s: %s", user.pk, exc)
    return FORGOT_PASSWORD_MESSAGE


def inspect_password_reset_token(uid, token):
    user = get_user_from_uid(uid)
    if user is None or not user.is_active:
        return "invalid", None
    generator = password_reset_token_generator
    try:
        ts_b36, _rest = token.split("-")
        timestamp = int(ts_b36, 36)
    except (ValueError, AttributeError, TypeError):
        return "invalid", None

    from django.utils.crypto import constant_time_compare

    secrets = [generator.secret, *generator.secret_fallbacks]
    matched = False
    for secret in secrets:
        candidate = generator._make_token_with_timestamp(user, timestamp, secret)
        if constant_time_compare(candidate, token):
            matched = True
            break
    if not matched:
        return "invalid", None
    age = generator._num_seconds(generator._now()) - timestamp
    timeout = int(getattr(settings, "PASSWORD_RESET_TIMEOUT", 60 * 60 * 24))
    if age > timeout:
        return "expired", None
    return "valid", user


def reset_password(uid, token, new_password):
    status, user = inspect_password_reset_token(uid, token)
    if status != "valid":
        return status, None
    try:
        validate_password(new_password, user=user)
    except DjangoValidationError as exc:
        raise exc
    user.set_password(new_password)
    user.save(update_fields=["password"])
    invalidate_owner_sessions(user)
    return "reset", user


def change_password(request, user, current_password, new_password):
    if not user.check_password(current_password):
        return False
    validate_password(new_password, user=user)
    user.set_password(new_password)
    user.save(update_fields=["password"])
    keep_key = request.session.session_key if request is not None else None
    invalidate_owner_sessions(user, keep_session_key=keep_key)
    if request is not None:
        update_session_auth_hash(request, user)
    return True
