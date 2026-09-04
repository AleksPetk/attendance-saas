"""Security tests for owner account recovery via verified backup email."""

from datetime import timedelta
from unittest.mock import patch

import pyotp
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

from accounts.account_recovery import (
    ACCOUNT_RECOVERY_PUBLIC_MESSAGE,
    OwnerAccountRecoveryChallenge,
    OwnerAccountRecoveryEvent,
    _hash_token,
)
from accounts.customer_two_factor_models import OwnerTOTPDevice
from accounts.owner_auth_provider_models import OwnerAuthProvider, OwnerAuthProviderLink
from accounts.owner_two_factor import decrypt_owner_totp_secret
from accounts.tokens import (
    password_reset_token_generator,
    primary_email_change_token_generator,
)
from accounts.two_factor import TOTP_INTERVAL, current_timestep
from organizations.models import Organization

User = get_user_model()


def uid_for(user):
    return urlsafe_base64_encode(force_bytes(user.pk))


def _totp_code_for_device(device):
    secret = decrypt_owner_totp_secret(device.secret_encrypted)
    totp = pyotp.TOTP(secret, digits=6, interval=TOTP_INTERVAL)
    step = current_timestep()
    if device.last_verified_timestep is not None and device.last_verified_timestep >= step - 1:
        step = int(device.last_verified_timestep) + 1
    return totp.at(step * TOTP_INTERVAL)


class AccountRecoveryBase(TestCase):
    def setUp(self):
        cache.clear()
        self.api = APIClient()
        self.owner = User.objects.create_user(
            email="owner-primary@example.com",
            password="old-password-secure",
        )
        self.owner.mark_email_verified()
        self.owner.backup_email = "owner-backup@example.com"
        self.owner.backup_email_verified_at = timezone.now()
        self.owner.save(update_fields=["backup_email", "backup_email_verified_at"])
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.workspace_id = self.organization.workspace_id

    def _start(self, email="owner-backup@example.com"):
        with patch("accounts.emails.send_account_recovery_email") as send_mail:
            response = self.api.post(
                "/api/auth/recover-account/",
                {"email": email},
                format="json",
            )
        return response, send_mail

    def _latest_challenge(self):
        return (
            OwnerAccountRecoveryChallenge.objects.filter(user=self.owner)
            .order_by("-created_at")
            .first()
        )

    def _raw_token_for(self, challenge, raw_token):
        challenge.token_hash = _hash_token(raw_token)
        challenge.save(update_fields=["token_hash"])
        return raw_token

    def _confirm_with_token(self, client, raw_token):
        return client.post(
            "/api/auth/recover-account/confirm/",
            {"uid": uid_for(self.owner), "token": raw_token},
            format="json",
        )

    def _begin_confirmed_session(self, client=None):
        client = client or self.api
        response, send_mail = self._start()
        self.assertEqual(response.status_code, 200)
        send_mail.assert_called_once()
        challenge = self._latest_challenge()
        raw = "recovery-raw-token-value-aaaaaaaa"
        self._raw_token_for(challenge, raw)
        confirm = self._confirm_with_token(client, raw)
        self.assertEqual(confirm.status_code, 200)
        self.assertEqual(confirm.data["code"], "confirmed")
        return challenge


