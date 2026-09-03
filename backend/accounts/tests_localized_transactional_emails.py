import re
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework.test import APIClient

from accounts.tokens import (
    email_verification_token_generator,
    password_reset_token_generator,
)

User = get_user_model()


def _auth_link_parts(text_body, route):
    match = re.search(
        rf"https?://[^\s]+/{route}/(?P<uid>[^/\s]+)/(?P<token>[^\s]+)",
        text_body,
    )
    if match is None:
        raise AssertionError(f"No {route} URL found in email body")
    return match.group("uid"), match.group("token")


@override_settings(
    FRONTEND_BASE_URL="http://localhost:5173",
    EMAIL_BRAND_LOGO_URL="",
)
class LocalizedRegistrationEmailTests(TestCase):
    def _register(self, *, email, locale):
        captured = {}

        def fake_send(**kwargs):
            captured.update(kwargs)
            return True

        with patch(
            "accounts.emails.send_transactional_email",
            side_effect=fake_send,
        ):
            response = APIClient().post(
                "/api/auth/register/",
                {
                    "email": email,
                    "password": "secure-password-123",
                    "password_confirm": "secure-password-123",
                    "legal_acknowledgement": True,
                    "locale": locale,
                },
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        return User.objects.get(email=email), captured

    def test_english_registration_sends_english_verification_email(self):
        user, email = self._register(email="english@example.com", locale="en")

        self.assertEqual(user.preferred_language, "en")
        self.assertEqual(email["subject"], "Verify your CheckStation email")
        self.assertIn("Thanks for creating a CheckStation account.", email["text_body"])
        self.assertNotIn("メールアドレスを確認してください", email["text_body"])

    def test_japanese_registration_sends_japanese_verification_email(self):
        user, email = self._register(email="japanese@example.com", locale="ja")

        self.assertEqual(user.preferred_language, "ja")
        self.assertEqual(email["subject"], "メールアドレスを確認してください")
        self.assertIn("CheckStationへのご登録ありがとうございます。", email["text_body"])
        self.assertIn("メールアドレスを確認", email["html_body"])
        self.assertIn("このリンクの有効期限は24時間です。", email["text_body"])
        self.assertIn('lang="ja"', email["html_body"])

        uid, token = _auth_link_parts(email["text_body"], "verify-email")
        self.assertEqual(force_str(urlsafe_base64_decode(uid)), str(user.pk))
        self.assertTrue(email_verification_token_generator.check_token(user, token))

    def test_unsupported_registration_locale_falls_back_to_english(self):
        user, email = self._register(email="fallback@example.com", locale="fr-FR")

        self.assertEqual(user.preferred_language, "en")
        self.assertEqual(email["subject"], "Verify your CheckStation email")


@override_settings(
    FRONTEND_BASE_URL="http://localhost:5173",
    EMAIL_BRAND_LOGO_URL="",
)
class LocalizedPasswordResetEmailTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def _request_reset(self, *, email, locale, preferred_language="en"):
        user = User.objects.create_user(
            email=email,
            password="secure-password-123",
            preferred_language=preferred_language,
        )
        user.mark_email_verified()
        captured = {}

        def fake_send(**kwargs):
            captured.update(kwargs)
            return True

        with patch(
            "accounts.emails.send_transactional_email",
            side_effect=fake_send,
        ):
            response = APIClient().post(
                "/api/auth/forgot-password/",
                {"email": email, "locale": locale},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        return user, captured

    def test_english_request_sends_english_reset_email(self):
        _user, email = self._request_reset(email="reset-en@example.com", locale="en")

        self.assertEqual(email["subject"], "Reset your CheckStation password")
        self.assertIn("We received a request to reset", email["text_body"])
        self.assertNotIn("パスワードを再設定", email["text_body"])

    def test_japanese_request_sends_japanese_reset_without_changing_preference(self):
        user, email = self._request_reset(
            email="reset-ja@example.com",
            locale="ja",
            preferred_language="en",
        )

        self.assertEqual(user.preferred_language, "en")
        self.assertEqual(email["subject"], "パスワードを再設定")
        self.assertIn(
            "CheckStationアカウントのパスワード再設定リクエストを受け付けました。",
            email["text_body"],
        )
        self.assertIn("このリンクには有効期限があります。", email["text_body"])
        self.assertIn('lang="ja"', email["html_body"])

        uid, token = _auth_link_parts(email["text_body"], "reset-password")
        self.assertEqual(force_str(urlsafe_base64_decode(uid)), str(user.pk))
        self.assertTrue(password_reset_token_generator.check_token(user, token))

    def test_unsupported_reset_locale_falls_back_to_english(self):
        _user, email = self._request_reset(
            email="reset-fallback@example.com",
            locale="unsupported",
            preferred_language="ja",
        )

        self.assertEqual(email["subject"], "Reset your CheckStation password")


@override_settings(
    FRONTEND_BASE_URL="http://localhost:5173",
    EMAIL_BRAND_LOGO_URL="",
)
class LocalizedAccountManagementEmailTests(TestCase):
    def test_japanese_backup_email_verification(self):
        user = User.objects.create_user(
            email="owner@example.com",
            password="secure-password-123",
            preferred_language="ja",
        )
        user.pending_backup_email = "backup@example.com"
        captured = {}

        with patch(
            "accounts.emails.send_transactional_email",
            side_effect=lambda **kwargs: captured.update(kwargs) or True,
        ):
            from accounts.emails import send_backup_email_verification

            send_backup_email_verification(user)

        self.assertEqual(captured["subject"], "CheckStation バックアップメールを確認")
        self.assertIn("バックアップメールを確認", captured["text_body"])
        self.assertIn('lang="ja"', captured["html_body"])

    def test_japanese_payment_failure_warning(self):
        from billing.emails import send_payment_failure_warning

        owner = MagicMock(email="owner@example.com", preferred_language="ja")
        organization = MagicMock(workspace_id="WS-123")
        billing = MagicMock(payment_grace_deadline=None)
        captured = {}

        with patch(
            "billing.emails.send_transactional_email",
            side_effect=lambda **kwargs: captured.update(kwargs) or True,
        ):
            send_payment_failure_warning(
                owner=owner,
                organization=organization,
                billing=billing,
            )

        self.assertIn("支払いに問題があります", captured["subject"])
        self.assertIn("猶予期間", captured["text_body"])
