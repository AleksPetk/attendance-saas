from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

from accounts.tokens import (
    backup_email_verification_token_generator,
    primary_email_change_token_generator,
)
from organizations.models import Organization, WorkspaceStaffAccount, WorkspaceStaffRole

User = get_user_model()


def uid_for(user):
    return urlsafe_base64_encode(force_bytes(user.pk))


class OwnerEmailManagementTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner@example.com",
            password="secure-password",
        )
        self.owner.mark_email_verified()
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.ADMIN,
            email="natsumi.admin@example.com",
        )
        self.api = APIClient()
        self.api.force_login(self.owner)

    def _staff_api(self):
        client = APIClient()
        login = client.post(
            "/api/auth/staff-login/",
            {
                "workspace_id": self.organization.workspace_id,
                "username": "natsumi",
                "password": "staff-password",
            },
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        return client


class BackupEmailTests(OwnerEmailManagementTestCase):
    def test_owner_can_request_backup_email_with_correct_password(self):
        with patch("accounts.email_management.send_backup_email_verification") as send_mail:
            response = self.api.post(
                "/api/auth/account/backup-email/",
                {"email": "backup@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["code"], "sent")
        send_mail.assert_called_once()
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.pending_backup_email, "backup@example.com")
        self.assertIsNone(self.owner.backup_email)

    def test_wrong_password_rejected(self):
        response = self.api.post(
            "/api/auth/account/backup-email/",
            {"email": "backup@example.com", "current_password": "wrong-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("current_password", response.data)

    def test_backup_equal_primary_rejected(self):
        response = self.api.post(
            "/api/auth/account/backup-email/",
            {"email": "owner@example.com", "current_password": "secure-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)

    def test_pending_backup_not_marked_verified(self):
        with patch("accounts.email_management.send_backup_email_verification"):
            self.api.post(
                "/api/auth/account/backup-email/",
                {"email": "backup@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.pending_backup_email, "backup@example.com")
        self.assertIsNone(self.owner.backup_email)
        self.assertIsNone(self.owner.backup_email_verified_at)

    def test_valid_token_verifies_backup(self):
        with patch("accounts.email_management.send_backup_email_verification"):
            self.api.post(
                "/api/auth/account/backup-email/",
                {"email": "backup@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.owner.refresh_from_db()
        token = backup_email_verification_token_generator.make_token(self.owner)
        public = APIClient()
        response = public.post(
            "/api/auth/verify-backup-email/",
            {"uid": uid_for(self.owner), "token": token},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["code"], "verified")
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.backup_email, "backup@example.com")
        self.assertIsNotNone(self.owner.backup_email_verified_at)
        self.assertIsNone(self.owner.pending_backup_email)

    def test_expired_token_rejected(self):
        with patch("accounts.email_management.send_backup_email_verification"):
            self.api.post(
                "/api/auth/account/backup-email/",
                {"email": "backup@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.owner.refresh_from_db()
        token = backup_email_verification_token_generator.make_token(self.owner)
        future = backup_email_verification_token_generator._now() + timedelta(hours=25)
        with patch.object(backup_email_verification_token_generator, "_now", return_value=future):
            response = APIClient().post(
                "/api/auth/verify-backup-email/",
                {"uid": uid_for(self.owner), "token": token},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "token_expired")

    def test_superseded_token_rejected(self):
        with patch("accounts.email_management.send_backup_email_verification"):
            self.api.post(
                "/api/auth/account/backup-email/",
                {"email": "backup@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.owner.refresh_from_db()
        old_token = backup_email_verification_token_generator.make_token(self.owner)
        with patch("accounts.email_management.send_backup_email_verification"):
            self.api.post(
                "/api/auth/account/backup-email/",
                {"email": "newbackup@example.com", "current_password": "secure-password"},
                format="json",
            )
        response = APIClient().post(
            "/api/auth/verify-backup-email/",
            {"uid": uid_for(self.owner), "token": old_token},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "token_invalid")

    def test_resend_works_within_limits(self):
        with patch("accounts.email_management.send_backup_email_verification") as send_mail:
            self.api.post(
                "/api/auth/account/backup-email/",
                {"email": "backup@example.com", "current_password": "secure-password"},
                format="json",
            )
            self.owner.refresh_from_db()
            self.owner.backup_email_verification_last_sent_at = timezone.now() - timedelta(
                seconds=61
            )
            self.owner.save(update_fields=["backup_email_verification_last_sent_at"])
            first = self.api.post("/api/auth/account/backup-email/resend/", {}, format="json")
            second = self.api.post("/api/auth/account/backup-email/resend/", {}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.data["code"], "email_cooldown")
        self.assertEqual(send_mail.call_count, 2)

    def test_remove_verified_backup_works_with_password(self):
        with patch("accounts.email_management.send_backup_email_verification"):
            self.api.post(
                "/api/auth/account/backup-email/",
                {"email": "backup@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.owner.refresh_from_db()
        token = backup_email_verification_token_generator.make_token(self.owner)
        APIClient().post(
            "/api/auth/verify-backup-email/",
            {"uid": uid_for(self.owner), "token": token},
            format="json",
        )
        response = self.api.post(
            "/api/auth/account/backup-email/remove/",
            {"current_password": "secure-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.owner.refresh_from_db()
        self.assertIsNone(self.owner.backup_email)
        self.assertIsNone(self.owner.pending_backup_email)

    def test_workspace_staff_cannot_manage_owner_backup_email(self):
        staff_api = self._staff_api()
        response = staff_api.post(
            "/api/auth/account/backup-email/",
            {"email": "backup@example.com", "current_password": "staff-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_verified_backup_preserved_until_new_verifies(self):
        self.owner.backup_email = "oldbackup@example.com"
        self.owner.backup_email_verified_at = self.owner.email_verified_at
        self.owner.save()
        with patch("accounts.email_management.send_backup_email_verification"):
            self.api.post(
                "/api/auth/account/backup-email/",
                {"email": "newbackup@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.backup_email, "oldbackup@example.com")
        self.assertEqual(self.owner.pending_backup_email, "newbackup@example.com")

    def test_cancel_pending_backup(self):
        with patch("accounts.email_management.send_backup_email_verification"):
            self.api.post(
                "/api/auth/account/backup-email/",
                {"email": "backup@example.com", "current_password": "secure-password"},
                format="json",
            )
        response = self.api.post("/api/auth/account/backup-email/cancel/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.owner.refresh_from_db()
        self.assertIsNone(self.owner.pending_backup_email)


class PrimaryEmailChangeTests(OwnerEmailManagementTestCase):
    def test_requesting_new_primary_does_not_immediately_change_email(self):
        with patch("accounts.email_management.send_primary_email_change_verification"):
            response = self.api.post(
                "/api/auth/account/primary-email/",
                {"email": "newowner@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.email, "owner@example.com")
        self.assertEqual(self.owner.pending_primary_email, "newowner@example.com")

    def test_old_email_still_logs_in_before_verification(self):
        with patch("accounts.email_management.send_primary_email_change_verification"):
            self.api.post(
                "/api/auth/account/primary-email/",
                {"email": "newowner@example.com", "current_password": "secure-password"},
                format="json",
            )
        client = APIClient()
        login = client.post(
            "/api/auth/login/",
            {"email": "owner@example.com", "password": "secure-password"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)

    def test_verification_changes_email_atomically(self):
        with patch("accounts.email_management.send_primary_email_change_verification"):
            self.api.post(
                "/api/auth/account/primary-email/",
                {"email": "newowner@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.owner.refresh_from_db()
        token = primary_email_change_token_generator.make_token(self.owner)
        with patch("accounts.email_management.send_primary_email_changed_notice") as notice:
            response = APIClient().post(
                "/api/auth/verify-primary-email/",
                {"uid": uid_for(self.owner), "token": token},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        notice.assert_called_once_with(old_email="owner@example.com", language="en")
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.email, "newowner@example.com")
        self.assertTrue(self.owner.email_verified)
        self.assertIsNone(self.owner.pending_primary_email)

    def test_new_email_logs_in_after_verification(self):
        with patch("accounts.email_management.send_primary_email_change_verification"):
            self.api.post(
                "/api/auth/account/primary-email/",
                {"email": "newowner@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.owner.refresh_from_db()
        token = primary_email_change_token_generator.make_token(self.owner)
        with patch("accounts.email_management.send_primary_email_changed_notice"):
            APIClient().post(
                "/api/auth/verify-primary-email/",
                {"uid": uid_for(self.owner), "token": token},
                format="json",
            )
        client = APIClient()
        login = client.post(
            "/api/auth/login/",
            {"email": "newowner@example.com", "password": "secure-password"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)

    def test_old_email_no_longer_logs_in_after_successful_change(self):
        with patch("accounts.email_management.send_primary_email_change_verification"):
            self.api.post(
                "/api/auth/account/primary-email/",
                {"email": "newowner@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.owner.refresh_from_db()
        token = primary_email_change_token_generator.make_token(self.owner)
        with patch("accounts.email_management.send_primary_email_changed_notice"):
            APIClient().post(
                "/api/auth/verify-primary-email/",
                {"uid": uid_for(self.owner), "token": token},
                format="json",
            )
        client = APIClient()
        login = client.post(
            "/api/auth/login/",
            {"email": "owner@example.com", "password": "secure-password"},
            format="json",
        )
        self.assertEqual(login.status_code, 401)

    def test_duplicate_existing_email_rejected(self):
        User.objects.create_user(email="taken@example.com", password="other-password")
        response = self.api.post(
            "/api/auth/account/primary-email/",
            {"email": "taken@example.com", "current_password": "secure-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)

    def test_uniqueness_rechecked_at_verification(self):
        with patch("accounts.email_management.send_primary_email_change_verification"):
            self.api.post(
                "/api/auth/account/primary-email/",
                {"email": "newowner@example.com", "current_password": "secure-password"},
                format="json",
            )
        User.objects.create_user(email="newowner@example.com", password="other-password")
        self.owner.refresh_from_db()
        token = primary_email_change_token_generator.make_token(self.owner)
        response = APIClient().post(
            "/api/auth/verify-primary-email/",
            {"uid": uid_for(self.owner), "token": token},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "email_unavailable")
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.email, "owner@example.com")

    def test_wrong_password_rejected(self):
        response = self.api.post(
            "/api/auth/account/primary-email/",
            {"email": "newowner@example.com", "current_password": "wrong-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("current_password", response.data)

    def test_expired_token_rejected(self):
        with patch("accounts.email_management.send_primary_email_change_verification"):
            self.api.post(
                "/api/auth/account/primary-email/",
                {"email": "newowner@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.owner.refresh_from_db()
        token = primary_email_change_token_generator.make_token(self.owner)
        future = primary_email_change_token_generator._now() + timedelta(hours=25)
        with patch.object(primary_email_change_token_generator, "_now", return_value=future):
            response = APIClient().post(
                "/api/auth/verify-primary-email/",
                {"uid": uid_for(self.owner), "token": token},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "token_expired")

    def test_superseded_token_rejected(self):
        with patch("accounts.email_management.send_primary_email_change_verification"):
            self.api.post(
                "/api/auth/account/primary-email/",
                {"email": "newowner@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.owner.refresh_from_db()
        old_token = primary_email_change_token_generator.make_token(self.owner)
        with patch("accounts.email_management.send_primary_email_change_verification"):
            self.api.post(
                "/api/auth/account/primary-email/",
                {"email": "another@example.com", "current_password": "secure-password"},
                format="json",
            )
        response = APIClient().post(
            "/api/auth/verify-primary-email/",
            {"uid": uid_for(self.owner), "token": old_token},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "token_invalid")

    def test_cancel_pending_leaves_current_email_unchanged(self):
        with patch("accounts.email_management.send_primary_email_change_verification"):
            self.api.post(
                "/api/auth/account/primary-email/",
                {"email": "newowner@example.com", "current_password": "secure-password"},
                format="json",
            )
        response = self.api.post("/api/auth/account/primary-email/cancel/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.email, "owner@example.com")
        self.assertIsNone(self.owner.pending_primary_email)

    def test_primary_cannot_change_to_verified_backup(self):
        self.owner.backup_email = "backup@example.com"
        self.owner.backup_email_verified_at = self.owner.email_verified_at
        self.owner.save()
        response = self.api.post(
            "/api/auth/account/primary-email/",
            {"email": "backup@example.com", "current_password": "secure-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)

    def test_session_remains_valid_after_primary_change(self):
        with patch("accounts.email_management.send_primary_email_change_verification"):
            self.api.post(
                "/api/auth/account/primary-email/",
                {"email": "newowner@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.owner.refresh_from_db()
        token = primary_email_change_token_generator.make_token(self.owner)
        with patch("accounts.email_management.send_primary_email_changed_notice"):
            APIClient().post(
                "/api/auth/verify-primary-email/",
                {"uid": uid_for(self.owner), "token": token},
                format="json",
            )
        workspace = self.api.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)


class EmailDeliveryTests(OwnerEmailManagementTestCase):
    def test_backup_verification_uses_resend(self):
        with patch("accounts.emails.send_transactional_email") as send_mail:
            self.api.post(
                "/api/auth/account/backup-email/",
                {"email": "backup@example.com", "current_password": "secure-password"},
                format="json",
            )
        send_mail.assert_called_once()
        self.assertEqual(send_mail.call_args.kwargs["to_email"], "backup@example.com")
        self.assertIn("backup", send_mail.call_args.kwargs["subject"].lower())

    def test_primary_change_verification_uses_resend(self):
        with patch("accounts.emails.send_transactional_email") as send_mail:
            self.api.post(
                "/api/auth/account/primary-email/",
                {"email": "newowner@example.com", "current_password": "secure-password"},
                format="json",
            )
        send_mail.assert_called_once()
        self.assertEqual(send_mail.call_args.kwargs["to_email"], "newowner@example.com")
        self.assertIn("login", send_mail.call_args.kwargs["subject"].lower())

    def test_primary_change_resend(self):
        with patch("accounts.emails.send_transactional_email") as send_mail:
            self.api.post(
                "/api/auth/account/primary-email/",
                {"email": "newowner@example.com", "current_password": "secure-password"},
                format="json",
            )
            self.owner.refresh_from_db()
            self.owner.primary_email_change_last_sent_at = timezone.now() - timedelta(seconds=61)
            self.owner.save(update_fields=["primary_email_change_last_sent_at"])
            self.api.post("/api/auth/account/primary-email/resend/", {}, format="json")
        self.assertEqual(send_mail.call_count, 2)

    def test_old_email_security_notice_sent(self):
        with patch("accounts.email_management.send_primary_email_change_verification"):
            self.api.post(
                "/api/auth/account/primary-email/",
                {"email": "newowner@example.com", "current_password": "secure-password"},
                format="json",
            )
        self.owner.refresh_from_db()
        token = primary_email_change_token_generator.make_token(self.owner)
        with patch("accounts.emails.send_transactional_email") as send_mail:
            APIClient().post(
                "/api/auth/verify-primary-email/",
                {"uid": uid_for(self.owner), "token": token},
                format="json",
            )
        notice_calls = [
            call
            for call in send_mail.call_args_list
            if call.kwargs.get("to_email") == "owner@example.com"
        ]
        self.assertEqual(len(notice_calls), 1)
        self.assertIn("changed", notice_calls[0].kwargs["subject"].lower())

    def test_registration_token_not_valid_for_backup_verify(self):
        with patch("accounts.email_management.send_backup_email_verification"):
            self.api.post(
                "/api/auth/account/backup-email/",
                {"email": "backup@example.com", "current_password": "secure-password"},
                format="json",
            )
        from accounts.tokens import email_verification_token_generator

        wrong_token = email_verification_token_generator.make_token(self.owner)
        response = APIClient().post(
            "/api/auth/verify-backup-email/",
            {"uid": uid_for(self.owner), "token": wrong_token},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "token_invalid")


class PendingEmailOwnershipSemanticsTests(TestCase):
    def test_unverified_pending_backup_does_not_establish_ownership(self):
        from accounts.email_uniqueness import (
            email_address_claimed,
            email_ownership_established,
        )

        holder = User.objects.create_user(
            email="holder@example.com", password="secure-password"
        )
        holder.mark_email_verified()
        Organization.objects.create_with_owner(owner=holder)
        holder.pending_backup_email = "victim@example.com"
        holder.save(update_fields=["pending_backup_email"])

        self.assertFalse(email_address_claimed("victim@example.com"))
        self.assertFalse(email_ownership_established("victim@example.com"))

    def test_backup_verify_fails_after_other_account_registers_and_verifies(self):
        holder = User.objects.create_user(
            email="holder@example.com", password="secure-password"
        )
        holder.mark_email_verified()
        Organization.objects.create_with_owner(owner=holder)
        holder.pending_backup_email = "victim@example.com"
        holder.save(update_fields=["pending_backup_email"])
        stale_token = backup_email_verification_token_generator.make_token(holder)

        real_owner = User.objects.create_user(
            email="victim@example.com",
            password="real-owner-password",
            email_verified=False,
        )
        real_owner.mark_email_verified()
        Organization.objects.create_with_owner(owner=real_owner)

        response = APIClient().post(
            "/api/auth/verify-backup-email/",
            {"uid": uid_for(holder), "token": stale_token},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "email_unavailable")
        holder.refresh_from_db()
        self.assertEqual(holder.pending_backup_email, "victim@example.com")
        self.assertIsNone(holder.backup_email)
        self.assertEqual(User.objects.filter(email="victim@example.com").count(), 1)
        self.assertEqual(Organization.objects.filter(owner=real_owner).count(), 1)

    def test_primary_change_verify_fails_after_other_account_owns_email(self):
        holder = User.objects.create_user(
            email="holder@example.com", password="secure-password"
        )
        holder.mark_email_verified()
        Organization.objects.create_with_owner(owner=holder)
        holder.pending_primary_email = "victim-primary@example.com"
        holder.save(update_fields=["pending_primary_email"])
        stale_token = primary_email_change_token_generator.make_token(holder)

        real_owner = User.objects.create_user(
            email="victim-primary@example.com",
            password="real-owner-password",
        )
        real_owner.mark_email_verified()
        Organization.objects.create_with_owner(owner=real_owner)

        with patch("accounts.email_management.send_primary_email_changed_notice") as notice:
            response = APIClient().post(
                "/api/auth/verify-primary-email/",
                {"uid": uid_for(holder), "token": stale_token},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "email_unavailable")
        notice.assert_not_called()
        holder.refresh_from_db()
        self.assertEqual(holder.email, "holder@example.com")
        self.assertEqual(holder.pending_primary_email, "victim-primary@example.com")

    def test_verified_backup_still_blocks_claimed_and_ownership(self):
        from accounts.email_uniqueness import (
            email_address_claimed,
            email_ownership_established,
        )

        holder = User.objects.create_user(
            email="holder@example.com", password="secure-password"
        )
        holder.mark_email_verified()
        Organization.objects.create_with_owner(owner=holder)
        holder.backup_email = "owned-backup@example.com"
        holder.backup_email_verified_at = timezone.now()
        holder.save(update_fields=["backup_email", "backup_email_verified_at"])

        self.assertTrue(email_address_claimed("owned-backup@example.com"))
        self.assertTrue(email_ownership_established("owned-backup@example.com"))
