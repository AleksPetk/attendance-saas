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
        ],
        security_sensitive=True,
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
        security_sensitive=True,
    )
    return record_failure(
        "owner_login",
        "account",
        normalized,
        limit=limits["account_limit"],
        window_seconds=limits["account_window"],
        security_sensitive=True,
    )


def clear_owner_login_failures(email: str) -> None:
    normalized = _normalize_email(email)
    clear_failures("owner_login", "account", normalized, security_sensitive=True)


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
        ],
        security_sensitive=True,
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
        security_sensitive=True,
    )
    record_failure(
        "staff_login",
        "workspace_ip",
        workspace_ip,
        limit=limits["workspace_ip_limit"],
        window_seconds=limits["ip_window"],
        security_sensitive=True,
    )
    return record_failure(
        "staff_login",
        "account",
        account,
        limit=limits["account_limit"],
        window_seconds=limits["account_window"],
        security_sensitive=True,
    )


def clear_staff_login_failures(workspace_id: str, username: str) -> None:
    account = _staff_account_key(workspace_id, username)
    clear_failures("staff_login", "account", account, security_sensitive=True)


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
        ],
        security_sensitive=True,
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
        security_sensitive=True,
    )
    record_failure(
        "password_reset",
        "email",
        normalized,
        limit=limits["email_limit"],
        window_seconds=limits["email_window"],
        security_sensitive=True,
    )


# --- Account recovery (verified backup email) ---


def account_recovery_limits():
    return {
        "ip_limit": int(getattr(settings, "ACCOUNT_RECOVERY_IP_LIMIT", 5)),
        "ip_window": int(getattr(settings, "ACCOUNT_RECOVERY_IP_WINDOW", 3600)),
        "email_limit": int(getattr(settings, "ACCOUNT_RECOVERY_EMAIL_LIMIT", 3)),
        "email_window": int(getattr(settings, "ACCOUNT_RECOVERY_EMAIL_WINDOW", 3600)),
    }


def check_account_recovery_allowed(request, email: str) -> bool:
    limits = account_recovery_limits()
    ip = get_client_ip(request)
    normalized = _normalize_email(email)
    blocked = check_any_throttled(
        [
            ("account_recovery", "ip", ip, limits["ip_limit"]),
            ("account_recovery", "email", normalized, limits["email_limit"]),
        ],
        security_sensitive=True,
    )
    return blocked.allowed


def record_account_recovery_attempt(request, email: str) -> None:
    limits = account_recovery_limits()
    ip = get_client_ip(request)
    normalized = _normalize_email(email)
    record_failure(
        "account_recovery",
        "ip",
        ip,
        limit=limits["ip_limit"],
        window_seconds=limits["ip_window"],
        security_sensitive=True,
    )
    record_failure(
        "account_recovery",
        "email",
        normalized,
        limit=limits["email_limit"],
        window_seconds=limits["email_window"],
        security_sensitive=True,
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
        [("verification_resend", "ip", ip, limits["ip_limit"])],
        security_sensitive=True,
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
        security_sensitive=True,
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
        [("class_pin", "scope", scope, limits["limit"])],
        security_sensitive=True,
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
        security_sensitive=True,
    )


def clear_class_pin_failures(request, *, organization_id, group_id, section_id) -> None:
    ip = get_client_ip(request)
    scope = f"{organization_id}:{group_id}:{section_id}:{ip}"
    clear_failures("class_pin", "scope", scope, security_sensitive=True)


def check_kiosk_exit_allowed(request, *, organization_id, group_id) -> bool:
    limits = kiosk_exit_limits()
    ip = get_client_ip(request)
    scope = f"{organization_id}:{group_id}:{ip}"
    blocked = check_any_throttled(
        [("kiosk_exit", "scope", scope, limits["limit"])],
        security_sensitive=True,
    )
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
        security_sensitive=True,
    )


def clear_kiosk_exit_failures(request, *, organization_id, group_id) -> None:
    ip = get_client_ip(request)
    scope = f"{organization_id}:{group_id}:{ip}"
    clear_failures("kiosk_exit", "scope", scope, security_sensitive=True)


# --- Kiosk participation PIN (card / input second-field) ---


def participation_pin_limits():
    return {
        "participant_limit": int(
            getattr(settings, "PARTICIPATION_PIN_VERIFY_LIMIT", 10)
        ),
        "window": int(getattr(settings, "PARTICIPATION_PIN_VERIFY_WINDOW", 60)),
        "group_ip_limit": int(
            getattr(settings, "PARTICIPATION_PIN_GROUP_IP_LIMIT", 40)
        ),
    }


