import inspect
import json
import re
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, TestCase, override_settings

from accounts.emails import send_password_reset_email, send_verification_email
from accounts.models import User
from billing.emails import send_payment_failure_warning
from core import email_branding as email_branding_module
from core.email_branding import (
    brand_logo_url,
    canonical_product_name,
    product_name,
    public_https_asset_url,
    render_branded_email,
)
from core.mail import format_from_address
from groups.email_providers.test_message import group_sender_test_email

PUBLIC_LOGO_URL = "https://cdn.example.com/brand/logo-text.png"


def _img_srcs(html):
    return re.findall(r'<img[^>]+src="([^"]+)"', html)


def _header_strategy(html):
    srcs = _img_srcs(html)
    if srcs:
        return ("img", srcs[0])
    return ("text", None)


class ProductNameCanonicalizationTests(SimpleTestCase):
    def test_spaced_and_case_variants_become_checkstation(self):
        self.assertEqual(canonical_product_name("Check Station"), "CheckStation")
        self.assertEqual(canonical_product_name("CHECK STATION"), "CheckStation")
        self.assertEqual(canonical_product_name("CheckStation"), "CheckStation")
        self.assertEqual(canonical_product_name(""), "CheckStation")

    def test_custom_from_names_are_kept(self):
        self.assertEqual(canonical_product_name("Acme Support"), "Acme Support")

    @override_settings(PRODUCT_NAME="Check Station")
    def test_settings_product_name_is_canonical(self):
        self.assertEqual(product_name(), "CheckStation")


class PublicHttpsAssetUrlTests(SimpleTestCase):
    def test_accepts_public_https_asset(self):
        self.assertEqual(public_https_asset_url(PUBLIC_LOGO_URL), PUBLIC_LOGO_URL)

    def test_rejects_localhost_http_and_relative_paths(self):
        self.assertEqual(public_https_asset_url(""), "")
        self.assertEqual(
            public_https_asset_url("http://localhost:5173/brand/logo-text.png"),
            "",
        )
        self.assertEqual(
            public_https_asset_url("https://localhost:5173/brand/logo-text.png"),
            "",
        )
        self.assertEqual(public_https_asset_url("/brand/logo-text.png"), "")
        self.assertEqual(
            public_https_asset_url("http://cdn.example.com/brand/logo-text.png"),
            "",
        )
        self.assertEqual(public_https_asset_url("https://127.0.0.1/brand/logo-text.png"), "")
        self.assertEqual(public_https_asset_url("https://192.168.1.10/brand/logo-text.png"), "")


class BrandLogoUrlTests(SimpleTestCase):
    @override_settings(
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL="",
    )
    def test_local_frontend_has_no_logo_url(self):
        self.assertEqual(brand_logo_url(), "")

    @override_settings(
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL="http://localhost:5173/brand/logo-text.png",
    )
    def test_localhost_override_is_ignored(self):
        self.assertEqual(brand_logo_url(), "")

    @override_settings(
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL=PUBLIC_LOGO_URL,
    )
    def test_explicit_public_https_override_is_used(self):
        self.assertEqual(brand_logo_url(), PUBLIC_LOGO_URL)

    @override_settings(
        FRONTEND_BASE_URL="https://app.example.com",
        EMAIL_BRAND_LOGO_URL="",
    )
    def test_public_https_frontend_serves_wordmark(self):
        self.assertEqual(brand_logo_url(), "https://app.example.com/brand/logo-text.png")

    def test_module_does_not_hardcode_future_checkstation_domains(self):
        source = inspect.getsource(email_branding_module)
        self.assertNotIn("docs.checkstation.app", source)
        self.assertNotIn("checkstation.app", source)
        self.assertNotIn("DEFAULT_BRAND_LOGO_URL", source)
        self.assertNotIn("cid:", source)


