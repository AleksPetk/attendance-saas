from io import BytesIO
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError
import json

from django.test import SimpleTestCase, override_settings

from core.mail import (
    RESEND_USER_AGENT,
    EmailConfigurationError,
    EmailSendError,
    ResendEmailProvider,
    frontend_url,
    send_transactional_email,
)


class FrontendUrlTests(SimpleTestCase):
    @override_settings(FRONTEND_BASE_URL="http://localhost:5173")
    def test_builds_relative_frontend_path(self):
        url = frontend_url("verify-email", "abc", "token-value")
        self.assertEqual(url, "http://localhost:5173/verify-email/abc/token-value")

    @override_settings(FRONTEND_BASE_URL="http://localhost:5173")
    def test_rejects_absolute_path_segments(self):
        with self.assertRaises(EmailConfigurationError):
            frontend_url("https://evil.example/steal")


class ResendProviderTests(SimpleTestCase):
    @override_settings(RESEND_API_KEY="", RESEND_FROM_EMAIL="accounts@example.com")
    def test_missing_api_key(self):
        with self.assertRaises(EmailConfigurationError):
            send_transactional_email(
                to_email="user@example.com",
                subject="Hello",
                html_body="<p>Hi</p>",
                text_body="Hi",
            )

    @override_settings(
        RESEND_API_KEY="re_test_secret_key",
        RESEND_FROM_EMAIL="accounts@example.com",
        RESEND_FROM_NAME="Check Station",
        RESEND_TIMEOUT_SECONDS=15,
    )
    def test_successful_send_sets_user_agent_and_does_not_log_secret(self):
        mock_response = MagicMock()
        mock_response.read.return_value = b'{"id":"email_1"}'
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = False
        captured = {}

        def fake_urlopen(request, timeout=None):
            captured["user_agent"] = request.get_header("User-agent")
            captured["content_type"] = request.get_header("Content-type")
            captured["accept"] = request.get_header("Accept")
            captured["from_payload"] = request.data
            return mock_response

        with patch("core.mail.urllib.request.urlopen", side_effect=fake_urlopen):
            with self.assertLogs("core.mail", level="INFO") as logs:
                send_transactional_email(
                    to_email="user@example.com",
                    subject="Hello",
                    html_body="<p>Hi</p>",
                    text_body="Hi",
                )
        joined = " ".join(logs.output)
        self.assertNotIn("re_test_secret_key", joined)
        self.assertEqual(captured["user_agent"], RESEND_USER_AGENT)
        self.assertFalse(str(captured["user_agent"]).startswith("Python-urllib"))
        self.assertEqual(captured["content_type"], "application/json")
        self.assertIn(b"CheckStation <accounts@example.com>", captured["from_payload"])
        self.assertNotIn(b"Check Station <", captured["from_payload"])
        self.assertNotIn(b'"attachments"', captured["from_payload"])

    @override_settings(
        RESEND_API_KEY="re_test_secret_key",
        RESEND_FROM_EMAIL="accounts@example.com",
        RESEND_FROM_NAME="CheckStation",
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL="",
        RESEND_TIMEOUT_SECONDS=15,
    )
    def test_branded_html_uses_text_wordmark_with_no_attachments(self):
        from core.email_branding import render_branded_email

        mock_response = MagicMock()
        mock_response.read.return_value = b'{"id":"email_1"}'
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = False
        captured = []

        def fake_urlopen(request, timeout=None):
            captured.append(json.loads(request.data.decode("utf-8")))
            return mock_response

        verify_html, verify_text = render_branded_email(
            heading="Verify your CheckStation email",
            intro="Confirm this email.",
            action_label="Verify email",
            action_url="http://localhost:5173/verify-email/x/y",
        )
        reset_html, reset_text = render_branded_email(
            heading="Reset your CheckStation password",
            intro="Choose a new password.",
            action_label="Reset password",
            action_url="http://localhost:5173/reset-password/x/y",
        )
        with patch("core.mail.urllib.request.urlopen", side_effect=fake_urlopen):
            send_transactional_email(
                to_email="user@example.com",
                subject="Verify your CheckStation email",
                html_body=verify_html,
                text_body=verify_text,
            )
            send_transactional_email(
                to_email="user@example.com",
                subject="Reset your CheckStation password",
                html_body=reset_html,
                text_body=reset_text,
            )
        self.assertEqual(len(captured), 2)
        for payload in captured:
            self.assertNotIn("attachments", payload)
            self.assertNotIn("<img", payload["html"])
            self.assertNotIn("cid:", payload["html"])
            self.assertNotIn("localhost:5173/brand/", payload["html"])
            self.assertNotIn("docs.checkstation.app", payload["html"])
            self.assertNotIn("checkstation.app", payload["html"])
            self.assertNotIn('"content_id"', json.dumps(payload))
            self.assertIn("CheckStation", payload["html"])

    @override_settings(
        RESEND_API_KEY="re_test_secret_key",
        RESEND_FROM_EMAIL="accounts@example.com",
        RESEND_FROM_NAME="CheckStation",
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL="https://cdn.example.com/brand/logo-text.png",
        RESEND_TIMEOUT_SECONDS=15,
    )
    def test_branded_html_uses_configured_https_logo_with_no_attachments(self):
        from core.email_branding import render_branded_email

        mock_response = MagicMock()
        mock_response.read.return_value = b'{"id":"email_1"}'
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = False
        captured = []

        def fake_urlopen(request, timeout=None):
            captured.append(json.loads(request.data.decode("utf-8")))
            return mock_response

        html_body, text_body = render_branded_email(
            heading="Reset your CheckStation password",
            intro="Choose a new password.",
            action_label="Reset password",
            action_url="http://localhost:5173/reset-password/x/y",
        )
        with patch("core.mail.urllib.request.urlopen", side_effect=fake_urlopen):
            send_transactional_email(
                to_email="user@example.com",
                subject="Reset your CheckStation password",
                html_body=html_body,
                text_body=text_body,
            )
        payload = captured[0]
        self.assertNotIn("attachments", payload)
        self.assertIn('src="https://cdn.example.com/brand/logo-text.png"', payload["html"])
        self.assertNotIn("cid:", payload["html"])
        self.assertNotIn('"content_id"', json.dumps(payload))

    @override_settings(
        RESEND_API_KEY="re_test_secret_key",
        RESEND_FROM_EMAIL="accounts@example.com",
        RESEND_FROM_NAME="Check Station",
        DEBUG=False,
    )
    def test_provider_failure_is_explicit(self):
        error = HTTPError(
            url="https://api.resend.com/emails",
            code=401,
            msg="Unauthorized",
            hdrs={},
            fp=BytesIO(b'{"message":"re_test_secret_key","name":"validation_error"}'),
        )
        with patch("core.mail.urllib.request.urlopen", side_effect=error):
            with self.assertLogs("core.mail", level="ERROR") as logs:
                with self.assertRaises(EmailSendError) as raised:
                    ResendEmailProvider().send(
                        to_email="user@example.com",
                        subject="Hello",
                        html_body="<p>Hi</p>",
                        text_body="Hi",
                    )
        joined = " ".join(logs.output)
        self.assertNotIn("re_test_secret_key", joined)
        self.assertIn("[redacted]", joined)
        self.assertIn("status", joined)
        self.assertEqual(str(raised.exception), "The email provider rejected the message.")

    @override_settings(
        RESEND_API_KEY="re_test_secret_key",
        RESEND_FROM_EMAIL="accounts@example.com",
        RESEND_FROM_NAME="Check Station",
        DEBUG=True,
    )
    def test_debug_includes_sanitized_provider_error(self):
        error = HTTPError(
            url="https://api.resend.com/emails",
            code=403,
            msg="Forbidden",
            hdrs={},
            fp=BytesIO(
                b'{"status":403,"name":"validation_error",'
                b'"message":"The example.com domain is not verified. re_test_secret_key"}'
            ),
        )
        with patch("core.mail.urllib.request.urlopen", side_effect=error):
            with self.assertLogs("core.mail", level="ERROR") as logs:
                with self.assertRaises(EmailSendError) as raised:
                    ResendEmailProvider().send(
                        to_email="user@example.com",
                        subject="Hello",
                        html_body="<p>Hi</p>",
                        text_body="Hi",
                    )
        message = str(raised.exception)
        joined = " ".join(logs.output)
        self.assertIn("status=403", message)
        self.assertIn("name=validation_error", message)
        self.assertIn("domain is not verified", message)
        self.assertNotIn("re_test_secret_key", message)
        self.assertNotIn("re_test_secret_key", joined)
        self.assertIn("[redacted]", message)

    @override_settings(
        RESEND_API_KEY="re_test_secret_key",
        RESEND_FROM_EMAIL="accounts@example.com",
        RESEND_FROM_NAME="Check Station",
    )
    def test_timeout_becomes_send_error(self):
        with patch("core.mail.urllib.request.urlopen", side_effect=URLError("timed out")):
            with self.assertLogs("core.mail", level="ERROR"):
                with self.assertRaises(EmailSendError):
                    send_transactional_email(
                        to_email="user@example.com",
                        subject="Hello",
                        html_body="<p>Hi</p>",
                        text_body="Hi",
                    )
