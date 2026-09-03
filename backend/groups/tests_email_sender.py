"""Tests for Group Custom SMTP email sender and after-action delivery."""

from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from attendance.models import ActionRecord, ActionType
from attendance.services import perform_action_record_from_kiosk
from core.crypto import decrypt_secret
from groups.email_providers.custom_smtp import SAFE_AUTH_FAILED
from groups.email_sender import (
    save_group_email_sender,
    send_group_email_sender_test,
)
from groups.email_sender_models import (
    EmailSenderProviderKind,
    EmailSenderStatus,
    GroupEmailDelivery,
    GroupEmailDeliveryStatus,
    GroupEmailSender,
)
from groups.email_sender_testing import (
    GROUP_EMAIL_CRYPTO_TEST_SETTINGS,
    batch_recipients,
    make_session_request,
    mock_batch_send_fail_for,
    mock_batch_send_success,
    save_verified_email_sender,
)
from groups.models import Group, GroupMembership
from groups.serializers import GroupSerializer
from members.models import Member
from organizations.models import Organization


@override_settings(**GROUP_EMAIL_CRYPTO_TEST_SETTINGS)
class GroupEmailSenderTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner-email-sender@example.com",
            password="password12345",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.organization = Organization.objects.create_with_owner(
            owner=self.owner,
            internal_label="Email Sender Org",
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="SMTP Group",
            check_in_enabled=True,
        )
        self.other_owner = User.objects.create_user(
            email="other-email-sender@example.com",
            password="password12345",
        )
        self.other_owner.email_verified = True
        self.other_owner.save(update_fields=["email_verified"])
        self.other_org = Organization.objects.create_with_owner(
            owner=self.other_owner,
            internal_label="Other Org",
        )
        self.other_group = Group.objects.create_group(
            organization=self.other_org,
            name="Other Group",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def _save_smtp(self, group=None, **overrides):
        payload = {
            "provider": "custom_smtp",
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_security": "starttls",
            "smtp_username": "user@example.com",
            "from_email": "from@example.com",
            "from_name": "Check Station Group",
            "smtp_password": "super-secret-password",
            "change_password": True,
        }
        payload.update(overrides)
        group = payload.pop("group", None) or group or self.group
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            return save_verified_email_sender(group=group, **payload)

    def test_one_sender_per_group_and_tenant_ownership(self):
        sender = self._save_smtp()
        self.assertEqual(sender.organization_id, self.organization.id)
        self.assertEqual(GroupEmailSender.objects.filter(group=self.group).count(), 1)
        again = self._save_smtp(smtp_host="mail.example.com")
        self.assertEqual(again.pk, sender.pk)
        self.assertEqual(GroupEmailSender.objects.filter(group=self.group).count(), 1)

    def test_password_encrypted_and_never_serialized(self):
        sender = self._save_smtp()
        self.assertNotEqual(sender.smtp_password_encrypted, "super-secret-password")
        self.assertEqual(decrypt_secret(sender.smtp_password_encrypted), "super-secret-password")
        response = self.client.get(f"/api/groups/{self.group.id}/email-sender/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("smtp_password", response.data)
        self.assertNotIn("smtp_password_encrypted", response.data)
        self.assertTrue(response.data["password_configured"])
        body = str(response.content)
        self.assertNotIn("super-secret-password", body)

    def test_non_secret_field_change_preserves_password(self):
        sender = self._save_smtp()
        encrypted = sender.smtp_password_encrypted
        with self.assertRaises(ValidationError) as raised:
            save_group_email_sender(
                group=self.group,
                smtp_host="smtp2.example.com",
                from_name="Updated Name",
            )
        self.assertIn(
            "test email before saving",
            raised.exception.message_dict["detail"][0].lower(),
        )
        sender.refresh_from_db()
        self.assertEqual(sender.smtp_host, "smtp.example.com")
        self.assertEqual(sender.smtp_password_encrypted, encrypted)

        request = make_session_request()
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            send_group_email_sender_test(
                group=self.group,
                to_email="tester@example.com",
                request=request,
                draft={
                    "smtp_host": "smtp2.example.com",
                    "from_name": "Updated Name",
                },
            )
            updated = save_group_email_sender(
                group=self.group,
                request=request,
                smtp_host="smtp2.example.com",
                from_name="Updated Name",
            )
        self.assertEqual(updated.smtp_password_encrypted, encrypted)
        self.assertEqual(updated.smtp_host, "smtp2.example.com")
        self.assertEqual(updated.from_name, "Updated Name")
        self.assertEqual(updated.status, EmailSenderStatus.READY)

    def test_from_name_only_preserves_ready_without_retest(self):
        sender = self._save_smtp()
        encrypted = sender.smtp_password_encrypted
        updated = save_group_email_sender(
            group=self.group,
            from_name="Display Only",
        )
        self.assertEqual(updated.from_name, "Display Only")
        self.assertEqual(updated.smtp_password_encrypted, encrypted)
        self.assertEqual(updated.status, EmailSenderStatus.READY)

    def test_save_without_verification_rejected(self):
        with self.assertRaises(ValidationError) as raised:
            save_group_email_sender(
                group=self.group,
                provider="custom_smtp",
                smtp_host="smtp.example.com",
                smtp_port=587,
                smtp_security="starttls",
                smtp_username="user@example.com",
                from_email="from@example.com",
                from_name="Check Station Group",
                smtp_password="super-secret-password",
                change_password=True,
            )
        self.assertIn(
            "test email before saving",
            raised.exception.message_dict["detail"][0].lower(),
        )
        self.assertFalse(GroupEmailSender.objects.filter(group=self.group).exists())

    @patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send")
    def test_successful_test_marks_ready(self, mock_send):
        self._save_smtp()
        sender = send_group_email_sender_test(
            group=self.group,
            to_email="tester@example.com",
        )
        self.assertEqual(sender.status, EmailSenderStatus.READY)
        mock_send.assert_called_once()
        delivery = GroupEmailDelivery.objects.filter(event_type="test").latest("id")
        self.assertEqual(delivery.status, GroupEmailDeliveryStatus.SENT)

    @patch(
        "groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send",
        side_effect=Exception("535 Authentication failed for user"),
    )
    def test_auth_failure_safe_error(self, _mock_send):
        self._save_smtp()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        detail = raised.exception.message_dict["detail"]
        self.assertEqual(detail, [SAFE_AUTH_FAILED])
        sender = GroupEmailSender.objects.get(group=self.group)
        self.assertEqual(sender.status, EmailSenderStatus.ERROR)
        self.assertEqual(sender.last_test_error, SAFE_AUTH_FAILED)
        self.assertNotIn("super-secret", str(raised.exception))

    @patch(
        "groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send",
        side_effect=ConnectionRefusedError("connection refused"),
    )
    def test_connection_failure_safe_error(self, _mock_send):
        self._save_smtp()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(
            raised.exception.message_dict["detail"],
            ["Could not connect to the SMTP server."],
        )

    def test_config_change_without_verification_rejected(self):
        sender = self._save_smtp()
        self.assertEqual(sender.status, EmailSenderStatus.READY)
        with self.assertRaises(ValidationError) as raised:
            save_group_email_sender(group=self.group, smtp_port=465)
        self.assertIn(
            "test email before saving",
            raised.exception.message_dict["detail"][0].lower(),
        )
        sender.refresh_from_db()
        self.assertEqual(sender.smtp_port, 587)
        self.assertEqual(sender.status, EmailSenderStatus.READY)

        request = make_session_request()
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            send_group_email_sender_test(
                group=self.group,
                to_email="tester@example.com",
                request=request,
                draft={"smtp_port": 465},
            )
            updated = save_group_email_sender(
                group=self.group,
                request=request,
                smtp_port=465,
            )
        self.assertEqual(updated.status, EmailSenderStatus.READY)
        self.assertEqual(updated.smtp_port, 465)

    def test_draft_test_then_save_activates_sender(self):
        self.assertFalse(GroupEmailSender.objects.filter(group=self.group).exists())
        request = make_session_request()
        draft = {
            "provider": "custom_smtp",
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_security": "starttls",
            "smtp_username": "user@example.com",
            "from_email": "from@example.com",
            "from_name": "New Sender",
            "smtp_password": "draft-secret-password",
            "change_password": True,
        }
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            send_group_email_sender_test(
                group=self.group,
                to_email="tester@example.com",
                request=request,
                draft=draft,
            )
            self.assertFalse(GroupEmailSender.objects.filter(group=self.group).exists())
            sender = save_group_email_sender(group=self.group, request=request, **draft)
        self.assertEqual(sender.status, EmailSenderStatus.READY)
        self.assertEqual(sender.from_name, "New Sender")
        self.assertEqual(decrypt_secret(sender.smtp_password_encrypted), "draft-secret-password")

    def test_failed_draft_does_not_replace_ready_sender(self):
        ready = self._save_smtp()
        encrypted = ready.smtp_password_encrypted
        request = make_session_request()
        with patch(
            "groups.email_providers.smtp_transport.smtp_send",
            side_effect=Exception("535 Authentication failed"),
        ):
            with self.assertRaises(ValidationError):
                send_group_email_sender_test(
                    group=self.group,
                    to_email="tester@example.com",
                    request=request,
                    draft={
                        "provider": "gmail",
                        "gmail_address": "switch@gmail.com",
                        "smtp_password": "bad password xx yy",
                        "change_password": True,
                    },
                )
        ready.refresh_from_db()
        self.assertEqual(ready.provider, EmailSenderProviderKind.CUSTOM_SMTP)
        self.assertEqual(ready.status, EmailSenderStatus.READY)
        self.assertEqual(ready.smtp_password_encrypted, encrypted)
        self.assertEqual(ready.smtp_host, "smtp.example.com")

    def test_leave_without_save_keeps_previous(self):
        ready = self._save_smtp()
        encrypted = ready.smtp_password_encrypted
        request = make_session_request()
        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send",
            side_effect=Exception("535 Authentication failed for user"),
        ):
            with self.assertRaises(ValidationError):
                send_group_email_sender_test(
                    group=self.group,
                    to_email="tester@example.com",
                    request=request,
                    draft={
                        "smtp_host": "evil.example.com",
                        "smtp_password": "other-secret",
                        "change_password": True,
                    },
                )
        ready.refresh_from_db()
        self.assertEqual(ready.status, EmailSenderStatus.READY)
        self.assertEqual(ready.smtp_host, "smtp.example.com")
        self.assertEqual(ready.smtp_password_encrypted, encrypted)

    def test_cannot_enable_after_action_without_ready_sender(self):
        serializer = GroupSerializer(
            instance=self.group,
            data={
                "notifications": {"check_in": {"send_email": True}},
            },
            partial=True,
            context={"organization": self.organization},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("notifications", serializer.errors)

    @patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send")
    def test_enabling_after_action_sets_require_email(self, mock_send):
        self._save_smtp()
        self.group.require_email = False
        self.group.save(update_fields=["require_email", "updated_at"])
        serializer = GroupSerializer(
            instance=self.group,
            data={
                "notifications": {"check_in": {"send_email": True}},
            },
            partial=True,
            context={"organization": self.organization},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        group = serializer.save()
        self.assertTrue(group.require_email)
        self.assertTrue(group._require_email_enabled_for_after_action)

    @patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send")
    def test_disabling_after_actions_keeps_require_email(self, mock_send):
        self._save_smtp()
        self.group.send_email_after_check_in = True
        self.group.require_email = True
        self.group.save()
        serializer = GroupSerializer(
            instance=self.group,
            data={
                "notifications": {"check_in": {"send_email": False}},
                "participation": {"email_required": True},
            },
            partial=True,
            context={"organization": self.organization},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        group = serializer.save()
        self.assertFalse(group.send_email_after_check_in)
        self.assertTrue(group.require_email)

    @patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send")
    def test_missing_participation_email_marks_setup_incomplete(self, mock_send):
        self._save_smtp()
        member = Member.objects.create(
            organization=self.organization,
            name="No Email Member",
        )
        GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=member,
            participation_email="",
        )
        serializer = GroupSerializer(
            instance=self.group,
            data={"notifications": {"check_in": {"send_email": True}}},
            partial=True,
            context={"organization": self.organization},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        group = serializer.save()
        self.assertTrue(group.require_email)
        response = self.client.get(f"/api/groups/{group.id}/")
        self.assertFalse(response.data["readiness"]["setup_complete"])
        self.assertEqual(response.data["readiness"]["missing_email_count"], 1)

    def test_action_sends_via_group_sender_using_participation_email(self):
        self._save_smtp()
        self.group.send_email_after_check_in = True
        self.group.require_email = True
        self.group.save()
        member = Member.objects.create(
            organization=self.organization,
            name="Pat Participant",
            email="member-profile@example.com",
        )
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=member,
            participation_email="participation@example.com",
        )
        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_success,
        ) as mock_send:
            ar = perform_action_record_from_kiosk(
                group=self.group,
                action_type=ActionType.CHECK_IN,
                participant_kind="member",
                membership=membership,
            )
            mock_send.assert_called_once()
            self.assertEqual(
                batch_recipients(mock_send),
                ["participation@example.com"],
            )
        self.assertTrue(ActionRecord.objects.filter(pk=ar.pk).exists())
        delivery = GroupEmailDelivery.objects.filter(action_record=ar).first()
        self.assertEqual(delivery.status, GroupEmailDeliveryStatus.SENT)
        self.assertEqual(delivery.recipient, "participation@example.com")

    def test_email_failure_does_not_rollback_action(self):
        from groups.email_providers.base import EmailSenderProviderError

        self._save_smtp()
        self.group.send_email_after_check_in = True
        self.group.save()
        member = Member.objects.create(
            organization=self.organization,
            name="Fail Email",
        )
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=member,
            participation_email="fail@example.com",
        )
        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_fail_for("fail@example.com"),
        ):
            ar = perform_action_record_from_kiosk(
                group=self.group,
                action_type=ActionType.CHECK_IN,
                participant_kind="member",
                membership=membership,
            )
        self.assertTrue(ActionRecord.objects.filter(pk=ar.pk).exists())
        delivery = GroupEmailDelivery.objects.get(action_record=ar)
        self.assertEqual(delivery.status, GroupEmailDeliveryStatus.FAILED)

    def test_tenant_isolation_on_sender_api(self):
        self._save_smtp(group=self.other_group)
        response = self.client.get(f"/api/groups/{self.other_group.id}/email-sender/")
        self.assertEqual(response.status_code, 404)
        response = self.client.put(
            f"/api/groups/{self.other_group.id}/email-sender/",
            {
                "provider": "custom_smtp",
                "smtp_host": "evil.example.com",
                "smtp_port": 587,
                "smtp_security": "starttls",
                "smtp_username": "x",
                "from_email": "x@example.com",
                "smtp_password": "stolen",
                "change_password": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_api_save_and_test_endpoints(self):
        payload = {
            "provider": "custom_smtp",
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_security": "starttls",
            "smtp_username": "user@example.com",
            "from_email": "from@example.com",
            "from_name": "Group",
            "smtp_password": "api-secret",
            "change_password": True,
        }
        untested = self.client.put(
            f"/api/groups/{self.group.id}/email-sender/",
            payload,
            format="json",
        )
        self.assertEqual(untested.status_code, 400)
        self.assertIn("test email", str(untested.data).lower())

        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            test = self.client.post(
                f"/api/groups/{self.group.id}/email-sender/test/",
                {**payload, "to_email": "owner-email-sender@example.com"},
                format="json",
            )
            self.assertEqual(test.status_code, 200)
            self.assertTrue(test.data["draft_verified"])
            self.assertEqual(
                test.data["email_sender"]["status"],
                EmailSenderStatus.NOT_CONFIGURED,
            )
            saved = self.client.put(
                f"/api/groups/{self.group.id}/email-sender/",
                payload,
                format="json",
            )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.data["status"], EmailSenderStatus.READY)
        self.assertNotIn("smtp_password", saved.data)
