"""Authentication and recovery abuse rate limits."""

from __future__ import annotations

from django.conf import settings
from rest_framework.response import Response

from core.client_ip import get_client_ip
from core.rate_limit import (
    RateLimitResult,
    check_any_throttled,
    clear_failures,
    record_failure,
)

THROTTLED_RESPONSE_BODY = {
    "detail": "Too many attempts. Please try again later.",
    "code": "rate_limited",
}


def throttled_response() -> Response:
    return Response(THROTTLED_RESPONSE_BODY, status=429)


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _normalize_workspace_id(workspace_id: str) -> str:
    return (workspace_id or "").strip().upper()


def _normalize_username(username: str) -> str:
    return (username or "").strip().lower()


# --- Owner login ---


def owner_login_limits():
    return {
        "ip_limit": int(getattr(settings, "OWNER_LOGIN_IP_LIMIT", 10)),
        "ip_window": int(getattr(settings, "OWNER_LOGIN_IP_WINDOW", 900)),
        "account_limit": int(getattr(settings, "OWNER_LOGIN_ACCOUNT_LIMIT", 5)),
        "account_window": int(getattr(settings, "OWNER_LOGIN_ACCOUNT_WINDOW", 900)),
    }


def check_owner_login_allowed(request, email: str) -> Response | None:
    limits = owner_login_limits()
    ip = get_client_ip(request)
    normalized = _normalize_email(email)
    blocked = check_any_throttled(
        [
            ("owner_login", "ip", ip, limits["ip_limit"]),
            ("owner_login", "account", normalized, limits["account_limit"]),
        ]
    )
    if not blocked.allowed:
        return throttled_response()
    return None


def record_owner_login_failure(request, email: str) -> RateLimitResult:
    limits = owner_login_limits()
    ip = get_client_ip(request)
    normalized = _normalize_email(email)
    record_failure(
        "owner_login",
        "ip",
        ip,
        limit=limits["ip_limit"],
        window_seconds=limits["ip_window"],
    )
    return record_failure(
        "owner_login",
        "account",
        normalized,
        limit=limits["account_limit"],
        window_seconds=limits["account_window"],
    )


def clear_owner_login_failures(email: str) -> None:
    normalized = _normalize_email(email)
    clear_failures("owner_login", "account", normalized)


# --- Staff login ---


def staff_login_limits():
    return {
        "ip_limit": int(getattr(settings, "STAFF_LOGIN_IP_LIMIT", 10)),
        "ip_window": int(getattr(settings, "STAFF_LOGIN_IP_WINDOW", 900)),
        "account_limit": int(getattr(settings, "STAFF_LOGIN_ACCOUNT_LIMIT", 8)),
        "account_window": int(getattr(settings, "STAFF_LOGIN_ACCOUNT_WINDOW", 900)),
        "workspace_ip_limit": int(getattr(settings, "STAFF_LOGIN_WORKSPACE_IP_LIMIT", 15)),
    }


def _staff_account_key(workspace_id: str, username: str) -> str:
    return f"{_normalize_workspace_id(workspace_id)}:{_normalize_username(username)}"


def check_staff_login_allowed(
    request, workspace_id: str, username: str
) -> Response | None:
    limits = staff_login_limits()
    ip = get_client_ip(request)
    account = _staff_account_key(workspace_id, username)
    workspace_ip = f"{_normalize_workspace_id(workspace_id)}:{ip}"
    blocked = check_any_throttled(
        [
            ("staff_login", "ip", ip, limits["ip_limit"]),
            ("staff_login", "account", account, limits["account_limit"]),
            ("staff_login", "workspace_ip", workspace_ip, limits["workspace_ip_limit"]),
        ]
    )
    if not blocked.allowed:
        return throttled_response()
    return None


def record_staff_login_failure(
    request, workspace_id: str, username: str
) -> RateLimitResult:
    limits = staff_login_limits()
    ip = get_client_ip(request)
    account = _staff_account_key(workspace_id, username)
    workspace_ip = f"{_normalize_workspace_id(workspace_id)}:{ip}"
    record_failure(
        "staff_login",
        "ip",
        ip,
        limit=limits["ip_limit"],
        window_seconds=limits["ip_window"],
    )
    record_failure(
        "staff_login",
        "workspace_ip",
        workspace_ip,
        limit=limits["workspace_ip_limit"],
        window_seconds=limits["ip_window"],
    )
    return record_failure(
        "staff_login",
        "account",
        account,
        limit=limits["account_limit"],
        window_seconds=limits["account_window"],
    )


def clear_staff_login_failures(workspace_id: str, username: str) -> None:
    account = _staff_account_key(workspace_id, username)
    clear_failures("staff_login", "account", account)


# --- Password reset ---


