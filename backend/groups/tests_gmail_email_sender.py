"""Tests for Group Gmail App Password email sender provider."""

from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from attendance.models import ActionRecord, ActionType
from attendance.services import perform_action_record_from_kiosk
from core.crypto import decrypt_secret
from groups.email_providers.base import EmailSenderProviderError, get_email_sender_provider
from groups.email_providers.gmail import (
    GMAIL_SMTP_HOST,
    GMAIL_SMTP_PORT,
    GMAIL_SMTP_SECURITY,
    SAFE_AUTH_FAILED,
    SAFE_CONNECT_FAILED,
    SAFE_RECIPIENT_REJECTED,
    normalize_gmail_app_password,
)
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
    batch_recipients,
    make_session_request,
    mock_batch_send_fail_for,
    mock_batch_send_success,
    save_verified_email_sender,
)
from groups.models import Group, GroupMembership
from members.models import Member
from organizations.models import Organization


@override_settings(
    DEBUG=True,
    APP_SECRETS_ENCRYPTION_KEY="",
    SECRET_KEY="test-secret-key-for-group-gmail-sender-suite",
)
class GroupGmailEmailSenderTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner-gmail-sender@example.com",
            password="password12345",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.organization = Organization.objects.create_with_owner(
            owner=self.owner,
            internal_label="Gmail Sender Org",
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Gmail Group",
            check_in_enabled=True,
        )
        self.other_owner = User.objects.create_user(
            email="other-gmail-sender@example.com",
            password="password12345",
        )
        self.other_owner.email_verified = True
        self.other_owner.save(update_fields=["email_verified"])
        self.other_org = Organization.objects.create_with_owner(
            owner=self.other_owner,
            internal_label="Other Gmail Org",
        )
        self.other_group = Group.objects.create_group(
            organization=self.other_org,
            name="Other Gmail Group",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def _save_gmail(self, group=None, **overrides):
        payload = {
            "provider": "gmail",
            "gmail_address": "team@gmail.com",
            "from_name": "Check Station Group",
            "smtp_password": "abcd efgh ijkl mnop",
            "change_password": True,
        }
        payload.update(overrides)
        group = payload.pop("group", None) or group or self.group
        with patch("groups.email_providers.smtp_transport.smtp_send"):
            return save_verified_email_sender(group=group, **payload)

    def _save_smtp(self, group=None, **overrides):
        payload = {
            "provider": "custom_smtp",
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_security": "starttls",
            "smtp_username": "user@example.com",
            "from_email": "from@example.com",
            "from_name": "SMTP Name",
            "smtp_password": "smtp-secret-password",
            "change_password": True,
        }
        payload.update(overrides)
        group = payload.pop("group", None) or group or self.group
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            return save_verified_email_sender(group=group, **payload)

    def test_provider_registry_resolves_gmail_and_smtp(self):
        gmail = get_email_sender_provider(EmailSenderProviderKind.GMAIL)
        smtp = get_email_sender_provider(EmailSenderProviderKind.CUSTOM_SMTP)
        self.assertEqual(gmail.kind, EmailSenderProviderKind.GMAIL)
        self.assertEqual(smtp.kind, EmailSenderProviderKind.CUSTOM_SMTP)

    def test_normalize_app_password_strips_spaces_only(self):
        self.assertEqual(
            normalize_gmail_app_password("abcd efgh ijkl mnop"),
            "abcdefghijklmnop",
        )
        self.assertEqual(
            normalize_gmail_app_password("ab-cd_ef"),
            "ab-cd_ef",
        )

    def test_gmail_requires_address_and_app_password(self):
        with self.assertRaises(ValidationError) as missing_address:
            save_group_email_sender(
                group=self.group,
                provider="gmail",
                gmail_address="",
                smtp_password="abcdefghijklmnop",
                change_password=True,
            )
        self.assertIn("gmail_address", missing_address.exception.message_dict)

        with self.assertRaises(ValidationError) as missing_password:
            save_group_email_sender(
                group=self.group,
                provider="gmail",
                gmail_address="team@gmail.com",
                smtp_password="",
                change_password=True,
            )
        self.assertIn("smtp_password", missing_password.exception.message_dict)

    def test_gmail_does_not_require_technical_smtp_fields(self):
        sender = self._save_gmail()
        self.assertEqual(sender.provider, EmailSenderProviderKind.GMAIL)
        self.assertEqual(sender.smtp_host, "")
        self.assertIsNone(sender.smtp_port)
        self.assertEqual(sender.smtp_security, "")
        self.assertEqual(sender.from_email, "team@gmail.com")
        self.assertEqual(sender.smtp_username, "team@gmail.com")

    def test_gmail_from_email_derives_from_address(self):
        sender = self._save_gmail(gmail_address="Alias.User@Gmail.com")
        self.assertEqual(sender.from_email, "alias.user@gmail.com")
        payload = self.client.get(f"/api/groups/{self.group.id}/email-sender/").data
        self.assertEqual(payload["gmail_address"], "alias.user@gmail.com")
        self.assertEqual(payload["from_email"], "alias.user@gmail.com")
        self.assertEqual(payload["smtp_host"], "")
        self.assertIsNone(payload["smtp_port"])

    def test_app_password_encrypted_never_serialized_and_spaces_stripped(self):
        sender = self._save_gmail(smtp_password="abcd efgh ijkl mnop")
        self.assertEqual(decrypt_secret(sender.smtp_password_encrypted), "abcdefghijklmnop")
        response = self.client.get(f"/api/groups/{self.group.id}/email-sender/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["password_configured"])
        self.assertNotIn("smtp_password", response.data)
        self.assertNotIn("smtp_password_encrypted", response.data)
        body = str(response.content)
        self.assertNotIn("abcdefghijklmnop", body)
        self.assertNotIn("abcd efgh", body)

    def test_non_secret_update_preserves_app_password(self):
        sender = self._save_gmail()
        encrypted = sender.smtp_password_encrypted
        updated = save_group_email_sender(
            group=self.group,
            provider="gmail",
            from_name="Updated Display",
        )
        self.assertEqual(updated.smtp_password_encrypted, encrypted)
        self.assertEqual(updated.from_name, "Updated Display")
        self.assertEqual(updated.status, EmailSenderStatus.READY)

    def test_changing_app_password_requires_verification_then_ready(self):
        sender = self._save_gmail()
        with self.assertRaises(ValidationError) as raised:
            save_group_email_sender(
                group=self.group,
                provider="gmail",
                smtp_password="zzzz yyyy xxxx wwww",
                change_password=True,
            )
        self.assertIn(
            "test email before saving",
            raised.exception.message_dict["detail"][0].lower(),
        )
        sender.refresh_from_db()
        self.assertEqual(decrypt_secret(sender.smtp_password_encrypted), "abcdefghijklmnop")
        self.assertEqual(sender.status, EmailSenderStatus.READY)

        updated = self._save_gmail(smtp_password="zzzz yyyy xxxx wwww")
        self.assertEqual(decrypt_secret(updated.smtp_password_encrypted), "zzzzyyyyxxxxwwww")
        self.assertEqual(updated.status, EmailSenderStatus.READY)

    def test_gmail_address_change_requires_verification_then_ready(self):
        sender = self._save_gmail()
        with self.assertRaises(ValidationError) as raised:
            save_group_email_sender(
                group=self.group,
                provider="gmail",
                gmail_address="other@gmail.com",
            )
        self.assertIn(
            "test email before saving",
            raised.exception.message_dict["detail"][0].lower(),
        )
        sender.refresh_from_db()
        self.assertEqual(sender.from_email, "team@gmail.com")
        self.assertEqual(sender.status, EmailSenderStatus.READY)

        updated = self._save_gmail(gmail_address="other@gmail.com")
        self.assertEqual(updated.status, EmailSenderStatus.READY)
        self.assertEqual(updated.from_email, "other@gmail.com")

    def test_save_without_verification_rejected(self):
        with self.assertRaises(ValidationError) as raised:
            save_group_email_sender(
                group=self.group,
                provider="gmail",
                gmail_address="team@gmail.com",
                from_name="Check Station Group",
                smtp_password="abcd efgh ijkl mnop",
                change_password=True,
            )
        self.assertIn(
            "test email before saving",
            raised.exception.message_dict["detail"][0].lower(),
        )
        self.assertFalse(GroupEmailSender.objects.filter(group=self.group).exists())

    def test_failed_draft_does_not_replace_ready_gmail(self):
        ready = self._save_gmail()
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
                        "provider": "microsoft",
                        "microsoft_email": "switch@contoso.com",
                        "smtp_password": "ms-bad-password",
                        "change_password": True,
                    },
                )
        ready.refresh_from_db()
        self.assertEqual(ready.provider, EmailSenderProviderKind.GMAIL)
        self.assertEqual(ready.status, EmailSenderStatus.READY)
        self.assertEqual(ready.smtp_password_encrypted, encrypted)
        self.assertEqual(ready.from_email, "team@gmail.com")

    @patch("groups.email_providers.smtp_transport.smtp_send")
    def test_successful_test_uses_gmail_transport(self, mock_send):
        self._save_gmail()
        sender = send_group_email_sender_test(
            group=self.group,
            to_email="tester@example.com",
        )
        self.assertEqual(sender.status, EmailSenderStatus.READY)
        mock_send.assert_called_once()
        kwargs = mock_send.call_args.kwargs
        self.assertEqual(kwargs["host"], GMAIL_SMTP_HOST)
        self.assertEqual(kwargs["port"], GMAIL_SMTP_PORT)
        self.assertEqual(kwargs["security"], GMAIL_SMTP_SECURITY)
        self.assertEqual(kwargs["username"], "team@gmail.com")
        self.assertEqual(kwargs["password"], "abcdefghijklmnop")
        delivery = GroupEmailDelivery.objects.filter(event_type="test").latest("id")
        self.assertEqual(delivery.status, GroupEmailDeliveryStatus.SENT)

    @patch(
        "groups.email_providers.smtp_transport.smtp_send",
        side_effect=Exception("535 Authentication failed"),
    )
    def test_auth_failure_safe_gmail_message(self, _mock_send):
        self._save_gmail()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(raised.exception.message_dict["detail"], [SAFE_AUTH_FAILED])
        sender = GroupEmailSender.objects.get(group=self.group)
        self.assertEqual(sender.status, EmailSenderStatus.ERROR)
        self.assertEqual(sender.last_test_error, SAFE_AUTH_FAILED)

    @patch(
        "groups.email_providers.smtp_transport.smtp_send",
        side_effect=ConnectionRefusedError("connection refused"),
    )
    def test_connection_failure_safe_gmail_message(self, _mock_send):
        self._save_gmail()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(
            raised.exception.message_dict["detail"],
            [SAFE_CONNECT_FAILED],
        )

    @patch(
        "groups.email_providers.smtp_transport.smtp_send",
        side_effect=__import__("smtplib").SMTPRecipientsRefused(
            {"bad@example.com": (550, b"User unknown")}
        ),
    )
    def test_recipient_rejection_safe_gmail_message(self, _mock_send):
        self._save_gmail()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="bad@example.com")
        self.assertEqual(
            raised.exception.message_dict["detail"],
            [SAFE_RECIPIENT_REJECTED],
        )

    def test_after_action_send_via_gmail(self):
        self._save_gmail()
        self.group.send_email_after_check_in = True
        self.group.require_email = True
        self.group.save()
        member = Member.objects.create(
            organization=self.organization,
            name="Gmail Participant",
            email="member-profile@example.com",
        )
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=member,
            participation_email="participation@example.com",
        )
        with patch(
            "groups.email_providers.gmail.GmailProvider.send_messages_batch",
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

    def test_gmail_failure_does_not_rollback_action(self):
        self._save_gmail()
        self.group.send_email_after_check_in = True
        self.group.save()
        member = Member.objects.create(
            organization=self.organization,
            name="Fail Gmail",
        )
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=member,
            participation_email="fail@example.com",
        )
        with patch(
            "groups.email_providers.gmail.GmailProvider.send_messages_batch",
            side_effect=mock_batch_send_fail_for(
                "fail@example.com",
                error_message="Could not send the email",
            ),
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

    def test_switch_smtp_to_gmail_clears_obsolete_secret(self):
        smtp = self._save_smtp()
        old_secret = smtp.smtp_password_encrypted
        gmail = self._save_gmail(smtp_password="neww appp pass wordx")
        self.assertEqual(gmail.provider, EmailSenderProviderKind.GMAIL)
        self.assertEqual(gmail.smtp_host, "")
        self.assertNotEqual(gmail.smtp_password_encrypted, old_secret)
        self.assertEqual(decrypt_secret(gmail.smtp_password_encrypted), "newwappppasswordx")
        self.assertNotEqual(
            decrypt_secret(gmail.smtp_password_encrypted),
            "smtp-secret-password",
        )
        self.assertEqual(gmail.status, EmailSenderStatus.READY)

    def test_switch_gmail_to_smtp_clears_obsolete_secret(self):
        gmail = self._save_gmail()
        old_secret = gmail.smtp_password_encrypted
        smtp = self._save_smtp(smtp_password="brand-new-smtp")
        self.assertEqual(smtp.provider, EmailSenderProviderKind.CUSTOM_SMTP)
        self.assertEqual(smtp.smtp_host, "smtp.example.com")
        self.assertNotEqual(smtp.smtp_password_encrypted, old_secret)
        self.assertEqual(decrypt_secret(smtp.smtp_password_encrypted), "brand-new-smtp")
        self.assertEqual(smtp.status, EmailSenderStatus.READY)

    def test_tenant_isolation_on_gmail_api(self):
        self._save_gmail(group=self.other_group)
        response = self.client.get(f"/api/groups/{self.other_group.id}/email-sender/")
        self.assertEqual(response.status_code, 404)
        response = self.client.put(
            f"/api/groups/{self.other_group.id}/email-sender/",
            {
                "provider": "gmail",
                "gmail_address": "evil@gmail.com",
                "smtp_password": "stolenpasswordxx",
                "change_password": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_api_save_gmail_and_test(self):
        payload = {
            "provider": "gmail",
            "gmail_address": "api@gmail.com",
            "from_name": "API Group",
            "smtp_password": "aaaa bbbb cccc dddd",
            "change_password": True,
        }
        untested = self.client.put(
            f"/api/groups/{self.group.id}/email-sender/",
            payload,
            format="json",
        )
        self.assertEqual(untested.status_code, 400)
        self.assertIn("test email", str(untested.data).lower())

        with patch("groups.email_providers.smtp_transport.smtp_send"):
            test = self.client.post(
                f"/api/groups/{self.group.id}/email-sender/test/",
                {**payload, "to_email": "owner-gmail-sender@example.com"},
                format="json",
            )
            self.assertEqual(test.status_code, 200)
            self.assertTrue(test.data["draft_verified"])
            self.assertEqual(test.data["email_sender"]["status"], EmailSenderStatus.NOT_CONFIGURED)
            saved = self.client.put(
                f"/api/groups/{self.group.id}/email-sender/",
                payload,
                format="json",
            )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.data["provider"], "gmail")
        self.assertEqual(saved.data["status"], EmailSenderStatus.READY)
        self.assertEqual(saved.data["gmail_address"], "api@gmail.com")
        self.assertEqual(saved.data["from_email"], "api@gmail.com")
        self.assertEqual(saved.data["smtp_host"], "")
        self.assertNotIn("smtp_password", saved.data)
