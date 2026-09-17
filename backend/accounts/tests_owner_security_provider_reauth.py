"""Provider re-auth parity for owner Security actions (2FA + set password)."""

from datetime import timedelta

import pyotp
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.customer_two_factor_models import OwnerRecoveryCode, OwnerTOTPDevice
from accounts.owner_auth_provider_models import OwnerAuthProvider, OwnerAuthProviderLink
from accounts.owner_sensitive_auth import (
    OWNER_OAUTH_REAUTH_SESSION_KEY,
    OWNER_OAUTH_REAUTH_TTL_SECONDS,
    record_owner_oauth_reauth,
)
from accounts.owner_two_factor import decrypt_owner_totp_secret
from accounts.two_factor import TOTP_INTERVAL, current_timestep
from organizations.models import Organization

User = get_user_model()


def _totp_code_for_step(secret, *, step):
    return pyotp.TOTP(secret, digits=6, interval=TOTP_INTERVAL).at(step * TOTP_INTERVAL)


def _totp_code_for_device_step(secret, device):
    step = current_timestep()
    if device.last_verified_timestep is not None and device.last_verified_timestep >= step - 1:
        step = int(device.last_verified_timestep) + 1
    return _totp_code_for_step(secret, step=step)


def create_password_owner(email="sec-pw@example.com", *, password="secure-password"):
    user = User.objects.create_user(email=email, password=password)
    user.mark_email_verified()
    Organization.objects.create_with_owner(owner=user)
    return user, password


def create_provider_only_owner(*, provider, email, subject):
    user = User.objects.create_user(email=email, password="temporary-password")
    user.set_unusable_password()
    user.save(update_fields=["password"])
    user.mark_email_verified()
    Organization.objects.create_with_owner(owner=user)
    OwnerAuthProviderLink.objects.create(
        user=user,
        provider=provider,
        provider_subject=subject,
        provider_email=email,
    )
    return user


def record_reauth(client, user, provider):
    session = client.session
    session[OWNER_OAUTH_REAUTH_SESSION_KEY] = {
        "user_id": user.pk,
        "provider": provider,
        "verified_at": timezone.now().isoformat(),
    }
    session.save()