class AccountRecoveryStartTests(AccountRecoveryBase):
    def test_verified_backup_starts_recovery_with_generic_response(self):
        response, send_mail = self._start()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["detail"], ACCOUNT_RECOVERY_PUBLIC_MESSAGE)
        self.assertNotIn("owner-primary@example.com", str(response.data))
        send_mail.assert_called_once()
        self.assertTrue(
            OwnerAccountRecoveryChallenge.objects.filter(user=self.owner).exists()
        )
        self.assertTrue(
            OwnerAccountRecoveryEvent.objects.filter(
                user=self.owner,
                event_type=OwnerAccountRecoveryEvent.EVENT_STARTED,
            ).exists()
        )

    def test_unverified_pending_backup_cannot_start(self):
        self.owner.backup_email = None
        self.owner.backup_email_verified_at = None
        self.owner.pending_backup_email = "pending-backup@example.com"
        self.owner.save(
            update_fields=[
                "backup_email",
                "backup_email_verified_at",
                "pending_backup_email",
            ]
        )
        response, send_mail = self._start("pending-backup@example.com")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["detail"], ACCOUNT_RECOVERY_PUBLIC_MESSAGE)
        send_mail.assert_not_called()
        self.assertFalse(OwnerAccountRecoveryChallenge.objects.exists())

    def test_backup_set_but_unverified_cannot_start(self):
        self.owner.backup_email_verified_at = None
        self.owner.save(update_fields=["backup_email_verified_at"])
        response, send_mail = self._start()
        self.assertEqual(response.status_code, 200)
        send_mail.assert_not_called()

    def test_unknown_email_same_generic_response(self):
        response, send_mail = self._start("nobody@example.com")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["detail"], ACCOUNT_RECOVERY_PUBLIC_MESSAGE)
        send_mail.assert_not_called()

    def test_staff_workspace_owner_with_verified_backup_can_start(self):
        """Dual-hat owners (is_staff + workspace) must not be silently skipped."""
        self.owner.is_staff = True
        self.owner.save(update_fields=["is_staff"])
        response, send_mail = self._start()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["detail"], ACCOUNT_RECOVERY_PUBLIC_MESSAGE)
        send_mail.assert_called_once()
        self.assertTrue(
            OwnerAccountRecoveryChallenge.objects.filter(user=self.owner).exists()
        )

    def test_staff_without_workspace_cannot_start(self):
        staff_only = User.objects.create_user(
            email="platform-staff@example.com",
            password="secure-password-staff",
        )
        staff_only.is_staff = True
        staff_only.mark_email_verified()
        staff_only.backup_email = "platform-staff-backup@example.com"
        staff_only.backup_email_verified_at = timezone.now()
        staff_only.save(
            update_fields=["is_staff", "backup_email", "backup_email_verified_at"]
        )
        response, send_mail = self._start("platform-staff-backup@example.com")
        self.assertEqual(response.status_code, 200)
        send_mail.assert_not_called()
        self.assertFalse(
            OwnerAccountRecoveryChallenge.objects.filter(user=staff_only).exists()
        )

    def test_backup_email_is_not_login_alias(self):
        login = self.api.post(
            "/api/auth/login/",
            {
                "email": "owner-backup@example.com",
                "password": "old-password-secure",
            },
            format="json",
        )
        self.assertIn(login.status_code, (400, 401))

    @override_settings(ACCOUNT_RECOVERY_EMAIL_LIMIT=2, ACCOUNT_RECOVERY_IP_LIMIT=100)
    def test_rate_limits_stop_further_sends(self):
        for _ in range(2):
            response, send_mail = self._start()
            self.assertEqual(response.status_code, 200)
            send_mail.assert_called_once()

        response, send_mail = self._start()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["detail"], ACCOUNT_RECOVERY_PUBLIC_MESSAGE)
        send_mail.assert_not_called()


class AccountRecoverySessionTests(AccountRecoveryBase):
    def test_expired_recovery_token_rejected(self):
        response, _ = self._start()
        self.assertEqual(response.status_code, 200)
        challenge = self._latest_challenge()
        raw = "expired-token-bbbbbbbbbbbbbbbb"
        self._raw_token_for(challenge, raw)
        challenge.expires_at = timezone.now() - timedelta(minutes=1)
        challenge.save(update_fields=["expires_at"])

        confirm = self._confirm_with_token(self.api, raw)
        self.assertEqual(confirm.status_code, 400)
        self.assertEqual(confirm.data["code"], "token_expired")

    def test_replayed_recovery_token_rejected(self):
        client = APIClient()
        self._begin_confirmed_session(client)
        # Original raw token was burned; inventing the same raw fails.
        replay = self._confirm_with_token(client, "recovery-raw-token-value-aaaaaaaa")
        self.assertEqual(replay.status_code, 400)
        self.assertEqual(replay.data["code"], "token_invalid")

    def test_confirm_does_not_create_authenticated_owner_session(self):
        client = APIClient()
        self._begin_confirmed_session(client)
        me = client.get("/api/auth/account/")
        self.assertIn(me.status_code, (401, 403))
        workspace = client.get("/api/workspace/")
        self.assertIn(workspace.status_code, (401, 403))


