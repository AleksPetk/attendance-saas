"""Platform account emails (verification and password reset)."""

from django.conf import settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from accounts.tokens import (
    backup_email_verification_token_generator,
    email_verification_token_generator,
    password_reset_token_generator,
    primary_email_change_token_generator,
)
from core.email_branding import product_name, render_branded_email
from core.mail import frontend_url, send_transactional_email


def _hours(timeout_seconds):
    seconds = int(timeout_seconds or 0)
    return max(1, seconds // 3600)


def _uid(user):
    return urlsafe_base64_encode(force_bytes(user.pk))


def verification_url(user):
    token = email_verification_token_generator.make_token(user)
    return frontend_url("verify-email", _uid(user), token)


def password_reset_url(user):
    token = password_reset_token_generator.make_token(user)
    return frontend_url("reset-password", _uid(user), token)


def send_verification_email(user):
    name = product_name()
    url = verification_url(user)
    html_body, text_body = render_branded_email(
        heading=f"Verify your {name} email",
        intro=(
            f"Thanks for creating a {name} account. Confirm this email "
            "address so you can sign in and use your workspace."
        ),
        action_label="Verify email",
        action_url=url,
        security_note=(
            f"If you did not create a {name} account, you can ignore this email."
        ),
        expiry_hours=_hours(getattr(settings, "EMAIL_VERIFICATION_TIMEOUT", 86400)),
    )
    send_transactional_email(
        to_email=user.email,
        subject=f"Verify your {name} email",
        html_body=html_body,
        text_body=text_body,
    )


def send_password_reset_email(user):
    name = product_name()
    url = password_reset_url(user)
    html_body, text_body = render_branded_email(
        heading=f"Reset your {name} password",
        intro=(
            f"We received a request to reset the password for this {name} "
            "account. Choose a new password using the button below."
        ),
        action_label="Reset password",
        action_url=url,
        security_note=(
            "If you did not request a password reset, you can ignore this email. "
            "Your password will stay the same."
        ),
        expiry_hours=_hours(getattr(settings, "PASSWORD_RESET_TIMEOUT", 86400)),
    )
    send_transactional_email(
        to_email=user.email,
        subject=f"Reset your {name} password",
        html_body=html_body,
        text_body=text_body,
    )


def backup_email_verification_url(user):
    token = backup_email_verification_token_generator.make_token(user)
    return frontend_url("verify-backup-email", _uid(user), token)


def primary_email_change_url(user):
    token = primary_email_change_token_generator.make_token(user)
    return frontend_url("verify-primary-email", _uid(user), token)


def send_backup_email_verification(user):
    pending = user.pending_backup_email
    if not pending:
        raise ValueError("No pending backup email to verify.")
    name = product_name()
    url = backup_email_verification_url(user)
    html_body, text_body = render_branded_email(
        heading=f"Verify your {name} backup email",
        intro=(
            f"You asked to add or update the backup email for your {name} "
            "owner account. Confirm this address using the button below."
        ),
        action_label="Verify backup email",
        action_url=url,
        security_note=(
            "If you did not request this backup email change, you can ignore this email."
        ),
        expiry_hours=_hours(getattr(settings, "EMAIL_VERIFICATION_TIMEOUT", 86400)),
    )
    send_transactional_email(
        to_email=pending,
        subject=f"Verify your {name} backup email",
        html_body=html_body,
        text_body=text_body,
    )


def send_primary_email_change_verification(user):
    pending = user.pending_primary_email
    if not pending:
        raise ValueError("No pending primary email change.")
    name = product_name()
    url = primary_email_change_url(user)
    html_body, text_body = render_branded_email(
        heading=f"Confirm your new {name} login email",
        intro=(
            "You requested to use this email address as the login email for your "
            f"{name} owner account. Confirm the change using the button below."
        ),
        action_label="Confirm login email",
        action_url=url,
        security_note=(
            "If you did not request this login email change, you can ignore this email."
        ),
        expiry_hours=_hours(getattr(settings, "EMAIL_VERIFICATION_TIMEOUT", 86400)),
    )
    send_transactional_email(
        to_email=pending,
        subject=f"Confirm your new {name} login email",
        html_body=html_body,
        text_body=text_body,
    )


def send_primary_email_changed_notice(*, old_email):
    if not old_email:
        return
    name = product_name()
    html_body, text_body = render_branded_email(
        heading=f"Your {name} login email was changed",
        intro=(
            f"The login email for your {name} owner account was changed. "
            "If you made this change, no further action is needed."
        ),
        action_label=f"Sign in to {name}",
        action_url=frontend_url("login"),
        security_note=(
            f"If you did not change your login email, contact {name} support immediately."
        ),
    )
    send_transactional_email(
        to_email=old_email,
        subject=f"Your {name} login email was changed",
        html_body=html_body,
        text_body=text_body,
    )