class ProviderOnlyTwoFactorSetupTests(TestCase):
    def setUp(self):
        self.apple_owner = create_provider_only_owner(
            provider=OwnerAuthProvider.APPLE,
            email="apple-2fa@example.com",
            subject="apple-sub-2fa-setup",
        )
        self.google_owner = create_provider_only_owner(
            provider=OwnerAuthProvider.GOOGLE,
            email="google-2fa@example.com",
            subject="google-sub-2fa-setup",
        )
        self.apple_client = Client()
        self.apple_client.force_login(self.apple_owner)
        self.google_client = Client()
        self.google_client.force_login(self.google_owner)

    def test_apple_only_owner_can_enable_2fa_after_apple_reverify(self):
        record_reauth(self.apple_client, self.apple_owner, OwnerAuthProvider.APPLE)
        start = self.apple_client.post(
            "/api/auth/owner-2fa/setup/",
            data={},
            content_type="application/json",
        )
        self.assertEqual(start.status_code, 200, start.content)
        secret = start.json()["setup_key"]
        verify = self.apple_client.post(
            "/api/auth/owner-2fa/setup/verify/",
            data={"code": pyotp.TOTP(secret, interval=TOTP_INTERVAL).now()},
            content_type="application/json",
        )
        self.assertEqual(verify.status_code, 200, verify.content)
        self.assertEqual(verify.json()["two_factor_status"], "enabled")
        self.assertTrue(
            OwnerTOTPDevice.objects.filter(user=self.apple_owner, confirmed=True).exists()
        )

    def test_google_only_owner_can_enable_2fa_after_google_reverify(self):
        record_reauth(self.google_client, self.google_owner, OwnerAuthProvider.GOOGLE)
        start = self.google_client.post(
            "/api/auth/owner-2fa/setup/",
            data={},
            content_type="application/json",
        )
        self.assertEqual(start.status_code, 200, start.content)
        secret = start.json()["setup_key"]
        verify = self.google_client.post(
            "/api/auth/owner-2fa/setup/verify/",
            data={"code": pyotp.TOTP(secret, interval=TOTP_INTERVAL).now()},
            content_type="application/json",
        )
        self.assertEqual(verify.status_code, 200, verify.content)
        self.assertEqual(verify.json()["two_factor_status"], "enabled")

    def test_provider_only_owner_cannot_enable_2fa_without_recent_reverify(self):
        response = self.apple_client.post(
            "/api/auth/owner-2fa/setup/",
            data={},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "oauth_reauth_required")
        self.assertFalse(OwnerTOTPDevice.objects.filter(user=self.apple_owner).exists())

    def test_expired_reverify_rejected_for_2fa_setup(self):
        session = self.apple_client.session
        session[OWNER_OAUTH_REAUTH_SESSION_KEY] = {
            "user_id": self.apple_owner.pk,
            "provider": OwnerAuthProvider.APPLE,
            "verified_at": (
                timezone.now() - timedelta(seconds=OWNER_OAUTH_REAUTH_TTL_SECONDS + 1)
            ).isoformat(),
        }
        session.save()
        response = self.apple_client.post(
            "/api/auth/owner-2fa/setup/",
            data={},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "oauth_reauth_required")

    def test_unlinked_provider_reauth_marker_rejected(self):
        # Session claims Google reauth, but this owner only has Apple linked.
        session = self.apple_client.session
        session[OWNER_OAUTH_REAUTH_SESSION_KEY] = {
            "user_id": self.apple_owner.pk,
            "provider": OwnerAuthProvider.GOOGLE,
            "verified_at": timezone.now().isoformat(),
        }
        session.save()
        response = self.apple_client.post(
            "/api/auth/owner-2fa/setup/",
            data={},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "oauth_reauth_required")

    def test_wrong_user_reauth_marker_rejected(self):
        session = self.apple_client.session
        session[OWNER_OAUTH_REAUTH_SESSION_KEY] = {
            "user_id": self.google_owner.pk,
            "provider": OwnerAuthProvider.APPLE,
            "verified_at": timezone.now().isoformat(),
        }
        session.save()
        response = self.apple_client.post(
            "/api/auth/owner-2fa/setup/",
            data={},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "oauth_reauth_required")


