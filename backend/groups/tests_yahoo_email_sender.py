"""Tests for Group Yahoo Mail App Password email sender provider."""

from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from attendance.models import ActionRecord, ActionType
from attendance.services import perform_action_record_from_kiosk
from core.crypto import decrypt_secret
from groups.email_providers.base import EmailSenderProviderError, get_email_sender_provider
from groups.email_providers.yahoo import (
    SAFE_APP_PASSWORD_RESTRICTED,
    SAFE_AUTH_FAILED,
    SAFE_CONNECT_FAILED,
    SAFE_RECIPIENT_REJECTED,
    SAFE_SENDER_REJECTED,
    SAFE_TLS_FAILED,
    YAHOO_SMTP_HOST,
    YAHOO_SMTP_PORT,
    YAHOO_SMTP_SECURITY,
    normalize_yahoo_app_password,
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
    SECRET_KEY="test-secret-key-for-group-yahoo-sender-suite",
)
class GroupYahooEmailSenderTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner-yahoo-sender@example.com",
            password="password12345",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.organization = Organization.objects.create_with_owner(
            owner=self.owner,
            internal_label="Yahoo Sender Org",
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Yahoo Group",
            check_in_enabled=True,
        )
        self.other_owner = User.objects.create_user(
            email="other-yahoo-sender@example.com",
            password="password12345",
        )
        self.other_owner.email_verified = True
        self.other_owner.save(update_fields=["email_verified"])
        self.other_org = Organization.objects.create_with_owner(
            owner=self.other_owner,
            internal_label="Other Yahoo Org",
        )
        self.other_group = Group.objects.create_group(
            organization=self.other_org,
            name="Other Yahoo Group",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def _save_yahoo(self, group=None, **overrides):
        payload = {
            "provider": "yahoo",
            "yahoo_email": "team@yahoo.com",
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

    def _save_gmail(self, group=None, **overrides):
        payload = {
            "provider": "gmail",
            "gmail_address": "team@gmail.com",
            "from_name": "Gmail Name",
            "smtp_password": "gmail appp pass wordx",
            "change_password": True,
        }
        payload.update(overrides)
        group = payload.pop("group", None) or group or self.group
        with patch("groups.email_providers.smtp_transport.smtp_send"):
            return save_verified_email_sender(group=group, **payload)

    def _save_microsoft(self, group=None, **overrides):
        payload = {
            "provider": "microsoft",
            "microsoft_email": "team@contoso.com",
            "from_name": "Microsoft Name",
            "smtp_password": "ms-secret-password",
            "change_password": True,
        }
        payload.update(overrides)
        group = payload.pop("group", None) or group or self.group
        with patch("groups.email_providers.smtp_transport.smtp_send"):
            return save_verified_email_sender(group=group, **payload)

    def test_provider_registry_resolves_yahoo(self):
        yahoo = get_email_sender_provider(EmailSenderProviderKind.YAHOO)
        self.assertEqual(yahoo.kind, EmailSenderProviderKind.YAHOO)

    def test_normalize_app_password_strips_spaces_only(self):
        self.assertEqual(
            normalize_yahoo_app_password("abcd efgh ijkl mnop"),
            "abcdefghijklmnop",
        )
        self.assertEqual(
            normalize_yahoo_app_password("ab-cd_ef"),
            "ab-cd_ef",
        )

    def test_yahoo_requires_email_and_app_password(self):
        with self.assertRaises(ValidationError) as missing_address:
            save_group_email_sender(
                group=self.group,
                provider="yahoo",
                yahoo_email="",
                smtp_password="abcdefghijklmnop",
                change_password=True,
            )
        self.assertIn("yahoo_email", missing_address.exception.message_dict)

        with self.assertRaises(ValidationError) as missing_password:
            save_group_email_sender(
                group=self.group,
                provider="yahoo",
                yahoo_email="team@yahoo.com",
                smtp_password="",
                change_password=True,
            )
        self.assertIn("smtp_password", missing_password.exception.message_dict)

    def test_yahoo_accepts_non_yahoo_com_domains(self):
        sender = self._save_yahoo(yahoo_email="legacy@ymail.com")
        self.assertEqual(sender.from_email, "legacy@ymail.com")
        self.assertEqual(sender.smtp_username, "legacy@ymail.com")

    def test_yahoo_does_not_require_or_expose_technical_smtp_fields(self):
        sender = self._save_yahoo()
        self.assertEqual(sender.provider, EmailSenderProviderKind.YAHOO)
        self.assertEqual(sender.smtp_host, "")
        self.assertIsNone(sender.smtp_port)
        self.assertEqual(sender.smtp_security, "")
        self.assertEqual(sender.from_email, "team@yahoo.com")
        self.assertEqual(sender.smtp_username, "team@yahoo.com")
        payload = self.client.get(f"/api/groups/{self.group.id}/email-sender/").data
        self.assertEqual(payload["yahoo_email"], "team@yahoo.com")
        self.assertEqual(payload["from_email"], "team@yahoo.com")
        self.assertEqual(payload["smtp_host"], "")
        self.assertIsNone(payload["smtp_port"])
        self.assertEqual(payload["smtp_security"], "")
        self.assertEqual(payload["smtp_username"], "")

    def test_app_password_encrypted_never_serialized_and_spaces_stripped(self):
        sender = self._save_yahoo(smtp_password="abcd efgh ijkl mnop")
        self.assertEqual(decrypt_secret(sender.smtp_password_encrypted), "abcdefghijklmnop")
        response = self.client.get(f"/api/groups/{self.group.id}/email-sender/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["password_configured"])
        self.assertNotIn("smtp_password", response.data)
        self.assertNotIn("smtp_password_encrypted", response.data)
        body = str(response.content)
        self.assertNotIn("abcdefghijklmnop", body)
        self.assertNotIn("abcd efgh", body)

    def test_non_secret_update_preserves_app_password_and_ready(self):
        sender = self._save_yahoo()
        encrypted = sender.smtp_password_encrypted
        updated = save_group_email_sender(
            group=self.group,
            provider="yahoo",
            from_name="Updated Display",
        )
        self.assertEqual(updated.smtp_password_encrypted, encrypted)
        self.assertEqual(updated.from_name, "Updated Display")
        self.assertEqual(updated.status, EmailSenderStatus.READY)

    def test_changing_app_password_requires_verification_then_ready(self):
        sender = self._save_yahoo()
        with self.assertRaises(ValidationError) as raised:
            save_group_email_sender(
                group=self.group,
                provider="yahoo",
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

        updated = self._save_yahoo(smtp_password="zzzz yyyy xxxx wwww")
        self.assertEqual(decrypt_secret(updated.smtp_password_encrypted), "zzzzyyyyxxxxwwww")
        self.assertEqual(updated.status, EmailSenderStatus.READY)

    def test_yahoo_email_change_requires_verification_then_ready(self):
        sender = self._save_yahoo()
        with self.assertRaises(ValidationError) as raised:
            save_group_email_sender(
                group=self.group,
                provider="yahoo",
                yahoo_email="other@yahoo.com",
            )
        self.assertIn(
            "test email before saving",
            raised.exception.message_dict["detail"][0].lower(),
        )
        sender.refresh_from_db()
        self.assertEqual(sender.from_email, "team@yahoo.com")
        self.assertEqual(sender.status, EmailSenderStatus.READY)

        updated = self._save_yahoo(yahoo_email="other@yahoo.com")
        self.assertEqual(updated.status, EmailSenderStatus.READY)
        self.assertEqual(updated.from_email, "other@yahoo.com")

    def test_save_without_verification_rejected(self):
        with self.assertRaises(ValidationError) as raised:
            save_group_email_sender(
                group=self.group,
                provider="yahoo",
                yahoo_email="team@yahoo.com",
                from_name="Check Station Group",
                smtp_password="abcd efgh ijkl mnop",
                change_password=True,
            )
        self.assertIn(
            "test email before saving",
            raised.exception.message_dict["detail"][0].lower(),
        )
        self.assertFalse(GroupEmailSender.objects.filter(group=self.group).exists())

    @patch("groups.email_providers.smtp_transport.smtp_send")
    def test_successful_test_uses_yahoo_transport(self, mock_send):
        self._save_yahoo()
        sender = send_group_email_sender_test(
            group=self.group,
            to_email="tester@example.com",
        )
        self.assertEqual(sender.status, EmailSenderStatus.READY)
        mock_send.assert_called_once()
        kwargs = mock_send.call_args.kwargs
        self.assertEqual(kwargs["host"], YAHOO_SMTP_HOST)
        self.assertEqual(kwargs["port"], YAHOO_SMTP_PORT)
        self.assertEqual(kwargs["security"], YAHOO_SMTP_SECURITY)
        self.assertEqual(kwargs["username"], "team@yahoo.com")
        self.assertEqual(kwargs["password"], "abcdefghijklmnop")
        self.assertEqual(YAHOO_SMTP_HOST, "smtp.mail.yahoo.com")
        self.assertEqual(YAHOO_SMTP_PORT, 465)
        delivery = GroupEmailDelivery.objects.filter(event_type="test").latest("id")
        self.assertEqual(delivery.status, GroupEmailDeliveryStatus.SENT)

    @patch(
        "groups.email_providers.smtp_transport.smtp_send",
        side_effect=Exception("535 Authentication failed"),
    )
    def test_auth_failure_safe_yahoo_message(self, _mock_send):
        self._save_yahoo()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(raised.exception.message_dict["detail"], [SAFE_AUTH_FAILED])
        sender = GroupEmailSender.objects.get(group=self.group)
        self.assertEqual(sender.status, EmailSenderStatus.ERROR)
        self.assertEqual(sender.last_test_error, SAFE_AUTH_FAILED)

    @patch(
        "groups.email_providers.smtp_transport.smtp_send",
        side_effect=Exception(
            "535 5.7.1 Please use your App Password. Web login required."
        ),
    )
    def test_app_password_restriction_safe_message(self, _mock_send):
        self._save_yahoo()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(
            raised.exception.message_dict["detail"],
            [SAFE_APP_PASSWORD_RESTRICTED],
        )

    @patch(
        "groups.email_providers.smtp_transport.smtp_send",
        side_effect=ConnectionRefusedError("connection refused"),
    )
    def test_connection_failure_safe_yahoo_message(self, _mock_send):
        self._save_yahoo()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(
            raised.exception.message_dict["detail"],
            [SAFE_CONNECT_FAILED],
        )

    @patch(
        "groups.email_providers.smtp_transport.smtp_send",
        side_effect=__import__("ssl").SSLError("TLS handshake failed"),
    )
    def test_tls_failure_safe_yahoo_message(self, _mock_send):
        self._save_yahoo()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(raised.exception.message_dict["detail"], [SAFE_TLS_FAILED])

    @patch(
        "groups.email_providers.smtp_transport.smtp_send",
        side_effect=__import__("smtplib").SMTPSenderRefused(
            550, b"Sender rejected", "team@yahoo.com"
        ),
    )
    def test_sender_rejection_safe_yahoo_message(self, _mock_send):
        self._save_yahoo()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(
            raised.exception.message_dict["detail"],
            [SAFE_SENDER_REJECTED],
        )

    @patch(
        "groups.email_providers.smtp_transport.smtp_send",
        side_effect=__import__("smtplib").SMTPRecipientsRefused(
            {"bad@example.com": (550, b"User unknown")}
        ),
    )
    def test_recipient_rejection_safe_yahoo_message(self, _mock_send):
        self._save_yahoo()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="bad@example.com")
        self.assertEqual(
            raised.exception.message_dict["detail"],
            [SAFE_RECIPIENT_REJECTED],
        )

    def test_after_action_send_via_yahoo(self):
        self._save_yahoo()
        self.group.send_email_after_check_in = True
        self.group.require_email = True
        self.group.save()
        member = Member.objects.create(
            organization=self.organization,
            name="Yahoo Participant",
            email="member-profile@example.com",
        )
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=member,
            participation_email="participation@example.com",
        )
        with patch(
            "groups.email_providers.yahoo.YahooProvider.send_messages_batch",
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

    def test_yahoo_failure_does_not_rollback_action(self):
        self._save_yahoo()
        self.group.send_email_after_check_in = True
        self.group.save()
        member = Member.objects.create(
            organization=self.organization,
            name="Fail Yahoo",
        )
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=member,
            participation_email="fail@example.com",
        )
        with patch(
            "groups.email_providers.yahoo.YahooProvider.send_messages_batch",
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

    def test_switch_smtp_to_yahoo_clears_obsolete_secret(self):
        smtp = self._save_smtp()
        old_secret = smtp.smtp_password_encrypted
        yahoo = self._save_yahoo(smtp_password="neww appp pass wordx")
        self.assertEqual(yahoo.provider, EmailSenderProviderKind.YAHOO)
        self.assertEqual(yahoo.smtp_host, "")
        self.assertNotEqual(yahoo.smtp_password_encrypted, old_secret)
        self.assertEqual(decrypt_secret(yahoo.smtp_password_encrypted), "newwappppasswordx")
        self.assertNotEqual(
            decrypt_secret(yahoo.smtp_password_encrypted),
            "smtp-secret-password",
        )
        self.assertEqual(yahoo.status, EmailSenderStatus.READY)

    def test_switch_gmail_to_yahoo_clears_obsolete_secret(self):
        gmail = self._save_gmail()
        old_secret = gmail.smtp_password_encrypted
        yahoo = self._save_yahoo(smtp_password="yahoo appp pass wordx")
        self.assertEqual(yahoo.provider, EmailSenderProviderKind.YAHOO)
        self.assertNotEqual(yahoo.smtp_password_encrypted, old_secret)
        self.assertEqual(decrypt_secret(yahoo.smtp_password_encrypted), "yahooappppasswordx")

    def test_switch_microsoft_to_yahoo_clears_obsolete_secret(self):
        microsoft = self._save_microsoft()
        old_secret = microsoft.smtp_password_encrypted
        yahoo = self._save_yahoo(smtp_password="yahoo appp pass wordx")
        self.assertEqual(yahoo.provider, EmailSenderProviderKind.YAHOO)
        self.assertNotEqual(yahoo.smtp_password_encrypted, old_secret)
        self.assertNotEqual(
            decrypt_secret(yahoo.smtp_password_encrypted),
            "ms-secret-password",
        )

    def test_switch_yahoo_to_smtp_clears_obsolete_secret(self):
        yahoo = self._save_yahoo()
        old_secret = yahoo.smtp_password_encrypted
        smtp = self._save_smtp(smtp_password="brand-new-smtp")
        self.assertEqual(smtp.provider, EmailSenderProviderKind.CUSTOM_SMTP)
        self.assertEqual(smtp.smtp_host, "smtp.example.com")
        self.assertNotEqual(smtp.smtp_password_encrypted, old_secret)
        self.assertEqual(decrypt_secret(smtp.smtp_password_encrypted), "brand-new-smtp")

    def test_switch_yahoo_to_gmail_clears_obsolete_secret(self):
        yahoo = self._save_yahoo()
        old_secret = yahoo.smtp_password_encrypted
        gmail = self._save_gmail(smtp_password="fresh gmail pass word")
        self.assertEqual(gmail.provider, EmailSenderProviderKind.GMAIL)
        self.assertNotEqual(gmail.smtp_password_encrypted, old_secret)

    def test_switch_yahoo_to_microsoft_clears_obsolete_secret(self):
        yahoo = self._save_yahoo()
        old_secret = yahoo.smtp_password_encrypted
        microsoft = self._save_microsoft(smtp_password="fresh-ms-password")
        self.assertEqual(microsoft.provider, EmailSenderProviderKind.MICROSOFT)
        self.assertNotEqual(microsoft.smtp_password_encrypted, old_secret)

    def test_tenant_isolation_on_yahoo_api(self):
        self._save_yahoo(group=self.other_group)
        response = self.client.get(f"/api/groups/{self.other_group.id}/email-sender/")
        self.assertEqual(response.status_code, 404)
        response = self.client.put(
            f"/api/groups/{self.other_group.id}/email-sender/",
            {
                "provider": "yahoo",
                "yahoo_email": "evil@yahoo.com",
                "smtp_password": "stolenpasswordxx",
                "change_password": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_api_save_yahoo_and_test(self):
        payload = {
            "provider": "yahoo",
            "yahoo_email": "api@yahoo.com",
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
                {**payload, "to_email": "owner-yahoo-sender@example.com"},
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
        self.assertEqual(saved.data["provider"], "yahoo")
        self.assertEqual(saved.data["status"], EmailSenderStatus.READY)
        self.assertEqual(saved.data["yahoo_email"], "api@yahoo.com")
        self.assertEqual(saved.data["from_email"], "api@yahoo.com")
        self.assertEqual(saved.data["smtp_host"], "")
        self.assertNotIn("smtp_password", saved.data)