class AccountRecoveryTwoFactorTests(AccountRecoveryBase):
    def _enable_2fa(self):
        self.api.force_authenticate(self.owner)
        start = self.api.post(
            "/api/auth/owner-2fa/setup/",
            {"current_password": "old-password-secure"},
            format="json",
        )
        self.assertEqual(start.status_code, 200)
        secret = start.data["setup_key"]
        verify = self.api.post(
            "/api/auth/owner-2fa/setup/verify/",
            {"code": pyotp.TOTP(secret, digits=6, interval=TOTP_INTERVAL).now()},
            format="json",
        )
        self.assertEqual(verify.status_code, 200)
        self.api.force_authenticate(user=None)
        return verify.data.get("recovery_codes") or []

    def test_2fa_required_and_backup_alone_cannot_bypass(self):
        self._enable_2fa()
        client = APIClient()
        self._begin_confirmed_session(client)

        status = client.get("/api/auth/recover-account/status/")
        self.assertEqual(status.data["stage"], "awaiting_two_factor")

        blocked = client.post(
            "/api/auth/recover-account/complete/",
            {
                "email": "new-primary@example.com",
                "password": "brand-new-password-1",
                "password_confirm": "brand-new-password-1",
            },
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.data["code"], "two_factor_required")

        device = OwnerTOTPDevice.objects.get(user=self.owner, confirmed=True)
        ok = client.post(
            "/api/auth/recover-account/2fa/",
            {"code": _totp_code_for_device(device)},
            format="json",
        )
        self.assertEqual(ok.status_code, 200)
        status = client.get("/api/auth/recover-account/status/")
        self.assertEqual(status.data["stage"], "awaiting_credentials")

    def test_recovery_code_satisfies_2fa(self):
        codes = self._enable_2fa()
        self.assertTrue(codes)
        client = APIClient()
        self._begin_confirmed_session(client)
        ok = client.post(
            "/api/auth/recover-account/2fa/",
            {"recovery_code": codes[0]},
            format="json",
        )
        self.assertEqual(ok.status_code, 200)


