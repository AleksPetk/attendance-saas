"""Auth and recovery abuse rate-limit tests (Phase 5)."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from accounts.services import FORGOT_PASSWORD_MESSAGE, RESEND_PUBLIC_MESSAGE
from accounts.tokens import email_verification_token_generator
from core.auth_rate_limits import clear_owner_login_failures
from core.rate_limit import rate_limit_key
from organizations.models import Organization, WorkspaceStaffAccount, WorkspaceStaffRole

User = get_user_model()

RATE_LIMIT_SETTINGS = {
    "OWNER_LOGIN_IP_LIMIT": 3,
    "OWNER_LOGIN_IP_WINDOW": 900,
    "OWNER_LOGIN_ACCOUNT_LIMIT": 2,
    "OWNER_LOGIN_ACCOUNT_WINDOW": 900,
    "STAFF_LOGIN_IP_LIMIT": 3,
    "STAFF_LOGIN_IP_WINDOW": 900,
    "STAFF_LOGIN_ACCOUNT_LIMIT": 2,
    "STAFF_LOGIN_ACCOUNT_WINDOW": 900,
    "STAFF_LOGIN_WORKSPACE_IP_LIMIT": 4,
    "PASSWORD_RESET_IP_LIMIT": 2,
    "PASSWORD_RESET_IP_WINDOW": 3600,
    "PASSWORD_RESET_EMAIL_LIMIT": 2,
    "PASSWORD_RESET_EMAIL_WINDOW": 3600,
    "VERIFICATION_RESEND_IP_LIMIT": 2,
    "VERIFICATION_RESEND_IP_WINDOW": 3600,
    "CACHES": {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "auth-rate-limit-tests",
        }
    },
}


def _verify_owner(user):
    user.mark_email_verified()
    Organization.objects.create_with_owner(owner=user)


@override_settings(**RATE_LIMIT_SETTINGS)
class OwnerLoginRateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        self.api = APIClient()
        self.user = User.objects.create_user(
            email="owner-rl@example.com",
            password="secure-password",
        )
        _verify_owner(self.user)

    def _login(self, *, email=None, password="wrong"):
        return self.api.post(
            "/api/auth/login/",
            {"email": email or self.user.email, "password": password},
            format="json",
        )

    def test_failures_below_threshold_return_invalid_credentials(self):
        for _ in range(2):
            response = self._login()
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.data["detail"], "Invalid email or password.")

    def test_threshold_exceeded_returns_429(self):
        for _ in range(2):
            self._login()
        response = self._login()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data["code"], "rate_limited")

    def test_valid_login_succeeds_below_threshold(self):
        response = self._login(password="secure-password")
        self.assertEqual(response.status_code, 200)

    def test_success_clears_account_failure_state(self):
        self._login()
        self._login()
        clear_owner_login_failures(self.user.email)
        response = self._login(password="secure-password")
        self.assertEqual(response.status_code, 200)

    def test_nonexistent_email_behaves_generically(self):
        response = self._login(email="nobody@example.com")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], "Invalid email or password.")

    def test_shared_cache_state_persists_across_clients(self):
        """Simulates another worker seeing the same cache backend."""
        from core.auth_rate_limits import record_owner_login_failure

        request = type("R", (), {"META": {"REMOTE_ADDR": "203.0.113.10"}})()
        record_owner_login_failure(request, self.user.email)
        record_owner_login_failure(request, self.user.email)
        other = APIClient()
        response = other.post(
            "/api/auth/login/",
            {"email": self.user.email, "password": "wrong"},
            format="json",
            REMOTE_ADDR="203.0.113.10",
        )
        self.assertEqual(response.status_code, 429)


@override_settings(**RATE_LIMIT_SETTINGS)
class StaffLoginRateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        self.api = APIClient()
        owner = User.objects.create_user(
            email="staff-owner@example.com",
            password="secure-password",
        )
        owner.mark_email_verified()
        self.org = Organization.objects.create_with_owner(owner=owner)
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.org,
            username="reception",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )

    def _login(self, *, workspace_id=None, username="reception", password="wrong"):
        return self.api.post(
            "/api/auth/staff-login/",
            {
                "workspace_id": workspace_id or self.org.workspace_id,
                "username": username,
                "password": password,
            },
            format="json",
        )

    def test_invalid_password_throttles(self):
        for _ in range(2):
            self.assertEqual(self._login().status_code, 401)
        self.assertEqual(self._login().status_code, 429)

    def test_invalid_workspace_id_does_not_enumerate(self):
        response = self._login(workspace_id="WS-NOPE")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], "Invalid workspace staff credentials.")

    def test_invalid_username_does_not_enumerate(self):
        response = self._login(username="nobody")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], "Invalid workspace staff credentials.")

    def test_valid_login_works_below_limit(self):
        response = self._login(password="staff-password")
        self.assertEqual(response.status_code, 200)

    def test_ip_wide_abuse_throttles_rotated_usernames(self):
        for index in range(3):
            self._login(username=f"user{index}")
        self.assertEqual(self._login(username="another").status_code, 429)


@override_settings(**RATE_LIMIT_SETTINGS)
class PasswordResetRateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        self.api = APIClient()
        self.user = User.objects.create_user(
            email="reset-rl@example.com",
            password="secure-password",
        )
        self.user.mark_email_verified()

    def test_existing_and_missing_email_return_equivalent_response(self):
        with patch("accounts.services.send_password_reset_email"):
            existing = self.api.post(
                "/api/auth/forgot-password/",
                {"email": "reset-rl@example.com"},
                format="json",
            )
            missing = self.api.post(
                "/api/auth/forgot-password/",
                {"email": "missing@example.com"},
                format="json",
            )
        self.assertEqual(existing.status_code, 200)
        self.assertEqual(missing.status_code, 200)
        self.assertEqual(existing.data["detail"], FORGOT_PASSWORD_MESSAGE)
        self.assertEqual(missing.data["detail"], FORGOT_PASSWORD_MESSAGE)

    def test_repeated_same_email_respects_cache_limit_without_extra_sends(self):
        with patch("accounts.services.send_password_reset_email") as send_mail:
            for _ in range(3):
                self.api.post(
                    "/api/auth/forgot-password/",
                    {"email": "reset-rl@example.com"},
                    format="json",
                )
        self.assertEqual(send_mail.call_count, 1)

    def test_per_ip_abuse_throttles_without_sending(self):
        with patch("accounts.services.send_password_reset_email") as send_mail:
            self.api.post(
                "/api/auth/forgot-password/",
                {"email": "reset-rl@example.com"},
                format="json",
                REMOTE_ADDR="198.51.100.9",
            )
            self.api.post(
                "/api/auth/forgot-password/",
                {"email": "other@example.com"},
                format="json",
                REMOTE_ADDR="198.51.100.9",
            )
            self.api.post(
                "/api/auth/forgot-password/",
                {"email": "third@example.com"},
                format="json",
                REMOTE_ADDR="198.51.100.9",
            )
        self.assertEqual(send_mail.call_count, 1)


@override_settings(**RATE_LIMIT_SETTINGS)
class VerificationResendRateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        self.api = APIClient()

    def test_public_resend_stays_generic_when_ip_throttled(self):
        with patch("accounts.services.send_verification_email_for_user") as send_mail:
            for _ in range(3):
                response = self.api.post(
                    "/api/auth/resend-verification/",
                    {"email": "any@example.com"},
                    format="json",
                    REMOTE_ADDR="203.0.113.55",
                )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["detail"], RESEND_PUBLIC_MESSAGE)
        send_mail.assert_not_called()


class RateLimitKeyHashingTests(TestCase):
    def test_cache_keys_do_not_contain_raw_identifiers(self):
        key = rate_limit_key("owner_login", "account", "secret@example.com")
        self.assertNotIn("secret@example.com", key)
        self.assertTrue(key.startswith("rl:owner_login:account:"))


@override_settings(
    CLASS_PIN_VERIFY_LIMIT=3,
    CLASS_PIN_VERIFY_WINDOW=60,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "class-pin-rate-limit-tests",
        }
    },
)
class ClassPinRateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        from accounts.testing import force_platform_admin_login
        from groups.models import Group, GroupMembership, GroupSection, GroupType
        from kiosk_builder.testing import configure_group_kiosk_for_launch
        from members.models import Member
        from organizations.models import Organization, OrganizationPlan

        owner = User.objects.create_user(
            email="pin-rl@example.com",
            password="secure-password",
        )
        owner.mark_email_verified()
        self.org = Organization.objects.create_with_owner(owner=owner)
        self.org.plan = OrganizationPlan.BUSINESS
        self.org.save(update_fields=["plan", "updated_at"])
        self.client = APIClient()
        force_platform_admin_login(self.client, owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="PIN Group",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
            check_out_enabled=True,
            breaks_enabled=True,
            max_breaks=2,
        )
        self.section = GroupSection.objects.create_section(
            group=self.group,
            name="Class A",
        )
        self.section.set_class_pin("9999")
        self.section.save()
        section_b = GroupSection.objects.create_section(
            group=self.group,
            name="Class B",
        )
        section_b.set_class_pin("8888")
        section_b.save()
        member = Member.objects.create(
            organization=self.org,
            name="Test Member",
            email="member@example.com",
        )
        membership = GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=member,
            section=self.section,
        )
        membership.set_participation_pin("1111")
        membership.save(update_fields=["participation_pin_hash"])
        self.group.require_class_pin = True
        self.group.save(update_fields=["require_class_pin", "updated_at"])
        configure_group_kiosk_for_launch(self.group, use_pin=False)
        self.verify_url = (
            f"/api/groups/{self.group.pk}/kiosk/classes/{self.section.pk}/verify-pin/"
        )

    def test_class_pin_brute_force_eventually_throttles(self):
        for _ in range(3):
            response = self.client.post(self.verify_url, {"pin": "0000"}, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["code"], "invalid_class_pin")
        blocked = self.client.post(self.verify_url, {"pin": "0000"}, format="json")
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.data["code"], "rate_limited")

    def test_correct_pin_not_stored_in_cache_keys(self):
        from core.rate_limit import rate_limit_key

        key = rate_limit_key(
            "class_pin",
            "scope",
            f"{self.org.pk}:{self.group.pk}:{self.section.pk}:127.0.0.1",
        )
        self.assertNotIn("9999", key)


@override_settings(
    KIOSK_EXIT_VERIFY_LIMIT=3,
    KIOSK_EXIT_VERIFY_WINDOW=60,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "kiosk-exit-rate-limit-tests",
        }
    },
)
class KioskExitRateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        from groups.models import Group
        from kiosk_builder.testing import configure_group_kiosk_for_launch
        from organizations.models import Organization, OrganizationPlan

        self.owner = User.objects.create_user(
            email="exit-rl@example.com",
            password="secure-password",
        )
        self.owner.mark_email_verified()
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.org.plan = OrganizationPlan.BUSINESS
        self.org.save(update_fields=["plan", "updated_at"])
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Exit Group",
            check_in_enabled=True,
        )
        configure_group_kiosk_for_launch(self.group)
        self.client = APIClient()
        login = self.client.post(
            "/api/auth/login/",
            {"email": "exit-rl@example.com", "password": "secure-password"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        lock = self.client.post(f"/api/groups/{self.group.pk}/kiosk/")
        self.assertEqual(lock.status_code, 200)

    def test_kiosk_exit_brute_force_eventually_throttles(self):
        for _ in range(3):
            response = self.client.post(
                "/api/kiosk/exit/",
                {"exit_code": "wrong1"},
                format="json",
            )
            self.assertEqual(response.status_code, 403)
        blocked = self.client.post(
            "/api/kiosk/exit/",
            {"exit_code": "wrong1"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.data["code"], "rate_limited")