class ProviderOnlyTwoFactorManageTests(TestCase):
    def setUp(self):
        self.owner = create_provider_only_owner(
            provider=OwnerAuthProvider.APPLE,
            email="apple-manage-2fa@example.com",
            subject="apple-sub-2fa-manage",
        )
        self.client = Client()
        self.client.force_login(self.owner)
        record_reauth(self.client, self.owner, OwnerAuthProvider.APPLE)
        start = self.client.post(
            "/api/auth/owner-2fa/setup/",
            data={},
            content_type="application/json",
        )
        secret = start.json()["setup_key"]
        verify = self.client.post(
            "/api/auth/owner-2fa/setup/verify/",
            data={"code": pyotp.TOTP(secret, interval=TOTP_INTERVAL).now()},
            content_type="application/json",
        )
        self.recovery_codes = verify.json()["recovery_codes"]
        device = OwnerTOTPDevice.objects.get(user=self.owner, confirmed=True)
        self.secret = decrypt_owner_totp_secret(device.secret_encrypted)

    def test_apple_only_owner_can_disable_2fa_after_fresh_apple_reverify(self):
        record_reauth(self.client, self.owner, OwnerAuthProvider.APPLE)
        device = OwnerTOTPDevice.objects.get(user=self.owner)
        response = self.client.post(
            "/api/auth/owner-2fa/disable/",
            data={
                "code": _totp_code_for_device_step(self.secret, device),
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["two_factor_status"], "not_enabled")
        self.assertFalse(OwnerTOTPDevice.objects.filter(user=self.owner).exists())

    def test_google_only_owner_can_disable_2fa_after_google_reverify(self):
        google_owner = create_provider_only_owner(
            provider=OwnerAuthProvider.GOOGLE,
            email="google-manage-2fa@example.com",
            subject="google-sub-2fa-manage",
        )
        client = Client()
        client.force_login(google_owner)
        record_reauth(client, google_owner, OwnerAuthProvider.GOOGLE)
        start = client.post(
            "/api/auth/owner-2fa/setup/",
            data={},
            content_type="application/json",
        )
        secret = start.json()["setup_key"]
        client.post(
            "/api/auth/owner-2fa/setup/verify/",
            data={"code": pyotp.TOTP(secret, interval=TOTP_INTERVAL).now()},
            content_type="application/json",
        )
        device = OwnerTOTPDevice.objects.get(user=google_owner, confirmed=True)
        plaintext = decrypt_owner_totp_secret(device.secret_encrypted)
        record_reauth(client, google_owner, OwnerAuthProvider.GOOGLE)
        response = client.post(
            "/api/auth/owner-2fa/disable/",
            data={"code": _totp_code_for_device_step(plaintext, device)},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(OwnerTOTPDevice.objects.filter(user=google_owner).exists())

    def test_recovery_code_regenerate_accepts_provider_reverify(self):
        record_reauth(self.client, self.owner, OwnerAuthProvider.APPLE)
        device = OwnerTOTPDevice.objects.get(user=self.owner)
        old_codes = list(self.recovery_codes)
        response = self.client.post(
            "/api/auth/owner-2fa/recovery-codes/regenerate/",
            data={"code": _totp_code_for_device_step(self.secret, device)},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        new_codes = response.json()["recovery_codes"]
        self.assertEqual(len(new_codes), 10)
        self.assertTrue(set(new_codes).isdisjoint(set(old_codes)))
        self.assertEqual(OwnerRecoveryCode.objects.filter(user=self.owner).count(), 10)

    def test_disable_without_fresh_reverify_rejected(self):
        session = self.client.session
        session.pop(OWNER_OAUTH_REAUTH_SESSION_KEY, None)
        session.save()
        device = OwnerTOTPDevice.objects.get(user=self.owner)
        response = self.client.post(
            "/api/auth/owner-2fa/disable/",
            data={"code": _totp_code_for_device_step(self.secret, device)},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "oauth_reauth_required")
        self.assertTrue(OwnerTOTPDevice.objects.filter(user=self.owner, confirmed=True).exists())


class ProviderOnlySetPasswordTests(TestCase):
    def setUp(self):
        self.apple_owner = create_provider_only_owner(
            provider=OwnerAuthProvider.APPLE,
            email="apple-setpw@example.com",
            subject="apple-sub-setpw",
        )
        self.google_owner = create_provider_only_owner(
            provider=OwnerAuthProvider.GOOGLE,
            email="google-setpw@example.com",
            subject="google-sub-setpw",
        )
        self.apple_client = Client()
        self.apple_client.force_login(self.apple_owner)
        self.google_client = Client()
        self.google_client.force_login(self.google_owner)

    def test_apple_only_owner_can_set_password_after_apple_reverify(self):
        record_reauth(self.apple_client, self.apple_owner, OwnerAuthProvider.APPLE)
        response = self.apple_client.post(
            "/api/auth/set-password/",
            data={
                "new_password": "brand-new-password-9",
                "new_password_confirm": "brand-new-password-9",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.apple_owner.refresh_from_db()
        self.assertTrue(self.apple_owner.has_usable_password())
        self.assertTrue(
            OwnerAuthProviderLink.objects.filter(
                user=self.apple_owner,
                provider=OwnerAuthProvider.APPLE,
            ).exists()
        )
        self.assertTrue(response.json()["sign_in_methods"]["password"]["enabled"])
        self.assertTrue(response.json()["sign_in_methods"]["apple"]["linked"])

    def test_google_only_owner_can_set_password_after_google_reverify(self):
        record_reauth(self.google_client, self.google_owner, OwnerAuthProvider.GOOGLE)
        response = self.google_client.post(
            "/api/auth/set-password/",
            data={
                "new_password": "brand-new-password-9",
                "new_password_confirm": "brand-new-password-9",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(
            OwnerAuthProviderLink.objects.filter(
                user=self.google_owner,
                provider=OwnerAuthProvider.GOOGLE,
            ).exists()
        )

    def test_set_password_with_2fa_still_requires_provider_reverify(self):
        record_reauth(self.apple_client, self.apple_owner, OwnerAuthProvider.APPLE)
        start = self.apple_client.post(
            "/api/auth/owner-2fa/setup/",
            data={},
            content_type="application/json",
        )
        secret = start.json()["setup_key"]
        self.apple_client.post(
            "/api/auth/owner-2fa/setup/verify/",
            data={"code": pyotp.TOTP(secret, interval=TOTP_INTERVAL).now()},
            content_type="application/json",
        )
        device = OwnerTOTPDevice.objects.get(user=self.apple_owner, confirmed=True)
        plaintext = decrypt_owner_totp_secret(device.secret_encrypted)

        # No fresh oauth marker.
        session = self.apple_client.session
        session.pop(OWNER_OAUTH_REAUTH_SESSION_KEY, None)
        session.save()
        blocked = self.apple_client.post(
            "/api/auth/set-password/",
            data={
                "new_password": "brand-new-password-9",
                "new_password_confirm": "brand-new-password-9",
                "code": _totp_code_for_device_step(plaintext, device),
            },
            content_type="application/json",
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.json()["code"], "oauth_reauth_required")

        record_reauth(self.apple_client, self.apple_owner, OwnerAuthProvider.APPLE)
        device = OwnerTOTPDevice.objects.get(user=self.apple_owner)
        ok = self.apple_client.post(
            "/api/auth/set-password/",
            data={
                "new_password": "brand-new-password-9",
                "new_password_confirm": "brand-new-password-9",
                "code": _totp_code_for_device_step(plaintext, device),
            },
            content_type="application/json",
        )
        self.assertEqual(ok.status_code, 200, ok.content)


class PasswordOwnerSecurityUnchangedTests(TestCase):
    def setUp(self):
        self.owner, self.password = create_password_owner()
        self.api = APIClient()
        self.api.force_authenticate(self.owner)

    def test_password_owner_2fa_setup_still_works(self):
        start = self.api.post(
            "/api/auth/owner-2fa/setup/",
            {"current_password": self.password},
            format="json",
        )
        self.assertEqual(start.status_code, 200)
        secret = start.data["setup_key"]
        verify = self.api.post(
            "/api/auth/owner-2fa/setup/verify/",
            {"code": pyotp.TOTP(secret, interval=TOTP_INTERVAL).now()},
            format="json",
        )
        self.assertEqual(verify.status_code, 200)

    def test_password_owner_change_password_path_unchanged(self):
        response = self.api.post(
            "/api/auth/change-password/",
            {
                "current_password": self.password,
                "new_password": "replacement-password-9",
                "new_password_confirm": "replacement-password-9",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.check_password("replacement-password-9"))


class LogoutClearsProviderReauthTests(TestCase):
    def test_logout_clears_provider_reverify_state(self):
        owner = create_provider_only_owner(
            provider=OwnerAuthProvider.APPLE,
            email="logout-reauth@example.com",
            subject="apple-sub-logout",
        )
        client = Client()
        client.force_login(owner)
        session = client.session
        request = type("R", (), {"session": session})()
        record_owner_oauth_reauth(request, owner, OwnerAuthProvider.APPLE)
        session.save()
        self.assertIn(OWNER_OAUTH_REAUTH_SESSION_KEY, client.session)

        response = client.post("/api/auth/logout/", {}, content_type="application/json")
        self.assertEqual(response.status_code, 204)
        self.assertNotIn(OWNER_OAUTH_REAUTH_SESSION_KEY, client.session)