def _participation_pin_participant_key(
    *,
    organization_id,
    group_id,
    participant_kind: str,
    participant_id,
    ip: str,
) -> str:
    return (
        f"{organization_id}:{group_id}:{participant_kind}:{participant_id}:{ip}"
    )


def _participation_pin_group_ip_key(*, organization_id, group_id, ip: str) -> str:
    return f"{organization_id}:{group_id}:{ip}"


def check_participation_pin_allowed(
    request,
    *,
    organization_id,
    group_id,
    participant_kind: str,
    participant_id,
) -> bool:
    limits = participation_pin_limits()
    ip = get_client_ip(request)
    participant = _participation_pin_participant_key(
        organization_id=organization_id,
        group_id=group_id,
        participant_kind=participant_kind,
        participant_id=participant_id,
        ip=ip,
    )
    group_ip = _participation_pin_group_ip_key(
        organization_id=organization_id,
        group_id=group_id,
        ip=ip,
    )
    blocked = check_any_throttled(
        [
            (
                "participation_pin",
                "participant",
                participant,
                limits["participant_limit"],
            ),
            (
                "participation_pin",
                "group_ip",
                group_ip,
                limits["group_ip_limit"],
            ),
        ],
        security_sensitive=True,
    )
    return blocked.allowed


def record_participation_pin_failure(
    request,
    *,
    organization_id,
    group_id,
    participant_kind: str,
    participant_id,
) -> None:
    limits = participation_pin_limits()
    ip = get_client_ip(request)
    participant = _participation_pin_participant_key(
        organization_id=organization_id,
        group_id=group_id,
        participant_kind=participant_kind,
        participant_id=participant_id,
        ip=ip,
    )
    group_ip = _participation_pin_group_ip_key(
        organization_id=organization_id,
        group_id=group_id,
        ip=ip,
    )
    record_failure(
        "participation_pin",
        "participant",
        participant,
        limit=limits["participant_limit"],
        window_seconds=limits["window"],
        security_sensitive=True,
    )
    record_failure(
        "participation_pin",
        "group_ip",
        group_ip,
        limit=limits["group_ip_limit"],
        window_seconds=limits["window"],
        security_sensitive=True,
    )


def clear_participation_pin_failures(
    request,
    *,
    organization_id,
    group_id,
    participant_kind: str,
    participant_id,
) -> None:
    ip = get_client_ip(request)
    participant = _participation_pin_participant_key(
        organization_id=organization_id,
        group_id=group_id,
        participant_kind=participant_kind,
        participant_id=participant_id,
        ip=ip,
    )
    clear_failures(
        "participation_pin",
        "participant",
        participant,
        security_sensitive=True,
    )


# --- Authenticated reauth (password confirmation) ---


def reauth_limits():
    return {
        "ip_limit": int(getattr(settings, "REAUTH_IP_LIMIT", 20)),
        "ip_window": int(getattr(settings, "REAUTH_IP_WINDOW", 900)),
        "account_limit": int(getattr(settings, "REAUTH_ACCOUNT_LIMIT", 5)),
        "account_window": int(getattr(settings, "REAUTH_ACCOUNT_WINDOW", 900)),
    }


def reauth_actor_key(actor) -> str:
    """Stable per-identity key that cannot collide across owner vs staff PKs."""
    if getattr(actor, "is_authenticated", False) is not True:
        return "anonymous"
    # WorkspaceStaffAccount is not accounts.User; prefer explicit staff marker.
    if hasattr(actor, "organization_id") and hasattr(actor, "username"):
        return f"staff:{actor.pk}"
    return f"owner:{actor.pk}"


def check_reauth_allowed(request, actor) -> Response | None:
    limits = reauth_limits()
    ip = get_client_ip(request)
    account = reauth_actor_key(actor)
    blocked = check_any_throttled(
        [
            ("reauth", "ip", ip, limits["ip_limit"]),
            ("reauth", "account", account, limits["account_limit"]),
        ],
        security_sensitive=True,
    )
    if not blocked.allowed:
        return throttled_response()
    return None


def record_reauth_failure(request, actor) -> RateLimitResult:
    limits = reauth_limits()
    ip = get_client_ip(request)
    account = reauth_actor_key(actor)
    record_failure(
        "reauth",
        "ip",
        ip,
        limit=limits["ip_limit"],
        window_seconds=limits["ip_window"],
        security_sensitive=True,
    )
    return record_failure(
        "reauth",
        "account",
        account,
        limit=limits["account_limit"],
        window_seconds=limits["account_window"],
        security_sensitive=True,
    )


def clear_reauth_failures(actor) -> None:
    clear_failures(
        "reauth",
        "account",
        reauth_actor_key(actor),
        security_sensitive=True,
    )
