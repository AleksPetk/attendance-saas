"""Authorization helpers for provider-specific health endpoints."""

import secrets

from django.conf import settings
from django.core.cache import cache
from rest_framework.response import Response


PROBE_HEADER = "X-Status-Probe-Token"


def probe_token_configured():
    return bool((getattr(settings, "STATUS_PROBE_TOKEN", "") or "").strip())


def request_has_valid_probe_token(request):
    expected = (getattr(settings, "STATUS_PROBE_TOKEN", "") or "").strip()
    if not expected:
        # Local DEBUG without a token keeps Status compose working.
        return bool(getattr(settings, "DEBUG", False))
    provided = (request.headers.get(PROBE_HEADER) or "").strip()
    if not provided:
        return False
    return secrets.compare_digest(provided, expected)


def provider_health_denied_response():
    return Response({"status": "forbidden"}, status=403)


def provider_health_rate_limited(request):
    """
    Defense-in-depth rate limit for provider health checks.

    Returns True when the caller should be rejected with HTTP 429.
    """
    limit = int(getattr(settings, "STATUS_PROVIDER_HEALTH_RATE_LIMIT", 30) or 0)
    if limit <= 0:
        return False
    # Prefer authenticated probe identity; fall back to client IP.
    token = (request.headers.get(PROBE_HEADER) or "").strip()
    if token:
        bucket = f"status-probe:{token[:16]}"
    else:
        ip = request.META.get("REMOTE_ADDR") or "unknown"
        bucket = f"status-probe-ip:{ip}"
    key = f"core:provider-health:{bucket}"
    try:
        count = cache.incr(key)
    except ValueError:
        cache.add(key, 1, timeout=60)
        count = 1
    return count > limit


def enforce_provider_health_access(request):
    """
    Return a DRF Response when access should be denied, else None.
    """
    if provider_health_rate_limited(request):
        return Response({"status": "error"}, status=429)
    if not request_has_valid_probe_token(request):
        return provider_health_denied_response()
    return None
