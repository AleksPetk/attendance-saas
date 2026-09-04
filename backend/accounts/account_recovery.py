"""Owner account recovery via verified backup email (not a login alias)."""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models, transaction
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from accounts.email_uniqueness import (
    email_address_claimed,
    lock_users_touching_email,
    normalize_owner_email,
)
from accounts.owner_two_factor import (
    consume_recovery_code,
    has_confirmed_owner_totp,
    lock_is_active,
    normalize_recovery_code,
    register_failure_on_device,
    register_success_on_device,
    seconds_until,
    verify_totp_code,
)
from accounts.customer_two_factor_models import OwnerTOTPDevice
from accounts.owner_two_factor import decrypt_owner_totp_secret
from accounts.sessions import invalidate_owner_sessions
from core.mail import EmailConfigurationError, EmailSendError

logger = logging.getLogger("accounts.account_recovery")
User = get_user_model()

OWNER_RECOVERY_SESSION_KEY = "_owner_account_recovery"
ACCOUNT_RECOVERY_PUBLIC_MESSAGE = (
    "If a CheckStation account uses that backup email, we sent a recovery link."
)


def recovery_timeout_seconds() -> int:
    return int(getattr(settings, "ACCOUNT_RECOVERY_TIMEOUT", 60 * 60))


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(str(raw_token or "").encode("utf-8")).hexdigest()


def _uid_for(user) -> str:
    return urlsafe_base64_encode(force_bytes(user.pk))