class BrandedEmailTemplateTests(SimpleTestCase):
    @override_settings(
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL="",
        PRODUCT_NAME="Check Station",
    )
    def test_html_uses_text_wordmark_without_img_when_no_public_url(self):
        html, text = render_branded_email(
            heading="Reset your CheckStation password",
            intro="Choose a new password.",
            action_label="Reset password",
            action_url="http://localhost:5173/reset-password/x/y",
            security_note="Ignore if you did not request this.",
            expiry_hours=24,
        )
        self.assertEqual(_img_srcs(html), [])
        self.assertNotIn("<img", html)
        self.assertNotIn("cid:", html)
        self.assertNotIn("http://localhost:5173/brand/", html)
        self.assertNotIn("width:180px", html)
        self.assertNotIn('height="60"', html)
        self.assertIn("CheckStation</a>", html)
        self.assertIn("CheckStation", text)
        self.assertNotIn("Check Station", html)
        self.assertNotIn("CHECK STATION", html)
        self.assertNotIn("Check Station", text)
        self.assertIn("Reset password", html)
        self.assertIn("http://localhost:5173/reset-password/x/y", text)

    @override_settings(
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL=PUBLIC_LOGO_URL,
    )
    def test_html_uses_img_when_https_logo_url_is_configured(self):
        html, _text = render_branded_email(
            heading="Verify your CheckStation email",
            intro="Confirm this email.",
            action_label="Verify email",
            action_url="http://localhost:5173/verify-email/x/y",
        )
        self.assertEqual(_img_srcs(html), [PUBLIC_LOGO_URL])
        self.assertIn(f'src="{PUBLIC_LOGO_URL}"', html)
        self.assertIn('alt="CheckStation"', html)
        self.assertIn('width="180"', html)
        self.assertIn('height="60"', html)
        self.assertNotIn("cid:", html)
        self.assertNotIn("localhost:5173/brand/", html)


class FromAddressBrandingTests(SimpleTestCase):
    def test_from_display_name_normalizes_check_station(self):
        self.assertEqual(
            format_from_address("Check Station", "accounts@example.com"),
            "CheckStation <accounts@example.com>",
        )
        self.assertEqual(
            format_from_address("CHECK STATION", "accounts@example.com"),
            "CheckStation <accounts@example.com>",
        )


class AccountEmailBrandingTests(TestCase):
    @override_settings(
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL="",
    )
    def test_verification_and_reset_use_the_same_text_wordmark(self):
        user = User.objects.create_user(
            email="owner@example.com",
            password="secure-password-123",
        )
        captured = {}

        def fake_send(**kwargs):
            captured.setdefault("calls", []).append(kwargs)
            return True

        with patch("accounts.emails.send_transactional_email", side_effect=fake_send):
            send_verification_email(user)
            send_password_reset_email(user)

        self.assertEqual(len(captured["calls"]), 2)
        verify, reset = captured["calls"]
        self.assertEqual(verify["subject"], "Verify your CheckStation email")
        self.assertEqual(reset["subject"], "Reset your CheckStation password")
        self.assertEqual(_header_strategy(verify["html_body"]), ("text", None))
        self.assertEqual(_header_strategy(reset["html_body"]), ("text", None))
        for payload in (verify, reset):
            self.assertEqual(_img_srcs(payload["html_body"]), [])
            self.assertNotIn("<img", payload["html_body"])
            self.assertNotIn("cid:", payload["html_body"])
            self.assertNotIn("localhost:5173/brand/", payload["html_body"])
            self.assertIn("CheckStation", payload["text_body"])
            self.assertNotIn("Check Station", payload["subject"])
            self.assertNotIn("Check Station", payload["html_body"])
            self.assertNotIn("Check Station", payload["text_body"])

    @override_settings(
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL=PUBLIC_LOGO_URL,
    )
    def test_verification_and_reset_use_the_same_hosted_logo(self):
        user = User.objects.create_user(
            email="owner2@example.com",
            password="secure-password-123",
        )
        captured = {}

        def fake_send(**kwargs):
            captured.setdefault("calls", []).append(kwargs)
            return True

        with patch("accounts.emails.send_transactional_email", side_effect=fake_send):
            send_verification_email(user)
            send_password_reset_email(user)

        verify, reset = captured["calls"]
        self.assertEqual(_header_strategy(verify["html_body"]), ("img", PUBLIC_LOGO_URL))
        self.assertEqual(_header_strategy(reset["html_body"]), ("img", PUBLIC_LOGO_URL))
        self.assertEqual(
            _img_srcs(verify["html_body"]),
            _img_srcs(reset["html_body"]),
        )


