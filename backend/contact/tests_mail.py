from unittest.mock import MagicMock, patch
from urllib.error import URLError

from django.test import SimpleTestCase, override_settings

from core.mail import send_transactional_email


class ContactReplyToMailTests(SimpleTestCase):
    @override_settings(
        RESEND_API_KEY="re_test_secret_key",
        RESEND_FROM_EMAIL="accounts@example.com",
        RESEND_FROM_NAME="Check Station",
        RESEND_TIMEOUT_SECONDS=15,
    )
    def test_reply_to_is_submitter_not_from(self):
        mock_response = MagicMock()
        mock_response.read.return_value = b'{"id":"email_1"}'
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = False
        captured = {}

        def fake_urlopen(request, timeout=None):
            captured["payload"] = request.data
            return mock_response

        with patch("core.mail.urllib.request.urlopen", side_effect=fake_urlopen):
            send_transactional_email(
                to_email="contact@checkstation.app",
                subject="Hello",
                html_body="<p>Hi</p>",
                text_body="Hi",
                reply_to="customer@example.com",
            )
        self.assertIn(b'"reply_to": "customer@example.com"', captured["payload"])
        self.assertIn(b"accounts@example.com", captured["payload"])
        self.assertNotIn(b'"from": "customer@example.com"', captured["payload"])
