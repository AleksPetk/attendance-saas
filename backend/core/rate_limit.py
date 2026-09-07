"""Cache-backed rate limiting for abuse protections.

Uses Django's cache framework (LocMem in dev, Redis in production).

Failure modes:
- security_sensitive=True (auth, PIN, recovery, SMTP test, etc.): fail *closed*.
  Cache/backend errors are treated as "throttled" so protections never become
  unlimited during an outage. Clients receive the normal rate-limit response;
  internal backend failures are never exposed.
- security_sensitive=False (optional low-risk / convenience throttles): fail *open*
  on transient cache errors so non-security features are not taken down with Redis.

Never log passwords, PINs, tokens, cookies, Authorization headers, or request bodies.
Cache keys already use keyed digests of identifiers.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger("core.rate_limit")


class RateLimitBackendError(Exception):
    """Raised internally when the cache backend fails in fail-closed mode."""


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


def _log_cache_failure(operation: str, key: str, *, security_sensitive: bool) -> None:
    # Keys are digests only; truncate further to avoid noisy logs.
    key_prefix = key[:40]
    if security_sensitive:
        logger.error(
            "Rate-limit cache %s failed (fail-closed) key=%s",
            operation,
            key_prefix,
            exc_info=True,
        )
    else:
        logger.warning(
            "Rate-limit cache %s failed (fail-open) key=%s",
            operation,
            key_prefix,
            exc_info=True,
        )


def _cache_get(key: str, default=0, *, security_sensitive: bool = False) -> int:
    try:
        value = cache.get(key, default)
        return int(value) if value is not None else default
    except Exception:
        _log_cache_failure("get", key, security_sensitive=security_sensitive)
        if security_sensitive:
            raise RateLimitBackendError("rate_limit_cache_unavailable") from None
        return default


def _cache_set(
    key: str, value: int, *, timeout: int, security_sensitive: bool = False
) -> bool:
    try:
        cache.set(key, value, timeout=timeout)
        return True
    except Exception:
        _log_cache_failure("set", key, security_sensitive=security_sensitive)
        if security_sensitive:
            raise RateLimitBackendError("rate_limit_cache_unavailable") from None
        return False


def _cache_delete(key: str, *, security_sensitive: bool = False) -> None:
    try:
        cache.delete(key)
    except Exception:
        # Clearing counters is best-effort. Failure must not unlock abuse, and
        # must not surface backend details to callers.
        _log_cache_failure("delete", key, security_sensitive=security_sensitive)


def get_attempt_count(
    namespace: str,
    dimension: str,
    identifier: str,
    *,
    security_sensitive: bool = False,
) -> int:
    key = rate_limit_key(namespace, dimension, identifier)
    return _cache_get(key, 0, security_sensitive=security_sensitive)


def is_throttled(
    namespace: str,
    dimension: str,
    identifier: str,
    *,
    limit: int,
    security_sensitive: bool = False,
) -> RateLimitResult:
    if limit <= 0:
        return RateLimitResult(allowed=True)
    try:
        count = get_attempt_count(
            namespace,
            dimension,
            identifier,
            security_sensitive=security_sensitive,
        )
    except RateLimitBackendError:
        return RateLimitResult(allowed=False, retry_after=0)
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
    security_sensitive: bool = False,
) -> RateLimitResult:
    """Increment failure counter. Returns whether the limit is now exceeded."""
    if limit <= 0 or window_seconds <= 0:
        return RateLimitResult(allowed=True)

    key = rate_limit_key(namespace, dimension, identifier)
    try:
        count = _cache_get(key, 0, security_sensitive=security_sensitive) + 1
        _cache_set(
            key,
            count,
            timeout=window_seconds,
            security_sensitive=security_sensitive,
        )
    except RateLimitBackendError:
        return RateLimitResult(allowed=False, retry_after=window_seconds)
    if count > limit:
        return RateLimitResult(allowed=False, retry_after=window_seconds)
    return RateLimitResult(allowed=True)


def clear_failures(
    namespace: str,
    dimension: str,
    identifier: str,
    *,
    security_sensitive: bool = False,
) -> None:
    key = rate_limit_key(namespace, dimension, identifier)
    _cache_delete(key, security_sensitive=security_sensitive)


def check_any_throttled(
    checks: list[tuple[str, str, str, int]],
    *,
    security_sensitive: bool = False,
) -> RateLimitResult:
    """Return blocked if any (namespace, dimension, identifier, limit) is at limit."""
    for namespace, dimension, identifier, limit in checks:
        result = is_throttled(
            namespace,
            dimension,
            identifier,
            limit=limit,
            security_sensitive=security_sensitive,
        )
        if not result.allowed:
            return result
    return RateLimitResult(allowed=True)