class BillingEmailBrandingTests(SimpleTestCase):
    @override_settings(
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL="",
    )
    def test_payment_warning_uses_shared_checkstation_branding(self):
        owner = type("Owner", (), {"email": "owner@example.com"})()
        organization = type("Org", (), {"workspace_id": "WS1"})()
        billing = type("Billing", (), {"payment_grace_deadline": None})()
        captured = {}

        def fake_send(**kwargs):
            captured.update(kwargs)
            return True

        with patch("billing.emails.send_transactional_email", side_effect=fake_send):
            send_payment_failure_warning(
                owner=owner,
                organization=organization,
                billing=billing,
            )
        self.assertEqual(
            captured["subject"],
            "CheckStation: payment problem on your subscription",
        )
        self.assertEqual(_img_srcs(captured["html_body"]), [])
        self.assertNotIn("<img", captured["html_body"])
        self.assertNotIn("cid:", captured["html_body"])
        self.assertIn("CheckStation", captured["text_body"])
        self.assertNotIn("Check Station", captured["subject"])
        self.assertNotIn("Check Station", captured["html_body"])
        self.assertNotIn("Check Station", captured["text_body"])


class GroupSenderTestEmailBrandingTests(SimpleTestCase):
    @override_settings(
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL="",
    )
    def test_group_sender_test_email_uses_shared_branding(self):
        subject, html, text = group_sender_test_email()
        self.assertEqual(subject, "CheckStation test email")
        self.assertEqual(_img_srcs(html), [])
        self.assertNotIn("<img", html)
        self.assertNotIn("cid:", html)
        self.assertIn("CheckStation", text)
        self.assertNotIn("Check Station", subject)
        self.assertNotIn("Check Station", html)
        self.assertNotIn("Check Station", text)


class ContactEmailBrandingTests(SimpleTestCase):
    @override_settings(
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL="",
    )
    def test_contact_operator_mail_uses_text_wordmark(self):
        from contact.operations import build_contact_email

        row = MagicMock()
        row.public_ref = "CS-1"
        row.category_label = "General"
        row.subcategory_label = "Question"
        row.email = "person@example.com"
        row.name = "Petkov"
        row.subject = "Hello"
        row.message = "Need help."
        row.created_at = None
        row.client_type = "web"
        row.is_privacy_request = False
        text, html = build_contact_email(row)
        self.assertEqual(_img_srcs(html), [])
        self.assertNotIn("<img", html)
        self.assertNotIn("cid:", html)
        self.assertIn("Need help.", text)