class OwnerAccountRecoveryChallenge(models.Model):
    """
    Single-use recovery challenge started from a verified backup email.

    Does not authenticate the owner. Workspace access is never granted here.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="account_recovery_challenges",
    )
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    backup_email = models.EmailField()
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    email_confirmed_at = models.DateTimeField(null=True, blank=True)
    two_factor_confirmed_at = models.DateTimeField(null=True, blank=True)
    pending_new_email = models.EmailField(null=True, blank=True)
    pending_password_applied = models.BooleanField(default=False)
    consumed_at = models.DateTimeField(null=True, blank=True)
    primary_verify_token_hash = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["expires_at"]),
        ]

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_consumed(self) -> bool:
        return self.consumed_at is not None

    def needs_two_factor(self) -> bool:
        return has_confirmed_owner_totp(self.user)

    def two_factor_satisfied(self) -> bool:
        if not self.needs_two_factor():
            return True
        return self.two_factor_confirmed_at is not None

    def stage(self) -> str:
        if self.is_consumed:
            return "completed"
        if self.is_expired:
            return "expired"
        if not self.email_confirmed_at:
            return "awaiting_email_confirm"
        if not self.two_factor_satisfied():
            return "awaiting_two_factor"
        if self.pending_new_email and self.pending_password_applied:
            return "awaiting_primary_verification"
        return "awaiting_credentials"


class OwnerAccountRecoveryEvent(models.Model):
    """Append-only security audit for account recovery."""

    EVENT_STARTED = "started"
    EVENT_EMAIL_CONFIRMED = "email_confirmed"
    EVENT_TWO_FACTOR_OK = "two_factor_ok"
    EVENT_CREDENTIALS_SET = "credentials_set"
    EVENT_COMPLETED = "completed"
    EVENT_FAILED = "failed"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="account_recovery_events",
        null=True,
        blank=True,
    )
    event_type = models.CharField(max_length=64)
    backup_email = models.EmailField(blank=True, default="")
    detail = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "created_at"])]


def _record_event(*, user=None, event_type: str, backup_email: str = "", detail: str = ""):
    OwnerAccountRecoveryEvent.objects.create(
        user=user,
        event_type=event_type,
        backup_email=normalize_owner_email(backup_email) or "",
        detail=(detail or "")[:255],
    )
    logger.info(
        "account_recovery event=%s user_id=%s backup=%s detail=%s",
        event_type,
        getattr(user, "pk", None),
        normalize_owner_email(backup_email) or "",
        detail,
    )


def find_owner_by_verified_backup(email: str):
    normalized = normalize_owner_email(email)
    if not normalized:
        return None
    return (
        User.objects.filter(
            backup_email=normalized,
            is_active=True,
            is_staff=False,
            is_superuser=False,
        )
        .exclude(backup_email_verified_at__isnull=True)
        .first()
    )


def clear_recovery_session(request) -> None:
    if OWNER_RECOVERY_SESSION_KEY in request.session:
        request.session.pop(OWNER_RECOVERY_SESSION_KEY, None)
        request.session.modified = True


def _store_recovery_session(request, challenge: OwnerAccountRecoveryChallenge) -> None:
    request.session.cycle_key()
    request.session[OWNER_RECOVERY_SESSION_KEY] = {
        "challenge_id": challenge.pk,
        "user_id": challenge.user_id,
        "confirmed_at": timezone.now().isoformat(),
    }
    request.session.modified = True


def load_recovery_challenge(request) -> OwnerAccountRecoveryChallenge | None:
    raw = request.session.get(OWNER_RECOVERY_SESSION_KEY)
    if not isinstance(raw, dict):
        return None
    challenge_id = raw.get("challenge_id")
    user_id = raw.get("user_id")
    if not challenge_id or not user_id:
        return None
    challenge = (
        OwnerAccountRecoveryChallenge.objects.select_related("user")
        .filter(pk=challenge_id, user_id=user_id)
        .first()
    )
    if challenge is None or challenge.is_expired or challenge.is_consumed:
        clear_recovery_session(request)
        return None
    if not challenge.email_confirmed_at:
        clear_recovery_session(request)
        return None
    return challenge


def recovery_status_payload(challenge: OwnerAccountRecoveryChallenge | None) -> dict:
    if challenge is None:
        return {"active": False, "stage": "none", "needs_two_factor": False}
    return {
        "active": True,
        "stage": challenge.stage(),
        "needs_two_factor": challenge.needs_two_factor(),
        "pending_new_email": challenge.pending_new_email,
    }


@transaction.atomic
def start_account_recovery(email: str, *, language=None) -> str:
    """
    Always returns the public anti-enumeration message.
    Sends a recovery link only for an active owner with verified backup.
    """
    from accounts.emails import send_account_recovery_email

    normalized = normalize_owner_email(email)
    user = find_owner_by_verified_backup(normalized)
    if user is None:
        return ACCOUNT_RECOVERY_PUBLIC_MESSAGE

    # Invalidate prior open challenges for this user.
    OwnerAccountRecoveryChallenge.objects.filter(
        user=user,
        consumed_at__isnull=True,
    ).update(consumed_at=timezone.now())

    raw_token = secrets.token_urlsafe(32)
    challenge = OwnerAccountRecoveryChallenge.objects.create(
        user=user,
        token_hash=_hash_token(raw_token),
        backup_email=user.backup_email,
        expires_at=timezone.now() + timedelta(seconds=recovery_timeout_seconds()),
    )
    _record_event(
        user=user,
        event_type=OwnerAccountRecoveryEvent.EVENT_STARTED,
        backup_email=user.backup_email,
        detail=f"challenge_id={challenge.pk}",
    )
    try:
        send_account_recovery_email(
            user,
            uid=_uid_for(user),
            token=raw_token,
            language=language,
        )
    except (EmailConfigurationError, EmailSendError) as exc:
        logger.error(
            "account_recovery email failed user_id=%s: %s",
            user.pk,
            exc,
        )
    return ACCOUNT_RECOVERY_PUBLIC_MESSAGE


@transaction.atomic
def confirm_account_recovery(request, uid: str, token: str):
    from accounts.services import get_user_from_uid

    user = get_user_from_uid(uid)
    if user is None or not user.is_active:
        return "invalid", None

    challenge = (
        OwnerAccountRecoveryChallenge.objects.select_for_update()
        .filter(user=user, token_hash=_hash_token(token))
        .first()
    )
    if challenge is None:
        return "invalid", None
    if challenge.is_consumed or challenge.is_expired:
        return "expired" if challenge.is_expired else "invalid", None
    if normalize_owner_email(challenge.backup_email) != normalize_owner_email(
        user.backup_email or ""
    ):
        return "invalid", None
    if user.backup_email_verified_at is None:
        return "invalid", None

    if challenge.email_confirmed_at is None:
        challenge.email_confirmed_at = timezone.now()
        # Burn the email link token so the mailbox link cannot be replayed.
        challenge.token_hash = _hash_token(secrets.token_urlsafe(32))
        challenge.save(update_fields=["email_confirmed_at", "token_hash"])
        _record_event(
            user=user,
            event_type=OwnerAccountRecoveryEvent.EVENT_EMAIL_CONFIRMED,
            backup_email=challenge.backup_email,
            detail=f"challenge_id={challenge.pk}",
        )
    else:
        # Already confirmed — reject replay of the original mailbox link.
        return "invalid", None

    _store_recovery_session(request, challenge)
    return "confirmed", challenge


def satisfy_recovery_two_factor(request, *, code: str = "", recovery_code: str = ""):
    challenge = load_recovery_challenge(request)
    if challenge is None:
        return "no_session", None
    if challenge.stage() not in {"awaiting_two_factor", "awaiting_credentials", "awaiting_primary_verification"}:
        if challenge.is_expired:
            return "expired", None

    if not challenge.needs_two_factor():
        return "not_required", challenge

    if challenge.two_factor_confirmed_at is not None:
        return "already_satisfied", challenge

    device = OwnerTOTPDevice.objects.filter(user=challenge.user, confirmed=True).first()
    if device is None:
        return "not_required", challenge

    if lock_is_active(device.locked_until):
        return "locked", seconds_until(device.locked_until)

    if recovery_code:
        submitted = normalize_recovery_code(recovery_code)
        if not submitted or not consume_recovery_code(challenge.user, submitted):
            register_failure_on_device(device)
            return "invalid_code", None
        register_success_on_device(device, timestep=None)
    else:
        secret = decrypt_owner_totp_secret(device.secret_encrypted)
        ok, timestep = verify_totp_code(
            secret, code, last_timestep=device.last_verified_timestep
        )
        if not ok:
            register_failure_on_device(device)
            return "invalid_code", None
        register_success_on_device(device, timestep=timestep)

    challenge.two_factor_confirmed_at = timezone.now()
    challenge.save(update_fields=["two_factor_confirmed_at"])
    _record_event(
        user=challenge.user,
        event_type=OwnerAccountRecoveryEvent.EVENT_TWO_FACTOR_OK,
        backup_email=challenge.backup_email,
        detail=f"challenge_id={challenge.pk}",
    )
    return "ok", challenge


@transaction.atomic
def submit_recovery_credentials(request, *, new_email: str, password: str):
    challenge = load_recovery_challenge(request)
    if challenge is None:
        return "no_session", None
    challenge = OwnerAccountRecoveryChallenge.objects.select_for_update().get(
        pk=challenge.pk
    )
    if challenge.is_expired or challenge.is_consumed:
        clear_recovery_session(request)
        return "expired", None
    if not challenge.email_confirmed_at:
        return "no_session", None
    if not challenge.two_factor_satisfied():
        return "two_factor_required", None

    user = User.objects.select_for_update().get(pk=challenge.user_id)
    normalized = normalize_owner_email(new_email)
    if not normalized:
        return "validation_error", {"email": ["Enter a valid email address."]}
    if normalized == normalize_owner_email(user.email):
        return "validation_error", {
            "email": ["Choose a different login email than the inaccessible one."]
        }
    if normalized == normalize_owner_email(user.backup_email or ""):
        return "validation_error", {
            "email": ["Login email cannot match your backup email."]
        }
    if email_address_claimed(normalized, exclude_user=user):
        return "validation_error", {"email": ["This email address is already in use."]}

    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        return "validation_error", {"password": list(exc.messages)}

    from accounts.emails import send_account_recovery_primary_verification_email

    raw_primary_token = secrets.token_urlsafe(32)
    user.set_password(password)
    user.pending_primary_email = normalized
    user.pending_primary_email_requested_at = timezone.now()
    user.primary_email_change_last_sent_at = timezone.now()
    # Clear unrelated pending backup change so recovery owns the transition.
    user.pending_backup_email = None
    user.backup_email_verification_last_sent_at = None
    user.save(
        update_fields=[
            "password",
            "pending_primary_email",
            "pending_primary_email_requested_at",
            "primary_email_change_last_sent_at",
            "pending_backup_email",
            "backup_email_verification_last_sent_at",
        ]
    )
    invalidate_owner_sessions(user)

    challenge.pending_new_email = normalized
    challenge.pending_password_applied = True
    challenge.primary_verify_token_hash = _hash_token(raw_primary_token)
    challenge.save(
        update_fields=[
            "pending_new_email",
            "pending_password_applied",
            "primary_verify_token_hash",
        ]
    )
    _record_event(
        user=user,
        event_type=OwnerAccountRecoveryEvent.EVENT_CREDENTIALS_SET,
        backup_email=challenge.backup_email,
        detail=f"challenge_id={challenge.pk}",
    )

    try:
        send_account_recovery_primary_verification_email(
            user,
            uid=_uid_for(user),
            token=raw_primary_token,
            new_email=normalized,
            language=getattr(user, "preferred_language", None),
        )
    except (EmailConfigurationError, EmailSendError) as exc:
        logger.error(
            "account_recovery primary verify email failed user_id=%s: %s",
            user.pk,
            exc,
        )
        return "send_failed", challenge

    return "awaiting_primary_verification", challenge


@transaction.atomic
def verify_recovery_primary_email(uid: str, token: str):
    from accounts.emails import send_account_recovery_completed_notice
    from accounts.services import get_user_from_uid

    user = get_user_from_uid(uid)
    if user is None or not user.is_active:
        return "invalid", None

    challenge = (
        OwnerAccountRecoveryChallenge.objects.select_for_update()
        .filter(
            user=user,
            primary_verify_token_hash=_hash_token(token),
            pending_password_applied=True,
            consumed_at__isnull=True,
        )
        .first()
    )
    if challenge is None:
        return "invalid", None
    if challenge.is_expired:
        return "expired", None
    if not challenge.email_confirmed_at or not challenge.two_factor_satisfied():
        return "invalid", None

    new_email = normalize_owner_email(challenge.pending_new_email or "")
    if not new_email or new_email != normalize_owner_email(user.pending_primary_email or ""):
        return "invalid", None

    locked_user = User.objects.select_for_update().get(pk=user.pk)
    lock_users_touching_email(new_email, exclude_user=locked_user)
    if email_address_claimed(new_email, exclude_user=locked_user):
        return "email_unavailable", None

    old_email = locked_user.email
    backup_email = locked_user.backup_email
    now = timezone.now()
    locked_user.email = new_email
    locked_user.email_verified = True
    locked_user.email_verified_at = now
    locked_user.pending_primary_email = None
    locked_user.pending_primary_email_requested_at = None
    locked_user.primary_email_change_last_sent_at = None
    locked_user.save(
        update_fields=[
            "email",
            "email_verified",
            "email_verified_at",
            "pending_primary_email",
            "pending_primary_email_requested_at",
            "primary_email_change_last_sent_at",
        ]
    )

    challenge.consumed_at = now
    challenge.primary_verify_token_hash = ""
    challenge.save(update_fields=["consumed_at", "primary_verify_token_hash"])

    # Invalidate any other open recovery challenges for this owner.
    OwnerAccountRecoveryChallenge.objects.filter(
        user=locked_user,
        consumed_at__isnull=True,
    ).exclude(pk=challenge.pk).update(consumed_at=now)

    invalidate_owner_sessions(locked_user)
    _record_event(
        user=locked_user,
        event_type=OwnerAccountRecoveryEvent.EVENT_COMPLETED,
        backup_email=backup_email or "",
        detail=f"challenge_id={challenge.pk}",
    )

    for recipient in {old_email, new_email, backup_email}:
        if not recipient:
            continue
        try:
            send_account_recovery_completed_notice(
                to_email=recipient,
                language=getattr(locked_user, "preferred_language", None),
            )
        except (EmailConfigurationError, EmailSendError) as exc:
            logger.error(
                "account_recovery notice failed user_id=%s to=%s: %s",
                locked_user.pk,
                recipient,
                exc,
            )

    return "completed", locked_user
