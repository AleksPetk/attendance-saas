"""Content locale normalization tests."""

from django.test import SimpleTestCase

from content.locale import (
    DEFAULT_CONTENT_LOCALE,
    normalize_content_locale,
    resolve_content_locale,
)


class ContentLocaleTests(SimpleTestCase):
    def test_normalize_content_locale(self):
        self.assertEqual(normalize_content_locale("ja"), "ja")
        self.assertEqual(normalize_content_locale("ja-JP"), "ja")
        self.assertEqual(normalize_content_locale("en-US"), "en")
        self.assertEqual(normalize_content_locale("fr"), DEFAULT_CONTENT_LOCALE)

    def test_resolve_from_query(self):
        class Request:
            query_params = {"lang": "ja"}

        self.assertEqual(resolve_content_locale(Request()), "ja")

    def test_resolve_explicit_overrides_query(self):
        class Request:
            query_params = {"lang": "en"}

        self.assertEqual(resolve_content_locale(Request(), explicit="ja"), "ja")
