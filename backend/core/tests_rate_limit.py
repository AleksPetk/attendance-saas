"""Unit tests for cache-backed rate-limit failure modes."""

from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from core.rate_limit import (
    check_any_throttled,
    clear_failures,
    get_rate_limit_cache,
    is_throttled,
    record_failure,
)


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "rate-limit-unit-tests",
        }
    }
)
class RateLimitHealthyCacheTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_below_limit_allowed(self):
        result = is_throttled("unit", "id", "a", limit=3, security_sensitive=True)
        self.assertTrue(result.allowed)
        record_failure(
            "unit",
            "id",
            "a",
            limit=3,
            window_seconds=60,
            security_sensitive=True,
        )
        result = is_throttled("unit", "id", "a", limit=3, security_sensitive=True)
        self.assertTrue(result.allowed)

    def test_over_limit_blocked(self):
        for _ in range(3):
            record_failure(
                "unit",
                "id",
                "b",
                limit=3,
                window_seconds=60,
                security_sensitive=True,
            )
        result = is_throttled("unit", "id", "b", limit=3, security_sensitive=True)
        self.assertFalse(result.allowed)

    def test_check_any_throttled_blocks_when_any_dimension_exceeded(self):
        for _ in range(2):
            record_failure(
                "unit",
                "ip",
                "1.2.3.4",
                limit=2,
                window_seconds=60,
                security_sensitive=True,
            )
        blocked = check_any_throttled(
            [
                ("unit", "ip", "1.2.3.4", 2),
                ("unit", "account", "user@example.com", 5),
            ],
            security_sensitive=True,
        )
        self.assertFalse(blocked.allowed)

    def test_clear_failures_resets_counter(self):
        for _ in range(3):
            record_failure(
                "unit",
                "id",
                "c",
                limit=3,
                window_seconds=60,
                security_sensitive=True,
            )
        clear_failures("unit", "id", "c", security_sensitive=True)
        result = is_throttled("unit", "id", "c", limit=3, security_sensitive=True)
        self.assertTrue(result.allowed)


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "rate-limit-fail-mode-tests",
        }
    }
)
class RateLimitCacheFailureModeTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def _failing_cache(self, *, get_error=False, set_error=False, delete_error=False):
        mock_cache = MagicMock()
        if get_error:
            mock_cache.get.side_effect = RuntimeError("redis down")
        else:
            mock_cache.get.return_value = 0
        if set_error:
            mock_cache.set.side_effect = RuntimeError("redis down")
        if delete_error:
            mock_cache.delete.side_effect = RuntimeError("redis down")
        return mock_cache

    def test_security_sensitive_check_fails_closed_on_cache_get_error(self):
        with patch(
            "core.rate_limit.get_rate_limit_cache",
            return_value=self._failing_cache(get_error=True),
        ):
            result = is_throttled(
                "unit", "id", "x", limit=5, security_sensitive=True
            )
        self.assertFalse(result.allowed)

    def test_security_sensitive_check_any_fails_closed_on_cache_error(self):
        with patch(
            "core.rate_limit.get_rate_limit_cache",
            return_value=self._failing_cache(get_error=True),
        ):
            result = check_any_throttled(
                [("unit", "id", "x", 5)],
                security_sensitive=True,
            )
        self.assertFalse(result.allowed)

    def test_security_sensitive_record_fails_closed_on_cache_get_error(self):
        with patch(
            "core.rate_limit.get_rate_limit_cache",
            return_value=self._failing_cache(get_error=True),
        ):
            result = record_failure(
                "unit",
                "id",
                "x",
                limit=5,
                window_seconds=60,
                security_sensitive=True,
            )
        self.assertFalse(result.allowed)

    def test_security_sensitive_record_fails_closed_on_cache_set_error(self):
        with patch(
            "core.rate_limit.get_rate_limit_cache",
            return_value=self._failing_cache(set_error=True),
        ):
            result = record_failure(
                "unit",
                "id",
                "y",
                limit=5,
                window_seconds=60,
                security_sensitive=True,
            )
        self.assertFalse(result.allowed)

    def test_non_security_check_fails_open_on_cache_error(self):
        with patch(
            "core.rate_limit.get_rate_limit_cache",
            return_value=self._failing_cache(get_error=True),
        ):
            result = is_throttled(
                "unit", "id", "z", limit=5, security_sensitive=False
            )
        self.assertTrue(result.allowed)

    def test_non_security_record_fails_open_on_cache_error(self):
        with patch(
            "core.rate_limit.get_rate_limit_cache",
            return_value=self._failing_cache(get_error=True),
        ):
            result = record_failure(
                "unit",
                "id",
                "z",
                limit=5,
                window_seconds=60,
                security_sensitive=False,
            )
        # get fails open → count treated as 0+1; set also may fail open
        self.assertTrue(result.allowed)

    def test_non_security_default_remains_fail_open(self):
        """Default security_sensitive=False preserves historical fail-open."""
        with patch(
            "core.rate_limit.get_rate_limit_cache",
            return_value=self._failing_cache(get_error=True),
        ):
            result = is_throttled("unit", "id", "default", limit=1)
        self.assertTrue(result.allowed)

    def test_security_sensitive_clear_swallows_cache_errors(self):
        with patch(
            "core.rate_limit.get_rate_limit_cache",
            return_value=self._failing_cache(delete_error=True),
        ):
            clear_failures("unit", "id", "x", security_sensitive=True)


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "rate-limit-default-only",
        },
        "ratelimit": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "rate-limit-dedicated-alias",
        },
    }
)
class RateLimitDedicatedAliasTests(SimpleTestCase):
    def test_prefers_ratelimit_alias_when_configured(self):
        rl = get_rate_limit_cache()
        default = cache
        # Dedicated alias uses a distinct LocMem LOCATION.
        rl.set("probe", "from-ratelimit", timeout=30)
        self.assertIsNone(default.get("probe"))
        self.assertEqual(rl.get("probe"), "from-ratelimit")

    def test_security_limiter_uses_ratelimit_alias(self):
        get_rate_limit_cache().clear()
        cache.clear()
        for _ in range(2):
            record_failure(
                "unit",
                "id",
                "alias",
                limit=2,
                window_seconds=60,
                security_sensitive=True,
            )
        # Counter lives on ratelimit alias, not default.
        self.assertFalse(
            is_throttled(
                "unit", "id", "alias", limit=2, security_sensitive=True
            ).allowed
        )
        # Ordinary default cache remains independent.
        cache.set("other", "ok", timeout=30)
        self.assertEqual(cache.get("other"), "ok")
