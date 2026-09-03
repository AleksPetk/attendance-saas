"""Tests for shared post-first-factor owner authentication completion."""

from unittest.mock import patch

import pyotp
from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase
from rest_framework.test import APIClient

from accounts.customer_two_factor_models import OwnerTOTPDevice
from accounts.owner_authentication import complete_owner_authentication, establish_owner_session
from accounts.owner_two_factor import (
    OWNER_2FA_PENDING_AT_KEY,
    OWNER_2FA_PENDING_USER_KEY,
    decrypt_owner_totp_secret,
    encrypt_owner_totp_secret,
)
from accounts.two_factor import TOTP_INTERVAL, generate_totp_secret
from organizations.models import Organization, OrganizationStatus

User = get_user_model()


def _totp_code_for_device_step(secret, device):
    from accounts.two_factor import current_timestep

    step = current_timestep()
    if device.last_verified_timestep is not None and device.last_verified_timestep >= step - 1:
        step = int(device.last_verified_timestep) + 1
    totp = pyotp.TOTP(secret, digits=6, interval=TOTP_INTERVAL)
    return totp.at(step * TOTP_INTERVAL)


def create_owner(email="owner-auth@example.com", *, verified=True, password="secure-password"):
    user = User.objects.create_user(email=email, password=password)
    if verified:
        user.mark_email_verified()
    organization = Organization.objects.create_with_owner(owner=user)
    return user, organization


class CompleteOwnerAuthenticationTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.client = APIClient()
        self.owner, self.organization = create_owner()

    def _request(self):
        request = self.factory.post("/api/auth/login/")
        request.session = self.client.session
        return request

    def test_unverified_owner_cannot_complete_authentication(self):
        user, _organization = create_owner("unverified-auth@example.com", verified=False)
        request = self._request()
        response = complete_owner_authentication(request, user)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "email_not_verified")

    def test_missing_active_workspace_returns_404(self):
        user = User.objects.create_user(email="orphan-auth@example.com", password="secure-password")
        user.mark_email_verified()
        request = self._request()
        response = complete_owner_authentication(request, user)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "No active workspace for this account.")

    def test_blocked_workspace_returns_404(self):
        request = self._request()
        self.organization.status = OrganizationStatus.BLOCKED
        self.organization.save(update_fields=["status"])
        response = complete_owner_authentication(request, self.owner)
        self.assertEqual(response.status_code, 404)

    def test_owner_without_2fa_establishes_session_and_returns_workspace_payload(self):
        request = self._request()
        response = complete_owner_authentication(request, self.owner)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["account_kind"], "owner")
        self.assertEqual(response.data["workspace_id"], self.organization.workspace_id)
        self.assertEqual(response.data["account_mode"], "normal")
        self.assertEqual(response.data["workspace_status"], OrganizationStatus.ACTIVE)
        request.user = self.owner
        self.assertTrue(hasattr(request, "session"))

    def test_owner_with_2fa_returns_two_factor_required_without_logging_in(self):
        OwnerTOTPDevice.objects.create(
            user=self.owner,
            secret_encrypted=encrypt_owner_totp_secret(generate_totp_secret()),
            confirmed=True,
        )
        request = self._request()
        with patch("accounts.owner_authentication.login") as login_mock:
            response = complete_owner_authentication(request, self.owner)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "two_factor_required")
        login_mock.assert_not_called()
        self.assertEqual(request.session.get(OWNER_2FA_PENDING_USER_KEY), self.owner.pk)
        self.assertTrue(request.session.get(OWNER_2FA_PENDING_AT_KEY))

    def test_establish_owner_session_is_post_challenge_helper(self):
        request = self._request()
        workspace = establish_owner_session(request, self.owner, organization=self.organization)
        self.assertEqual(workspace["workspace_id"], self.organization.workspace_id)
        self.assertEqual(workspace["account_mode"], "normal")


class CompleteOwnerAuthenticationIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner, self.organization = create_owner(email="owner-auth-int@example.com")

    def test_password_login_without_2fa_uses_shared_completion(self):
        response = self.client.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "secure-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["account_kind"], "owner")
        workspace = self.client.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)

    def test_password_login_with_2fa_still_requires_challenge(self):
        api = APIClient()
        api.force_authenticate(self.owner)
        start = api.post(
            "/api/auth/owner-2fa/setup/",
            {"current_password": "secure-password"},
            format="json",
        )
        import pyotp
        from accounts.two_factor import TOTP_INTERVAL

        secret = start.data["setup_key"]
        code = pyotp.TOTP(secret, digits=6, interval=TOTP_INTERVAL).now()
        verify = api.post("/api/auth/owner-2fa/setup/verify/", {"code": code}, format="json")
        self.assertEqual(verify.status_code, 200)

        login = APIClient()
        response = login.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "secure-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "two_factor_required")
        self.assertNotEqual(login.get("/api/workspace/").status_code, 200)

    def test_2fa_challenge_completion_returns_full_workspace_payload(self):
        api = APIClient()
        api.force_authenticate(self.owner)
        start = api.post(
            "/api/auth/owner-2fa/setup/",
            {"current_password": "secure-password"},
            format="json",
        )
        import pyotp
        from accounts.two_factor import TOTP_INTERVAL

        secret = start.data["setup_key"]
        code = pyotp.TOTP(secret, digits=6, interval=TOTP_INTERVAL).now()
        api.post("/api/auth/owner-2fa/setup/verify/", {"code": code}, format="json")

        login = APIClient()
        login.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "secure-password"},
            format="json",
        )
        device = OwnerTOTPDevice.objects.get(user=self.owner)
        totp_secret = decrypt_owner_totp_secret(device.secret_encrypted)
        challenge_code = _totp_code_for_device_step(totp_secret, device)
        challenge = login.post(
            "/api/auth/owner-2fa/challenge/",
            {"code": challenge_code},
            format="json",
        )
        self.assertEqual(challenge.status_code, 200)
        self.assertEqual(challenge.data["account_mode"], "normal")
        self.assertEqual(challenge.data["workspace_status"], OrganizationStatus.ACTIVE)
