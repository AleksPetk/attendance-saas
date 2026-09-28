"""Desktop return URL validation and handoff token cache helpers."""

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from accounts.desktop_auth_handoff import (
    OUTCOME_AUTHENTICATED,
    OUTCOME_TWO_FACTOR_REQUIRED,
    consume_desktop_auth_handoff,
    create_desktop_auth_handoff,
)
from core.desktop_return import (
    DesktopReturnUrlError,
    append_desktop_return_query,
    is_safe_desktop_return_url,
    require_safe_desktop_return_url,
)


class _FakeUser:
    pk = 42


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class DesktopReturnAndHandoffTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_accepts_loopback_with_port(self):
        self.assertTrue(is_safe_desktop_return_url("http://127.0.0.1:54321/apple-oauth-result"))
        self.assertTrue(is_safe_desktop_return_url("http://localhost:9999/stripe-billing-return"))

    def test_rejects_non_loopback(self):
        self.assertFalse(is_safe_desktop_return_url("https://evil.example/callback"))
        self.assertFalse(is_safe_desktop_return_url("http://192.168.1.1:80/x"))
        self.assertFalse(is_safe_desktop_return_url("http://127.0.0.1/apple"))  # no port
        with self.assertRaises(DesktopReturnUrlError):
            require_safe_desktop_return_url("https://workspace.checkstation.app/")

    def test_append_query(self):
        url = append_desktop_return_query(
            "http://127.0.0.1:1234/return",
            {"result": "success", "handoff": "abc"},
        )
        self.assertIn("result=success", url)
        self.assertIn("handoff=abc", url)

    def test_handoff_token_is_single_use(self):
        token = create_desktop_auth_handoff(
            _FakeUser(),
            outcome=OUTCOME_AUTHENTICATED,
            provider="apple",
        )
        first = consume_desktop_auth_handoff(token)
        self.assertIsNotNone(first)
        assert first is not None
        self.assertEqual(first.user_id, 42)
        self.assertEqual(first.outcome, OUTCOME_AUTHENTICATED)
        self.assertIsNone(consume_desktop_auth_handoff(token))

    def test_handoff_supports_two_factor_outcome(self):
        token = create_desktop_auth_handoff(
            _FakeUser(),
            outcome=OUTCOME_TWO_FACTOR_REQUIRED,
            provider="apple",
        )
        payload = consume_desktop_auth_handoff(token)
        self.assertIsNotNone(payload)
        assert payload is not None
        self.assertEqual(payload.outcome, OUTCOME_TWO_FACTOR_REQUIRED)
