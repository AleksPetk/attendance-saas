"""Cache-backed rate limiting for security-sensitive endpoints.

Uses Django's cache framework (LocMem in dev, Redis in production). On transient
cache failures, operations fail open and log a warning so auth still works.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger("core.rate_limit")


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    retry_after: int = 0


def _secret_bytes() -> bytes:
    return (getattr(settings, "SECRET_KEY", "") or "local-dev").encode("utf-8")


def hash_identifier(value: str, *, namespace: str) -> str:
    """Keyed digest for cache keys — never store raw emails/usernames/PINs."""
    raw = f"{namespace}:{value or ''}".encode("utf-8")
    return hmac.new(_secret_bytes(), raw, hashlib.sha256).hexdigest()[:32]


def rate_limit_key(namespace: str, dimension: str, identifier: str) -> str:
    digest = hash_identifier(identifier, namespace=f"{namespace}:{dimension}")
    return f"rl:{namespace}:{dimension}:{digest}"


def _cache_get(key: str, default=0):
    try:
        value = cache.get(key, default)
        return int(value) if value is not None else default
    except Exception:
        logger.warning("Rate-limit cache get failed for key=%s", key[:40], exc_info=True)
        return default


def _cache_set(key: str, value: int, *, timeout: int) -> bool:
    try:
        cache.set(key, value, timeout=timeout)
        return True
    except Exception:
        logger.warning("Rate-limit cache set failed for key=%s", key[:40], exc_info=True)
        return False


def _cache_delete(key: str) -> None:
    try:
        cache.delete(key)
    except Exception:
        logger.warning("Rate-limit cache delete failed for key=%s", key[:40], exc_info=True)


def get_attempt_count(namespace: str, dimension: str, identifier: str) -> int:
    key = rate_limit_key(namespace, dimension, identifier)
    return _cache_get(key, 0)


def is_throttled(
    namespace: str,
    dimension: str,
    identifier: str,
    *,
    limit: int,
) -> RateLimitResult:
    if limit <= 0:
        return RateLimitResult(allowed=True)
    count = get_attempt_count(namespace, dimension, identifier)
    if count >= limit:
        return RateLimitResult(allowed=False, retry_after=0)
    return RateLimitResult(allowed=True)


def record_failure(
    namespace: str,
    dimension: str,
    identifier: str,
    *,
    limit: int,
    window_seconds: int,
) -> RateLimitResult:
    """Increment failure counter. Returns whether the limit is now exceeded."""
    if limit <= 0 or window_seconds <= 0:
        return RateLimitResult(allowed=True)

    key = rate_limit_key(namespace, dimension, identifier)
    count = _cache_get(key, 0) + 1
    _cache_set(key, count, timeout=window_seconds)
    if count > limit:
        return RateLimitResult(allowed=False, retry_after=window_seconds)
    return RateLimitResult(allowed=True)


def clear_failures(namespace: str, dimension: str, identifier: str) -> None:
    key = rate_limit_key(namespace, dimension, identifier)
    _cache_delete(key)


def check_any_throttled(
    checks: list[tuple[str, str, str, int]],
) -> RateLimitResult:
    """Return blocked if any (namespace, dimension, identifier, limit) is at limit."""
    for namespace, dimension, identifier, limit in checks:
        result = is_throttled(namespace, dimension, identifier, limit=limit)
        if not result.allowed:
            return result
    return RateLimitResult(allowed=True)