class AccountRecoveryCompleteTests(AccountRecoveryBase):
    def _finish_to_primary_verify(self, client, *, new_email="new-primary@example.com"):
        self._begin_confirmed_session(client)
        with patch(
            "accounts.emails.send_account_recovery_primary_verification_email"
        ) as send_primary:
            complete = client.post(
                "/api/auth/recover-account/complete/",
                {
                    "email": new_email,
                    "password": "brand-new-password-1",
                    "password_confirm": "brand-new-password-1",
                },
                format="json",
            )
        self.assertEqual(complete.status_code, 200)
        self.assertEqual(complete.data["stage"], "awaiting_primary_verification")
        send_primary.assert_called_once()
        challenge = self._latest_challenge()
        primary_raw = "primary-verify-token-cccccccc"
        challenge.primary_verify_token_hash = _hash_token(primary_raw)
        challenge.save(update_fields=["primary_verify_token_hash"])
        return challenge, primary_raw

    def test_new_primary_collision_rejected(self):
        other = User.objects.create_user(
            email="taken@example.com",
            password="other-password-secure",
        )
        other.mark_email_verified()
        client = APIClient()
        self._begin_confirmed_session(client)
        response = client.post(
            "/api/auth/recover-account/complete/",
            {
                "email": "taken@example.com",
                "password": "brand-new-password-1",
                "password_confirm": "brand-new-password-1",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)

    def test_verified_backup_ownership_blocks_new_primary(self):
        holder = User.objects.create_user(
            email="holder@example.com",
            password="holder-password-secure",
        )
        holder.mark_email_verified()
        holder.backup_email = "shared-backup@example.com"
        holder.backup_email_verified_at = timezone.now()
        holder.save(update_fields=["backup_email", "backup_email_verified_at"])

        client = APIClient()
        self._begin_confirmed_session(client)
        response = client.post(
            "/api/auth/recover-account/complete/",
            {
                "email": "shared-backup@example.com",
                "password": "brand-new-password-1",
                "password_confirm": "brand-new-password-1",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)

    def test_successful_recovery_preserves_user_workspace_oauth_and_requires_login(self):
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-recovery-preserve",
        )
        # Establish an authenticated owner session that must be revoked.
        login_client = APIClient()
        logged_in = login_client.post(
            "/api/auth/login/",
            {
                "email": "owner-primary@example.com",
                "password": "old-password-secure",
            },
            format="json",
        )
        self.assertEqual(logged_in.status_code, 200)
        self.assertEqual(login_client.get("/api/workspace/").status_code, 200)

        stale_reset = password_reset_token_generator.make_token(self.owner)
        self.owner.pending_primary_email = "stale-pending@example.com"
        self.owner.save(update_fields=["pending_primary_email"])
        stale_primary = primary_email_change_token_generator.make_token(self.owner)

        recover_client = APIClient()
        challenge, primary_raw = self._finish_to_primary_verify(recover_client)

        with patch(
            "accounts.emails.send_account_recovery_completed_notice"
        ) as notice:
            done = recover_client.post(
                "/api/auth/recover-account/verify-primary/",
                {"uid": uid_for(self.owner), "token": primary_raw},
                format="json",
            )
        self.assertEqual(done.status_code, 200)
        self.assertEqual(done.data["code"], "completed")
        self.assertGreaterEqual(notice.call_count, 2)

        # Must not auto-login.
        self.assertIn(
            recover_client.get("/api/workspace/").status_code,
            (401, 403),
        )
        self.assertIn(
            recover_client.get("/api/auth/account/").status_code,
            (401, 403),
        )

        self.owner.refresh_from_db()
        self.assertEqual(self.owner.email, "new-primary@example.com")
        self.assertTrue(self.owner.email_verified)
        self.assertIsNone(self.owner.pending_primary_email)
        self.assertEqual(self.owner.backup_email, "owner-backup@example.com")
        self.assertIsNotNone(self.owner.backup_email_verified_at)

        # Same user + workspace.
        self.assertEqual(
            Organization.objects.filter(owner=self.owner).count(),
            1,
        )
        self.assertEqual(
            Organization.objects.get(owner=self.owner).workspace_id,
            self.workspace_id,
        )
        self.assertEqual(User.objects.filter(email="new-primary@example.com").count(), 1)
        self.assertTrue(
            OwnerAuthProviderLink.objects.filter(
                user=self.owner,
                provider=OwnerAuthProvider.GOOGLE,
                provider_subject="google-sub-recovery-preserve",
            ).exists()
        )

        # Old password fails; new password works — but only after normal login.
        old_login = APIClient().post(
            "/api/auth/login/",
            {
                "email": "new-primary@example.com",
                "password": "old-password-secure",
            },
            format="json",
        )
        self.assertIn(old_login.status_code, (400, 401))

        new_login = APIClient().post(
            "/api/auth/login/",
            {
                "email": "new-primary@example.com",
                "password": "brand-new-password-1",
            },
            format="json",
        )
        self.assertEqual(new_login.status_code, 200)

        # Prior owner session revoked.
        self.assertIn(login_client.get("/api/workspace/").status_code, (401, 403))

        # Outstanding password-reset / primary-change tokens invalidated.
        self.owner.refresh_from_db()
        self.assertFalse(
            password_reset_token_generator.check_token(self.owner, stale_reset)
        )
        self.assertEqual(
            primary_email_change_token_generator.inspect(self.owner, stale_primary),
            "invalid",
        )
        challenge.refresh_from_db()
        self.assertIsNotNone(challenge.consumed_at)
        self.assertTrue(
            OwnerAccountRecoveryEvent.objects.filter(
                user=self.owner,
                event_type=OwnerAccountRecoveryEvent.EVENT_COMPLETED,
            ).exists()
        )

    def test_primary_verify_token_replay_rejected(self):
        client = APIClient()
        _, primary_raw = self._finish_to_primary_verify(client)
        with patch("accounts.emails.send_account_recovery_completed_notice"):
            first = client.post(
                "/api/auth/recover-account/verify-primary/",
                {"uid": uid_for(self.owner), "token": primary_raw},
                format="json",
            )
            second = client.post(
                "/api/auth/recover-account/verify-primary/",
                {"uid": uid_for(self.owner), "token": primary_raw},
                format="json",
            )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)
