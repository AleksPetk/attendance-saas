"""Tests for one-time at-rest secret re-encryption."""

import os

from cryptography.fernet import Fernet
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from accounts.customer_two_factor_models import OwnerRecoveryCode, OwnerTOTPDevice
from accounts.two_factor import (
    encrypt_totp_secret,
    generate_totp_secret,
    hash_recovery_code,
)
from accounts.two_factor_models import PlatformRecoveryCode, PlatformTOTPDevice
from core.crypto import decrypt_secret, encrypt_secret
from core.reencrypt_at_rest import (
    TARGET_APP_ENV,
    TARGET_PLATFORM_ENV,
    ReencryptError,
    assert_can_decrypt_with_key,
    current_app_secrets_key_bytes,
    current_platform_2fa_key_bytes,
    generate_fernet_key,
    reencrypt_at_rest_secrets,
)
from groups.email_sender_models import GroupEmailSender
from groups.models import Group
from organizations.models import Organization

User = get_user_model()

SOURCE_APP = generate_fernet_key()
SOURCE_PLATFORM = generate_fernet_key()
TARGET_APP = generate_fernet_key()
TARGET_PLATFORM = generate_fernet_key()


@override_settings(
    DEBUG=True,
    APP_SECRETS_ENCRYPTION_KEY=SOURCE_APP,
    PLATFORM_2FA_ENCRYPTION_KEY=SOURCE_PLATFORM,
)
class ReencryptAtRestSecretsTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner-reencrypt@example.com",
            password="owner-pass-not-printed",
        )
        self.platform = User.objects.create_superuser(
            email="platform-reencrypt@example.com",
            password="platform-pass-not-printed",
        )
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.group = Group.objects.create(
            organization=self.org,
            name="Reencrypt Group",
        )

        self.owner_secret = generate_totp_secret()
        OwnerTOTPDevice.objects.create(
            user=self.owner,
            secret_encrypted=encrypt_secret(self.owner_secret),
            confirmed=True,
        )
        OwnerRecoveryCode.objects.create(
            user=self.owner,
            code_hash=hash_recovery_code("AAAA-BBBB"),
        )

        self.platform_secret = generate_totp_secret()
        PlatformTOTPDevice.objects.create(
            user=self.platform,
            secret_encrypted=encrypt_totp_secret(self.platform_secret),
            confirmed=True,
        )
        PlatformRecoveryCode.objects.create(
            user=self.platform,
            code_hash=hash_recovery_code("CCCC-DDDD"),
        )

        self.sender = GroupEmailSender.objects.create(
            organization=self.org,
            group=self.group,
            provider="custom_smtp",
            from_email="noreply@example.com",
            smtp_host="smtp.example.com",
            smtp_port=587,
            smtp_username="mailer",
            smtp_password_encrypted=encrypt_secret("smtp-secret-value"),
        )

        self.password_before = self.owner.password
        self.target_env = {
            TARGET_APP_ENV: TARGET_APP,
            TARGET_PLATFORM_ENV: TARGET_PLATFORM,
        }

    def test_dry_run_does_not_write_and_reports_unportable_recovery_codes(self):
        before_smtp = self.sender.smtp_password_encrypted
        before_owner = OwnerTOTPDevice.objects.get().secret_encrypted
        before_platform = PlatformTOTPDevice.objects.get().secret_encrypted

        report = reencrypt_at_rest_secrets(
            dry_run=True,
            clear_unportable_recovery_codes=True,
            environ=self.target_env,
        )

        self.sender.refresh_from_db()
        self.assertEqual(self.sender.smtp_password_encrypted, before_smtp)
        self.assertEqual(
            OwnerTOTPDevice.objects.get().secret_encrypted, before_owner
        )
        self.assertEqual(
            PlatformTOTPDevice.objects.get().secret_encrypted, before_platform
        )
        self.assertEqual(report.smtp_passwords_reencrypted, 1)
        self.assertEqual(report.owner_totp_reencrypted, 1)
        self.assertEqual(report.platform_totp_reencrypted, 1)
        self.assertEqual(report.owner_recovery_codes_unportable, 1)
        self.assertEqual(report.platform_recovery_codes_unportable, 1)
        self.assertEqual(report.recovery_codes_cleared, 0)
        self.assertEqual(OwnerRecoveryCode.objects.count(), 1)
        self.assertEqual(PlatformRecoveryCode.objects.count(), 1)

    def test_apply_reencrypts_and_old_keys_fail(self):
        source_app = current_app_secrets_key_bytes()
        source_platform = current_platform_2fa_key_bytes()

        report = reencrypt_at_rest_secrets(
            dry_run=False,
            clear_unportable_recovery_codes=True,
            environ=self.target_env,
        )
        self.assertEqual(report.smtp_passwords_reencrypted, 1)
        self.assertEqual(report.owner_totp_reencrypted, 1)
        self.assertEqual(report.platform_totp_reencrypted, 1)
        self.assertEqual(report.recovery_codes_cleared, 2)
        self.assertEqual(OwnerRecoveryCode.objects.count(), 0)
        self.assertEqual(PlatformRecoveryCode.objects.count(), 0)

        self.sender.refresh_from_db()
        owner_device = OwnerTOTPDevice.objects.get()
        platform_device = PlatformTOTPDevice.objects.get()

        self.assertTrue(
            assert_can_decrypt_with_key(
                self.sender.smtp_password_encrypted, TARGET_APP.encode()
            )
        )
        self.assertTrue(
            assert_can_decrypt_with_key(
                owner_device.secret_encrypted, TARGET_APP.encode()
            )
        )
        self.assertTrue(
            assert_can_decrypt_with_key(
                platform_device.secret_encrypted, TARGET_PLATFORM.encode()
            )
        )
        self.assertFalse(
            assert_can_decrypt_with_key(
                self.sender.smtp_password_encrypted, source_app
            )
        )
        self.assertFalse(
            assert_can_decrypt_with_key(owner_device.secret_encrypted, source_app)
        )
        self.assertFalse(
            assert_can_decrypt_with_key(
                platform_device.secret_encrypted, source_platform
            )
        )

        self.assertEqual(
            Fernet(TARGET_APP.encode()).decrypt(
                self.sender.smtp_password_encrypted.encode("ascii")
            ),
            b"smtp-secret-value",
        )
        self.assertEqual(
            Fernet(TARGET_APP.encode())
            .decrypt(owner_device.secret_encrypted.encode("ascii"))
            .decode("utf-8"),
            self.owner_secret,
        )
        self.assertEqual(
            Fernet(TARGET_PLATFORM.encode())
            .decrypt(platform_device.secret_encrypted.encode("ascii"))
            .decode("utf-8"),
            self.platform_secret,
        )

        self.owner.refresh_from_db()
        self.assertEqual(self.owner.password, self.password_before)
        self.assertEqual(User.objects.count(), 2)
        self.assertEqual(GroupEmailSender.objects.count(), 1)
        self.assertEqual(OwnerTOTPDevice.objects.count(), 1)
        self.assertEqual(PlatformTOTPDevice.objects.count(), 1)

    def test_owner_totp_legacy_platform_ciphertext_moves_to_target_app_key(self):
        """Local owner TOTP may historically decrypt only with platform key."""
        device = OwnerTOTPDevice.objects.get()
        device.secret_encrypted = encrypt_totp_secret(self.owner_secret)
        device.save(update_fields=["secret_encrypted"])
        self.assertFalse(
            assert_can_decrypt_with_key(
                device.secret_encrypted, current_app_secrets_key_bytes()
            )
        )
        self.assertTrue(
            assert_can_decrypt_with_key(
                device.secret_encrypted, current_platform_2fa_key_bytes()
            )
        )

        report = reencrypt_at_rest_secrets(
            dry_run=False,
            clear_unportable_recovery_codes=False,
            environ=self.target_env,
        )
        self.assertEqual(report.owner_totp_legacy_platform_source, 1)
        device.refresh_from_db()
        self.assertTrue(
            assert_can_decrypt_with_key(
                device.secret_encrypted, TARGET_APP.encode()
            )
        )
        self.assertFalse(
            assert_can_decrypt_with_key(
                device.secret_encrypted, current_platform_2fa_key_bytes()
            )
        )
        self.assertEqual(OwnerRecoveryCode.objects.count(), 1)

    def test_fails_safely_when_row_cannot_decrypt(self):
        self.sender.smtp_password_encrypted = (
            Fernet(generate_fernet_key().encode())
            .encrypt(b"orphan")
            .decode("ascii")
        )
        self.sender.save(update_fields=["smtp_password_encrypted"])
        before = self.sender.smtp_password_encrypted

        with self.assertRaises(ReencryptError):
            reencrypt_at_rest_secrets(dry_run=False, environ=self.target_env)

        self.sender.refresh_from_db()
        self.assertEqual(self.sender.smtp_password_encrypted, before)
        self.assertTrue(
            assert_can_decrypt_with_key(
                OwnerTOTPDevice.objects.get().secret_encrypted,
                current_app_secrets_key_bytes(),
            )
        )

    def test_refuses_same_target_key(self):
        bad_env = {
            TARGET_APP_ENV: SOURCE_APP,
            TARGET_PLATFORM_ENV: TARGET_PLATFORM,
        }
        with self.assertRaises(ReencryptError):
            reencrypt_at_rest_secrets(dry_run=True, environ=bad_env)

    def test_management_command_requires_yes_to_apply(self):
        with self.assertRaises(CommandError):
            call_command("reencrypt_at_rest_secrets")

    def test_management_command_dry_run(self):
        previous = {
            TARGET_APP_ENV: os.environ.get(TARGET_APP_ENV),
            TARGET_PLATFORM_ENV: os.environ.get(TARGET_PLATFORM_ENV),
        }
        os.environ[TARGET_APP_ENV] = TARGET_APP
        os.environ[TARGET_PLATFORM_ENV] = TARGET_PLATFORM
        try:
            call_command("reencrypt_at_rest_secrets", "--dry-run")
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

        self.assertTrue(
            assert_can_decrypt_with_key(
                GroupEmailSender.objects.get().smtp_password_encrypted,
                SOURCE_APP.encode(),
            )
        )


@override_settings(
    DEBUG=True,
    APP_SECRETS_ENCRYPTION_KEY=SOURCE_APP,
    PLATFORM_2FA_ENCRYPTION_KEY=SOURCE_PLATFORM,
)
class ReencryptDecryptHelpersStillWorkUnderSourceKeysTests(TestCase):
    def test_source_encrypt_helpers_match_current_keys(self):
        token = encrypt_secret("hello")
        self.assertEqual(decrypt_secret(token), "hello")
        self.assertTrue(
            assert_can_decrypt_with_key(token, current_app_secrets_key_bytes())
        )
