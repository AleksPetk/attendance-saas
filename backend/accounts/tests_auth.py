from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APIClient

from accounts.services import FORGOT_PASSWORD_MESSAGE, RESEND_PUBLIC_MESSAGE
from accounts.testing import force_platform_admin_login
from accounts.tokens import email_verification_token_generator
from core.mail import EmailSendError
from organizations.models import Organization

User = get_user_model()


def uid_for(user):
    return urlsafe_base64_encode(force_bytes(user.pk))


class OwnerAuthEmailTests(TestCase):
    def setUp(self):
        self.api = APIClient()

    def _register(self, email="newowner@example.com", password="secure-password"):
        with patch("organizations.views.send_verification_email_for_user"):
            return self.api.post(
                "/api/auth/register/",
                {
                    "email": email,
                    "password": password,
                    "password_confirm": password,
                },
                format="json",
            )

    def test_registration_creates_unverified_user_and_one_workspace(self):
        response = self._register()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="newowner@example.com")
        self.assertFalse(user.email_verified)
        self.assertEqual(Organization.objects.filter(owner=user).count(), 1)

    def test_registration_calls_verification_email_service(self):
        with patch("organizations.views.send_verification_email_for_user") as send_mail:
            response = self.api.post(
                "/api/auth/register/",
                {
                    "email": "owner@example.com",
                    "password": "secure-password",
                    "password_confirm": "secure-password",
                },
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["verification_email_sent"])
        send_mail.assert_called_once()

    def test_registration_keeps_account_if_email_send_fails(self):
        with patch(
            "organizations.views.send_verification_email_for_user",
            side_effect=EmailSendError("provider down"),
        ):
            with self.assertLogs("organizations", level="ERROR"):
                response = self.api.post(
                    "/api/auth/register/",
                    {
                        "email": "owner@example.com",
                        "password": "secure-password",
                        "password_confirm": "secure-password",
                    },
                    format="json",
                )
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data["verification_email_sent"])
        user = User.objects.get(email="owner@example.com")
        self.assertFalse(user.email_verified)
        self.assertTrue(Organization.objects.filter(owner=user).exists())

    def test_registration_ignores_privilege_flags(self):
        with patch("organizations.views.send_verification_email_for_user"):
            response = self.api.post(
                "/api/auth/register/",
                {
                    "email": "owner@example.com",
                    "password": "secure-password",
                    "password_confirm": "secure-password",
                    "is_staff": True,
                    "is_superuser": True,
                    "email_verified": True,
                },
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email="owner@example.com")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertFalse(user.email_verified)

    def test_valid_verification_token_marks_email_verified(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        token = email_verification_token_generator.make_token(user)
        client = APIClient()
        response = client.post(
            "/api/auth/verify-email/",
            {"uid": uid_for(user), "token": token},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["code"], "verified")
        user.refresh_from_db()
        self.assertTrue(user.email_verified)
        self.assertIsNotNone(user.email_verified_at)

    def test_verification_token_cannot_be_reused(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        token = email_verification_token_generator.make_token(user)
        payload = {"uid": uid_for(user), "token": token}
        first = self.api.post("/api/auth/verify-email/", payload, format="json")
        second = self.api.post("/api/auth/verify-email/", payload, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(second.data["code"], "token_invalid")

    def test_expired_verification_token(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        token = email_verification_token_generator.make_token(user)
        future = email_verification_token_generator._now() + timedelta(hours=25)
        with patch.object(email_verification_token_generator, "_now", return_value=future):
            response = self.api.post(
                "/api/auth/verify-email/",
                {"uid": uid_for(user), "token": token},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "token_expired")
        user.refresh_from_db()
        self.assertFalse(user.email_verified)

    def test_malformed_verification_token(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        response = self.api.post(
            "/api/auth/verify-email/",
            {"uid": uid_for(user), "token": "not-a-valid-token"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "token_invalid")
        self.assertNotIn("email", response.data)

    def test_unverified_customer_cannot_access_workspace(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        self.api.force_authenticate(user=user)
        response = self.api.get("/api/workspace/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "email_not_verified")
        members = self.api.get("/api/members/")
        self.assertEqual(members.status_code, 403)

    def test_unverified_login_is_not_wrong_password(self):
        self._register()
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"email": "newowner@example.com", "password": "secure-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "email_not_verified")
        self.assertEqual(
            response.data["detail"],
            "Please verify your email before continuing.",
        )

    def test_wrong_password_stays_generic(self):
        self._register()
        response = APIClient().post(
            "/api/auth/login/",
            {"email": "newowner@example.com", "password": "wrong-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], "Invalid email or password.")

    def test_inactive_user_login_is_generic(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        user.mark_email_verified()
        user.is_active = False
        user.save(update_fields=["is_active"])
        response = APIClient().post(
            "/api/auth/login/",
            {"email": "newowner@example.com", "password": "secure-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], "Invalid email or password.")

    def test_verified_user_can_login_and_access_workspace(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        user.mark_email_verified()
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"email": "newowner@example.com", "password": "secure-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["account_kind"], "owner")
        workspace = client.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)

    def test_authenticated_resend_verification(self):
        self._register()
        with patch("accounts.services.send_verification_email") as send_mail:
            response = self.api.post("/api/auth/resend-verification/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["code"], "sent")
        send_mail.assert_called_once()

    def test_authenticated_resend_cooldown(self):
        self._register()
        with patch("accounts.services.send_verification_email"):
            first = self.api.post("/api/auth/resend-verification/", {}, format="json")
            second = self.api.post("/api/auth/resend-verification/", {}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.data["code"], "email_cooldown")

    def test_public_resend_does_not_enumerate(self):
        self._register()
        with patch("accounts.services.send_verification_email"):
            existing = APIClient().post(
                "/api/auth/resend-verification/",
                {"email": "newowner@example.com"},
                format="json",
            )
            missing = APIClient().post(
                "/api/auth/resend-verification/",
                {"email": "nobody@example.com"},
                format="json",
            )
        self.assertEqual(existing.status_code, missing.status_code)
        self.assertEqual(existing.data["detail"], missing.data["detail"])
        self.assertEqual(existing.data["detail"], RESEND_PUBLIC_MESSAGE)

    def test_platform_admin_login_and_admin_site_still_work(self):
        admin = User.objects.create_superuser(
            email="platform@example.com",
            password="secure-password",
        )
        self.assertTrue(admin.email_verified)
        client = APIClient()
        login = client.post(
            "/api/auth/login/",
            {"email": "platform@example.com", "password": "secure-password"},
            format="json",
        )
        self.assertEqual(login.status_code, 404)
        force_platform_admin_login(self.client, admin)
        response = self.client.get("/admin/")
        self.assertEqual(response.status_code, 200)

    def test_unverified_platform_operator_is_exempt_from_customer_gate(self):
        admin = User.objects.create_user(
            email="ops@example.com",
            password="secure-password",
            is_staff=True,
            is_superuser=True,
            email_verified=False,
        )
        force_platform_admin_login(self.client, admin)
        response = self.client.get("/admin/")
        self.assertEqual(response.status_code, 200)


class ForgotPasswordTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.user = User.objects.create_user(
            email="owner@example.com",
            password="secure-password",
        )
        self.user.mark_email_verified()
        Organization.objects.create_with_owner(owner=self.user)

    def test_existing_and_missing_email_return_the_same_payload(self):
        with patch("accounts.services.send_password_reset_email"):
            existing = self.api.post(
                "/api/auth/forgot-password/",
                {"email": "owner@example.com"},
                format="json",
            )
            missing = self.api.post(
                "/api/auth/forgot-password/",
                {"email": "missing@example.com"},
                format="json",
            )
        self.assertEqual(existing.status_code, 200)
        self.assertEqual(missing.status_code, 200)
        self.assertEqual(existing.data, missing.data)
        self.assertEqual(existing.data["detail"], FORGOT_PASSWORD_MESSAGE)

    def test_reset_email_only_sent_for_eligible_user(self):
        with patch("accounts.services.send_password_reset_email") as send_mail:
            self.api.post(
                "/api/auth/forgot-password/",
                {"email": "owner@example.com"},
                format="json",
            )
            self.api.post(
                "/api/auth/forgot-password/",
                {"email": "missing@example.com"},
                format="json",
            )
        send_mail.assert_called_once()
        self.assertEqual(send_mail.call_args.args[0].pk, self.user.pk)

    def test_reset_password_success_invalidates_old_password(self):
        from accounts.tokens import password_reset_token_generator

        token = password_reset_token_generator.make_token(self.user)
        response = self.api.post(
            "/api/auth/reset-password/",
            {
                "uid": uid_for(self.user),
                "token": token,
                "password": "brand-new-password-32",
                "password_confirm": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.check_password("secure-password"))
        self.assertTrue(self.user.check_password("brand-new-password-32"))

        reused = self.api.post(
            "/api/auth/reset-password/",
            {
                "uid": uid_for(self.user),
                "token": token,
                "password": "another-new-password-32",
                "password_confirm": "another-new-password-32",
            },
            format="json",
        )
        self.assertEqual(reused.status_code, 400)
        self.assertEqual(reused.data["code"], "token_invalid")

        old_login = APIClient().post(
            "/api/auth/login/",
            {"email": "owner@example.com", "password": "secure-password"},
            format="json",
        )
        new_login = APIClient().post(
            "/api/auth/login/",
            {"email": "owner@example.com", "password": "brand-new-password-32"},
            format="json",
        )
        self.assertEqual(old_login.status_code, 401)
        self.assertEqual(new_login.status_code, 200)

    def test_invalid_and_expired_reset_tokens(self):
        from accounts.tokens import password_reset_token_generator

        token = password_reset_token_generator.make_token(self.user)
        invalid = self.api.post(
            "/api/auth/reset-password/",
            {
                "uid": uid_for(self.user),
                "token": "nope-token",
                "password": "brand-new-password-32",
                "password_confirm": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(invalid.data["code"], "token_invalid")

        future = password_reset_token_generator._now() + timedelta(hours=25)
        with patch.object(password_reset_token_generator, "_now", return_value=future):
            expired = self.api.post(
                "/api/auth/reset-password/",
                {
                    "uid": uid_for(self.user),
                    "token": token,
                    "password": "brand-new-password-32",
                    "password_confirm": "brand-new-password-32",
                },
                format="json",
            )
        self.assertEqual(expired.status_code, 400)
        self.assertEqual(expired.data["code"], "token_expired")

    def test_password_validators_enforced_on_reset(self):
        from accounts.tokens import password_reset_token_generator

        token = password_reset_token_generator.make_token(self.user)
        response = self.api.post(
            "/api/auth/reset-password/",
            {
                "uid": uid_for(self.user),
                "token": token,
                "password": "123",
                "password_confirm": "123",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data)


class ChangePasswordTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="owner@example.com",
            password="secure-password",
        )
        self.user.mark_email_verified()
        Organization.objects.create_with_owner(owner=self.user)
        self.api = APIClient()
        self.api.force_login(self.user)

    def test_current_password_required(self):
        response = self.api.post(
            "/api/auth/change-password/",
            {
                "current_password": "wrong-password",
                "new_password": "brand-new-password-32",
                "new_password_confirm": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("current_password", response.data)

    def test_weak_new_password_rejected(self):
        response = self.api.post(
            "/api/auth/change-password/",
            {
                "current_password": "secure-password",
                "new_password": "123",
                "new_password_confirm": "123",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password", response.data)

    def test_successful_change_keeps_current_session(self):
        response = self.api.post(
            "/api/auth/change-password/",
            {
                "current_password": "secure-password",
                "new_password": "brand-new-password-32",
                "new_password_confirm": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        workspace = self.api.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("brand-new-password-32"))

    def test_account_endpoint_hides_internal_flags(self):
        response = self.api.get("/api/auth/account/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["email"], "owner@example.com")
        self.assertTrue(response.data["email_verified"])
        self.assertNotIn("is_staff", response.data)
        self.assertNotIn("is_superuser", response.data)
        self.assertNotIn("is_active", response.data)
        self.assertEqual(response.data["two_factor_status"], "not_enabled")
