"""Rate limits for Group email-sender test endpoint."""

from __future__ import annotations

from django.conf import settings
from rest_framework.response import Response

from core.client_ip import get_client_ip
from core.rate_limit import check_any_throttled, record_failure

THROTTLED_RESPONSE_BODY = {
    "detail": "Too many test email attempts. Please try again later.",
    "code": "rate_limited",
}


def _limits() -> tuple[int, int, int, int]:
    user_limit = int(getattr(settings, "GROUP_EMAIL_TEST_RATE_LIMIT_USER", 10) or 10)
    group_limit = int(getattr(settings, "GROUP_EMAIL_TEST_RATE_LIMIT_GROUP", 20) or 20)
    ip_limit = int(getattr(settings, "GROUP_EMAIL_TEST_RATE_LIMIT_IP", 30) or 30)
    window = int(
        getattr(settings, "GROUP_EMAIL_TEST_RATE_LIMIT_WINDOW_SECONDS", 3600) or 3600
    )
    return user_limit, group_limit, ip_limit, window


def throttled_test_email_response() -> Response:
    return Response(THROTTLED_RESPONSE_BODY, status=429)


def check_email_sender_test_allowed(*, request, group) -> Response | None:
    user_limit, group_limit, ip_limit, _window = _limits()
    user_id = str(getattr(request.user, "pk", "") or "anon")
    group_id = str(getattr(group, "pk", "") or "")
    ip = get_client_ip(request)
    blocked = check_any_throttled(
        [
            ("group_email_test", "user", user_id, user_limit),
            ("group_email_test", "group", group_id, group_limit),
            ("group_email_test", "ip", ip, ip_limit),
        ]
    )
    if not blocked.allowed:
        return throttled_test_email_response()
    return None


def record_email_sender_test_attempt(*, request, group) -> None:
    user_limit, group_limit, ip_limit, window = _limits()
    user_id = str(getattr(request.user, "pk", "") or "anon")
    group_id = str(getattr(group, "pk", "") or "")
    ip = get_client_ip(request)
    for namespace, dimension, identifier, limit in (
        ("group_email_test", "user", user_id, user_limit),
        ("group_email_test", "group", group_id, group_limit),
        ("group_email_test", "ip", ip, ip_limit),
    ):
        record_failure(
            namespace,
            dimension,
            identifier,
            limit=limit,
            window_seconds=window,
        )
