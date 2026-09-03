import pyotp

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.customer_two_factor_models import OwnerRecoveryCode, OwnerTOTPDevice
from accounts.owner_two_factor import decrypt_owner_totp_secret
from accounts.two_factor import (
    TOTP_INTERVAL,
    hash_recovery_code,
    current_timestep,
)
from accounts.two_factor import verify_totp_code  # noqa: F401 (debug helper)
from accounts.two_factor import build_totp  # noqa: F401 (debug helper)
from organizations.models import Organization


User = get_user_model()


def _totp_code(secret):
    totp = pyotp.TOTP(secret, digits=6, interval=TOTP_INTERVAL)
    return totp.now()


def _totp_code_for_step(secret, *, step):
    totp = pyotp.TOTP(secret, digits=6, interval=TOTP_INTERVAL)
    return totp.at(step * TOTP_INTERVAL)


def _totp_code_for_device_step(secret, device):
    """
    Ensure we never reuse the same authenticator window that was just
    successfully verified.

    The production implementation rejects replays from the last verified
    timestep.
    """
    step = current_timestep()
    if device.last_verified_timestep is not None:
        if device.last_verified_timestep >= step - 1:
            step = int(device.last_verified_timestep) + 1
    return _totp_code_for_step(secret, step=step)


class OwnerTwoFactorSetupTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.owner = User.objects.create_user(email="owner@example.com", password="secure-password")
        self.owner.mark_email_verified()
        self.organization = Organization.objects.create_with_owner(owner=self.owner)

    def _start_setup(self, *, password="secure-password"):
        self.api.force_authenticate(self.owner)
        return self.api.post(
            "/api/auth/owner-2fa/setup/",
            {"current_password": password},
            format="json",
        )

    def test_owner_can_start_setup_with_correct_password(self):
        resp = self._start_setup()
        self.assertEqual(resp.status_code, 200)
        self.assertIn("qr_data_uri", resp.data)
        self.assertIn("setup_key", resp.data)
        self.assertEqual(OwnerTOTPDevice.objects.filter(user=self.owner).count(), 1)
        device = OwnerTOTPDevice.objects.get(user=self.owner)
        self.assertFalse(device.confirmed)

    def test_wrong_password_rejected(self):
        resp = self._start_setup(password="wrong-password")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("current_password", resp.data)
        self.assertFalse(OwnerTOTPDevice.objects.filter(user=self.owner).exists())

    def test_qr_pending_secret_does_not_enable_2fa(self):
        start = self._start_setup()
        secret = start.data["setup_key"]

        # Login should work password-only because setup isn't confirmed.
        login = APIClient().post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "secure-password"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.data["account_kind"], "owner")

        account = self.api.get("/api/auth/account/")
        self.assertEqual(account.status_code, 200)
        self.assertEqual(account.data["two_factor_status"], "not_enabled")

        # Setup record exists but is not confirmed.
        device = OwnerTOTPDevice.objects.get(user=self.owner)
        self.assertFalse(device.confirmed)

        # Verifying wrong code does not enable.
        verify = self.api.post(
            "/api/auth/owner-2fa/setup/verify/",
            {"code": "000000"},
            format="json",
        )
        self.assertEqual(verify.status_code, 400)
        device.refresh_from_db()
        self.assertFalse(device.confirmed)

        # Now verify with the correct code to enable.
        verify_ok = self.api.post(
            "/api/auth/owner-2fa/setup/verify/",
            {"code": _totp_code(secret)},
            format="json",
        )
        self.assertEqual(verify_ok.status_code, 200)
        device.refresh_from_db()
        self.assertTrue(device.confirmed)
        self.assertGreater(OwnerRecoveryCode.objects.filter(user=self.owner).count(), 0)

    def test_valid_first_totp_enables_2fa_and_generates_recovery_codes_hashed(self):
        start = self._start_setup()
        secret = start.data["setup_key"]

        verify_ok = self.api.post(
            "/api/auth/owner-2fa/setup/verify/",
            {"code": _totp_code(secret)},
            format="json",
        )
        self.assertEqual(verify_ok.status_code, 200)
        self.assertEqual(verify_ok.data["two_factor_status"], "enabled")

        device = OwnerTOTPDevice.objects.get(user=self.owner)
        self.assertTrue(device.confirmed)

        recovery_codes = verify_ok.data["recovery_codes"]
        self.assertEqual(len(recovery_codes), 10)

        # Only hashed values should exist in the DB.
        for code in recovery_codes:
            self.assertTrue(
                OwnerRecoveryCode.objects.filter(
                    user=self.owner, code_hash=hash_recovery_code(code)
                ).exists()
            )

    def test_invalid_totp_does_not_enable(self):
        start = self._start_setup()
        verify = self.api.post(
            "/api/auth/owner-2fa/setup/verify/",
            {"code": "000000"},
            format="json",
        )
        self.assertEqual(verify.status_code, 400)
        device = OwnerTOTPDevice.objects.get(user=self.owner)
        self.assertFalse(device.confirmed)
        self.assertEqual(OwnerRecoveryCode.objects.filter(user=self.owner).count(), 0)

    def test_pending_setup_can_be_restarted_safely(self):
        start1 = self._start_setup()
        secret1 = start1.data["setup_key"]

        # Restart setup; secret must change.
        start2 = self._start_setup()
        secret2 = start2.data["setup_key"]
        self.assertNotEqual(secret1, secret2)

        # Codes from the first secret must no longer work.
        verify_wrong = self.api.post(
            "/api/auth/owner-2fa/setup/verify/",
            {"code": _totp_code(secret1)},
            format="json",
        )
        self.assertEqual(verify_wrong.status_code, 400)
        device = OwnerTOTPDevice.objects.get(user=self.owner)
        self.assertFalse(device.confirmed)

        # The latest secret works.
        verify_ok = self.api.post(
            "/api/auth/owner-2fa/setup/verify/",
            {"code": _totp_code(secret2)},
            format="json",
        )
        self.assertEqual(verify_ok.status_code, 200)
        device.refresh_from_db()
        self.assertTrue(device.confirmed)


class OwnerTwoFactorLoginTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.owner = User.objects.create_user(email="owner@example.com", password="secure-password")
        self.owner.mark_email_verified()
        Organization.objects.create_with_owner(owner=self.owner)

        # Enable 2FA through API so we have a real device + recovery codes.
        self.api.force_authenticate(self.owner)
        start = self.api.post(
            "/api/auth/owner-2fa/setup/",
            {"current_password": "secure-password"},
            format="json",
        )
        secret = start.data["setup_key"]
        verify = self.api.post(
            "/api/auth/owner-2fa/setup/verify/",
            {"code": _totp_code(secret)},
            format="json",
        )
        self.assertEqual(verify.status_code, 200)
        self.recovery_codes = verify.data["recovery_codes"]
        device = OwnerTOTPDevice.objects.get(user=self.owner)
        self.secret = decrypt_owner_totp_secret(device.secret_encrypted)

    def test_owner_without_2fa_logs_in_normally(self):
        other = User.objects.create_user(email="other@example.com", password="secure-password")
        other.mark_email_verified()
        Organization.objects.create_with_owner(owner=other)
        login = APIClient().post(
            "/api/auth/login/",
            {"email": other.email, "password": "secure-password"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.data["account_kind"], "owner")

    def test_owner_with_2fa_requires_second_factor_before_workspace_access(self):
        login = APIClient()
        resp = login.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "secure-password"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["code"], "two_factor_required")

        # Must not have access without completing the challenge.
        workspace = login.get("/api/workspace/")
        self.assertNotEqual(workspace.status_code, 200)

        device = OwnerTOTPDevice.objects.get(user=self.owner)
        challenge = login.post(
            "/api/auth/owner-2fa/challenge/",
            {"code": _totp_code_for_device_step(self.secret, device)},
            format="json",
        )
        self.assertEqual(challenge.status_code, 200)
        self.assertEqual(challenge.data["account_kind"], "owner")

    def test_invalid_totp_rejected(self):
        login = APIClient()
        resp = login.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "secure-password"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

        bad = login.post(
            "/api/auth/owner-2fa/challenge/",
            {"code": "000000"},
            format="json",
        )
        self.assertEqual(bad.status_code, 400)

    def test_valid_recovery_code_completes_login_and_cannot_be_reused(self):
        login = APIClient()
        resp = login.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "secure-password"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

        accepted = login.post(
            "/api/auth/owner-2fa/challenge/",
            {"recovery_code": self.recovery_codes[0]},
            format="json",
        )
        self.assertEqual(accepted.status_code, 200)

        # Log out and try to reuse the same recovery code.
        login.post("/api/auth/logout/", {}, format="json")

        resp2 = login.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "secure-password"},
            format="json",
        )
        self.assertEqual(resp2.status_code, 403)

        reused = login.post(
            "/api/auth/owner-2fa/challenge/",
            {"recovery_code": self.recovery_codes[0]},
            format="json",
        )
        self.assertEqual(reused.status_code, 400)

    def test_rate_limiting_locks_challenge_after_repeated_failures(self):
        login = APIClient()
        resp = login.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "secure-password"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

        for _ in range(5):
            r = login.post(
                "/api/auth/owner-2fa/challenge/",
                {"code": "000000"},
                format="json",
            )
            self.assertIn(r.status_code, {400, 429})

        device = OwnerTOTPDevice.objects.get(user=self.owner)
        locked = login.post(
            "/api/auth/owner-2fa/challenge/",
            {"code": _totp_code_for_device_step(self.secret, device)},
            format="json",
        )
        self.assertEqual(locked.status_code, 429)


class OwnerTwoFactorManagementTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.owner = User.objects.create_user(email="owner@example.com", password="secure-password")
        self.owner.mark_email_verified()
        Organization.objects.create_with_owner(owner=self.owner)

        self.api.force_authenticate(self.owner)
        start = self.api.post(
            "/api/auth/owner-2fa/setup/",
            {"current_password": "secure-password"},
            format="json",
        )
        secret = start.data["setup_key"]
        verify = self.api.post(
            "/api/auth/owner-2fa/setup/verify/",
            {"code": _totp_code(secret)},
            format="json",
        )
        self.assertEqual(verify.status_code, 200)
        self.recovery_codes = verify.data["recovery_codes"]
        device = OwnerTOTPDevice.objects.get(user=self.owner)
        self.secret = decrypt_owner_totp_secret(device.secret_encrypted)

    def test_disable_requires_password_and_valid_second_factor(self):
        self.api.force_authenticate(self.owner)
        device = OwnerTOTPDevice.objects.get(user=self.owner)
        bad_pw = self.api.post(
            "/api/auth/owner-2fa/disable/",
            {"current_password": "wrong-password", "code": _totp_code_for_device_step(self.secret, device)},
            format="json",
        )
        self.assertEqual(bad_pw.status_code, 400)

        bad_code = self.api.post(
            "/api/auth/owner-2fa/disable/",
            {"current_password": "secure-password", "code": "000000"},
            format="json",
        )
        self.assertEqual(bad_code.status_code, 400)

        device = OwnerTOTPDevice.objects.get(user=self.owner)
        ok = self.api.post(
            "/api/auth/owner-2fa/disable/",
            {"current_password": "secure-password", "code": _totp_code_for_device_step(self.secret, device)},
            format="json",
        )
        self.assertEqual(ok.status_code, 200)
        self.assertFalse(OwnerTOTPDevice.objects.filter(user=self.owner).exists())
        self.assertEqual(OwnerRecoveryCode.objects.filter(user=self.owner).count(), 0)

    def test_regenerate_invalidates_old_recovery_codes(self):
        old_codes = list(self.recovery_codes)
        old_hashes = [hash_recovery_code(c) for c in old_codes]

        device = OwnerTOTPDevice.objects.get(user=self.owner)
        ok = self.api.post(
            "/api/auth/owner-2fa/recovery-codes/regenerate/",
            {
                "current_password": "secure-password",
                "code": _totp_code_for_device_step(self.secret, device),
            },
            format="json",
        )
        self.assertEqual(ok.status_code, 200)
        self.assertIn("recovery_codes", ok.data)
        new_codes = ok.data["recovery_codes"]
        self.assertEqual(len(new_codes), 10)
        self.assertTrue(set(new_codes).isdisjoint(set(old_codes)))

        # Old hashes must no longer be present.
        self.assertFalse(
            OwnerRecoveryCode.objects.filter(user=self.owner, code_hash__in=old_hashes).exists()
        )

