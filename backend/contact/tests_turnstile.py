from unittest.mock import MagicMock, patch
from urllib.error import URLError

from django.test import SimpleTestCase, override_settings

from contact.turnstile import TurnstileError, verify_turnstile_token


class TurnstileVerifyTests(SimpleTestCase):
    @override_settings(
        TURNSTILE_SITE_KEY="1x00000000000000000000AA",
        TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA",
        TURNSTILE_TIMEOUT_SECONDS=8,
    )
    def test_valid_token_accepted(self):
        mock_response = MagicMock()
        mock_response.read.return_value = b'{"success":true}'
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = False
        with patch("contact.turnstile.urllib.request.urlopen", return_value=mock_response):
            self.assertTrue(verify_turnstile_token("ok-token"))

    @override_settings(
        TURNSTILE_SITE_KEY="1x00000000000000000000AA",
        TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA",
        TURNSTILE_TIMEOUT_SECONDS=8,
    )
    def test_invalid_token_rejected(self):
        mock_response = MagicMock()
        mock_response.read.return_value = b'{"success":false}'
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = False
        with patch("contact.turnstile.urllib.request.urlopen", return_value=mock_response):
            with self.assertRaises(TurnstileError):
                verify_turnstile_token("bad-token")

    @override_settings(
        TURNSTILE_SITE_KEY="1x00000000000000000000AA",
        TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA",
    )
    def test_missing_token_rejected(self):
        with self.assertRaises(TurnstileError):
            verify_turnstile_token("")

    @override_settings(TURNSTILE_SITE_KEY="", TURNSTILE_SECRET_KEY="", DEBUG=False)
    def test_production_misconfig_fails_closed(self):
        with self.assertRaises(TurnstileError):
            verify_turnstile_token("token")