class AccountEmailResendPayloadTests(TestCase):
    def _capture_resend(self, user):
        mock_response = MagicMock()
        mock_response.read.return_value = b'{"id":"email_1"}'
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = False
        captured = []

        def fake_urlopen(request, timeout=None):
            captured.append(json.loads(request.data.decode("utf-8")))
            return mock_response

        with patch("core.mail.urllib.request.urlopen", side_effect=fake_urlopen):
            send_verification_email(user)
            send_password_reset_email(user)
        return captured

    @override_settings(
        RESEND_API_KEY="re_test_secret_key",
        RESEND_FROM_EMAIL="accounts@example.com",
        RESEND_FROM_NAME="CheckStation",
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL="",
        RESEND_TIMEOUT_SECONDS=15,
    )
    def test_verify_and_reset_resend_json_has_no_branding_attachment_or_img(self):
        user = User.objects.create_user(
            email="owner@example.com",
            password="secure-password-123",
        )
        captured = self._capture_resend(user)
        self.assertEqual(len(captured), 2)
        verify, reset = captured
        self.assertEqual(sorted(verify.keys()), sorted(reset.keys()))
        for payload in (verify, reset):
            self.assertEqual(
                set(payload.keys()),
                {"from", "to", "subject", "html", "text"},
            )
            self.assertNotIn("attachments", payload)
            self.assertEqual(_img_srcs(payload["html"]), [])
            self.assertNotIn("<img", payload["html"])
            self.assertNotIn("cid:", payload["html"])
            self.assertNotIn("localhost:5173/brand/", payload["html"])
        self.assertEqual(_header_strategy(verify["html"]), _header_strategy(reset["html"]))

    @override_settings(
        RESEND_API_KEY="re_test_secret_key",
        RESEND_FROM_EMAIL="accounts@example.com",
        RESEND_FROM_NAME="CheckStation",
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL=PUBLIC_LOGO_URL,
        RESEND_TIMEOUT_SECONDS=15,
    )
    def test_verify_and_reset_resend_json_uses_configured_https_img(self):
        user = User.objects.create_user(
            email="owner3@example.com",
            password="secure-password-123",
        )
        captured = self._capture_resend(user)
        verify, reset = captured
        for payload in (verify, reset):
            self.assertNotIn("attachments", payload)
            self.assertEqual(_img_srcs(payload["html"]), [PUBLIC_LOGO_URL])
            self.assertNotIn("cid:", payload["html"])
        self.assertEqual(_header_strategy(verify["html"]), ("img", PUBLIC_LOGO_URL))
        self.assertEqual(_header_strategy(reset["html"]), ("img", PUBLIC_LOGO_URL))


class SmtpHostedLogoTests(SimpleTestCase):
    @override_settings(
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL="",
    )
    def test_smtp_message_has_no_logo_mime_part_with_text_fallback(self):
        from groups.email_providers.smtp_transport import build_email_message

        html, text = render_branded_email(heading="CheckStation test email")
        message = build_email_message(
            from_email="group@example.com",
            from_name="Example Group",
            to_email="owner@example.com",
            subject="CheckStation test email",
            text_body=text,
            html_body=html,
        )
        raw = message.as_string()
        content_types = [part.get_content_type() for part in message.walk()]
        self.assertEqual(_img_srcs(html), [])
        self.assertNotIn("<img", html)
        self.assertNotIn("cid:", html)
        self.assertNotIn("cid:", raw)
        self.assertNotIn("image/png", content_types)
        self.assertNotIn("Content-Type: image/png", raw)
        self.assertNotIn("Content-ID:", raw)
        for part in message.walk():
            self.assertIsNone(part.get("Content-ID"))
            self.assertFalse((part.get_content_type() or "").startswith("image/"))

    @override_settings(
        FRONTEND_BASE_URL="http://localhost:5173",
        EMAIL_BRAND_LOGO_URL=PUBLIC_LOGO_URL,
    )
    def test_smtp_message_hosts_logo_in_html_without_image_part(self):
        from groups.email_providers.smtp_transport import build_email_message

        html, text = render_branded_email(heading="CheckStation test email")
        message = build_email_message(
            from_email="group@example.com",
            from_name="Example Group",
            to_email="owner@example.com",
            subject="CheckStation test email",
            text_body=text,
            html_body=html,
        )
        raw = message.as_string()
        content_types = [part.get_content_type() for part in message.walk()]
        self.assertEqual(_img_srcs(html), [PUBLIC_LOGO_URL])
        self.assertNotIn("cid:", raw)
        self.assertNotIn("image/png", content_types)
        self.assertNotIn("Content-ID:", raw)
