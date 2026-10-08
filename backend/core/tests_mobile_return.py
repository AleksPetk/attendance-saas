"""Strict Android Apple deep-link return URL validation."""

from django.test import SimpleTestCase

from core.mobile_return import (
    MOBILE_APPLE_RETURN_URL,
    MobileReturnUrlError,
    is_allowed_mobile_apple_return_url,
    require_allowed_mobile_apple_return_url,
)


class MobileAppleReturnUrlTests(SimpleTestCase):
    def test_accepts_exact_allowed_url(self):
        self.assertTrue(is_allowed_mobile_apple_return_url(MOBILE_APPLE_RETURN_URL))
        self.assertEqual(
            require_allowed_mobile_apple_return_url(MOBILE_APPLE_RETURN_URL),
            MOBILE_APPLE_RETURN_URL,
        )

    def test_rejects_different_scheme(self):
        self.assertFalse(is_allowed_mobile_apple_return_url("https://auth/apple-result"))
        self.assertFalse(is_allowed_mobile_apple_return_url("http://auth/apple-result"))

    def test_rejects_different_host(self):
        self.assertFalse(is_allowed_mobile_apple_return_url("checkstation://evil/apple-result"))
        self.assertFalse(is_allowed_mobile_apple_return_url("checkstation://apple-result"))

    def test_rejects_different_path(self):
        self.assertFalse(is_allowed_mobile_apple_return_url("checkstation://auth/other"))
        self.assertFalse(is_allowed_mobile_apple_return_url("checkstation://auth/"))
        self.assertFalse(is_allowed_mobile_apple_return_url("checkstation://auth/apple-result/extra"))

    def test_rejects_arbitrary_checkstation_paths(self):
        self.assertFalse(is_allowed_mobile_apple_return_url("checkstation://home"))
        self.assertFalse(is_allowed_mobile_apple_return_url("checkstation://oauth/callback"))

    def test_rejects_query_fragment_and_malformed(self):
        self.assertFalse(
            is_allowed_mobile_apple_return_url("checkstation://auth/apple-result?result=success")
        )
        self.assertFalse(
            is_allowed_mobile_apple_return_url("checkstation://auth/apple-result#frag")
        )
        self.assertFalse(is_allowed_mobile_apple_return_url(""))
        self.assertFalse(is_allowed_mobile_apple_return_url("not-a-url"))
        with self.assertRaises(MobileReturnUrlError):
            require_allowed_mobile_apple_return_url("checkstation://auth/other")