def password_reset_limits():
    return {
        "ip_limit": int(getattr(settings, "PASSWORD_RESET_IP_LIMIT", 5)),
        "ip_window": int(getattr(settings, "PASSWORD_RESET_IP_WINDOW", 3600)),
        "email_limit": int(getattr(settings, "PASSWORD_RESET_EMAIL_LIMIT", 3)),
        "email_window": int(getattr(settings, "PASSWORD_RESET_EMAIL_WINDOW", 3600)),
    }


def check_password_reset_allowed(request, email: str) -> bool:
    """Return False when throttled (caller keeps generic public response)."""
    limits = password_reset_limits()
    ip = get_client_ip(request)
    normalized = _normalize_email(email)
    blocked = check_any_throttled(
        [
            ("password_reset", "ip", ip, limits["ip_limit"]),
            ("password_reset", "email", normalized, limits["email_limit"]),
        ]
    )
    return blocked.allowed


def record_password_reset_attempt(request, email: str) -> None:
    limits = password_reset_limits()
    ip = get_client_ip(request)
    normalized = _normalize_email(email)
    record_failure(
        "password_reset",
        "ip",
        ip,
        limit=limits["ip_limit"],
        window_seconds=limits["ip_window"],
    )
    record_failure(
        "password_reset",
        "email",
        normalized,
        limit=limits["email_limit"],
        window_seconds=limits["email_window"],
    )


# --- Public verification resend ---


def verification_resend_limits():
    return {
        "ip_limit": int(getattr(settings, "VERIFICATION_RESEND_IP_LIMIT", 10)),
        "ip_window": int(getattr(settings, "VERIFICATION_RESEND_IP_WINDOW", 3600)),
    }


def check_verification_resend_ip_allowed(request) -> bool:
    limits = verification_resend_limits()
    ip = get_client_ip(request)
    blocked = check_any_throttled(
        [("verification_resend", "ip", ip, limits["ip_limit"])]
    )
    return blocked.allowed


def record_verification_resend_ip(request) -> None:
    limits = verification_resend_limits()
    ip = get_client_ip(request)
    record_failure(
        "verification_resend",
        "ip",
        ip,
        limit=limits["ip_limit"],
        window_seconds=limits["ip_window"],
    )


# --- Kiosk Class PIN / exit code ---


def class_pin_limits():
    return {
        "limit": int(getattr(settings, "CLASS_PIN_VERIFY_LIMIT", 20)),
        "window": int(getattr(settings, "CLASS_PIN_VERIFY_WINDOW", 60)),
    }


def kiosk_exit_limits():
    return {
        "limit": int(getattr(settings, "KIOSK_EXIT_VERIFY_LIMIT", 15)),
        "window": int(getattr(settings, "KIOSK_EXIT_VERIFY_WINDOW", 60)),
    }


def check_class_pin_allowed(request, *, organization_id, group_id, section_id) -> bool:
    limits = class_pin_limits()
    ip = get_client_ip(request)
    scope = f"{organization_id}:{group_id}:{section_id}:{ip}"
    blocked = check_any_throttled(
        [("class_pin", "scope", scope, limits["limit"])]
    )
    return blocked.allowed


def record_class_pin_failure(request, *, organization_id, group_id, section_id) -> None:
    limits = class_pin_limits()
    ip = get_client_ip(request)
    scope = f"{organization_id}:{group_id}:{section_id}:{ip}"
    record_failure(
        "class_pin",
        "scope",
        scope,
        limit=limits["limit"],
        window_seconds=limits["window"],
    )


def clear_class_pin_failures(request, *, organization_id, group_id, section_id) -> None:
    ip = get_client_ip(request)
    scope = f"{organization_id}:{group_id}:{section_id}:{ip}"
    clear_failures("class_pin", "scope", scope)


def check_kiosk_exit_allowed(request, *, organization_id, group_id) -> bool:
    limits = kiosk_exit_limits()
    ip = get_client_ip(request)
    scope = f"{organization_id}:{group_id}:{ip}"
    blocked = check_any_throttled([("kiosk_exit", "scope", scope, limits["limit"])])
    return blocked.allowed


def record_kiosk_exit_failure(request, *, organization_id, group_id) -> None:
    limits = kiosk_exit_limits()
    ip = get_client_ip(request)
    scope = f"{organization_id}:{group_id}:{ip}"
    record_failure(
        "kiosk_exit",
        "scope",
        scope,
        limit=limits["limit"],
        window_seconds=limits["window"],
    )


def clear_kiosk_exit_failures(request, *, organization_id, group_id) -> None:
    ip = get_client_ip(request)
    scope = f"{organization_id}:{group_id}:{ip}"
    clear_failures("kiosk_exit", "scope", scope)
