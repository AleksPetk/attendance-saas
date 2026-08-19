"""Helpers for paying-customer email verification (not workspace staff)."""

from django.contrib.auth import get_user_model


def is_platform_operator(user):
    return bool(getattr(user, "is_staff", False) or getattr(user, "is_superuser", False))


def customer_must_verify_email(user):
    """
    Paying customers must confirm email before using the workspace.

    WorkspaceStaffAccount is not an accounts.User and is not part of this
    flow. Platform operators (is_staff / is_superuser) are exempt so Django
    admin and local platform management keep working.
    """
    User = get_user_model()
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    if not isinstance(user, User):
        return False
    if is_platform_operator(user):
        return False
    return not bool(getattr(user, "email_verified", False))
