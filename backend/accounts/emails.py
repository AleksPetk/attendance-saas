"""Platform account emails (verification and password reset)."""

from django.conf import settings
from django.template.loader import render_to_string
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from accounts.tokens import (
    email_verification_token_generator,
    password_reset_token_generator,
)
from core.mail import frontend_url, send_transactional_email


def _product_name():
    return getattr(settings, "PRODUCT_NAME", "Check Station")


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


def _render_auth_email(*, heading, intro, action_label, action_url, security_note, expiry_hours):
    context = {
        "product_name": _product_name(),
        "subject": heading,
        "heading": heading,
        "intro": intro,
        "action_label": action_label,
        "action_url": action_url,
        "security_note": security_note,
        "expiry_hours": expiry_hours,
    }
    html_body = render_to_string("accounts/email/auth_message.html", context)
    text_body = render_to_string("accounts/email/auth_message.txt", context)
    return html_body, text_body


def send_verification_email(user):
    url = verification_url(user)
    html_body, text_body = _render_auth_email(
        heading="Verify your Check Station email",
        intro=(
            "Thanks for creating a Check Station account. Confirm this email "
            "address so you can sign in and use your workspace."
        ),
        action_label="Verify email",
        action_url=url,
        security_note=(
            "If you did not create a Check Station account, you can ignore this email."
        ),
        expiry_hours=_hours(getattr(settings, "EMAIL_VERIFICATION_TIMEOUT", 86400)),
    )
    send_transactional_email(
        to_email=user.email,
        subject="Verify your Check Station email",
        html_body=html_body,
        text_body=text_body,
    )


def send_password_reset_email(user):
    url = password_reset_url(user)
    html_body, text_body = _render_auth_email(
        heading="Reset your Check Station password",
        intro=(
            "We received a request to reset the password for this Check Station "
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
        subject="Reset your Check Station password",
        html_body=html_body,
        text_body=text_body,
    )
