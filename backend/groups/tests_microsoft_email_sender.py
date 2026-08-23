"""Tests for Group Outlook / Microsoft 365 email sender provider."""

import smtplib
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from attendance.models import ActionRecord, ActionType
from attendance.services import perform_action_record_from_kiosk
from core.crypto import decrypt_secret
from groups.email_providers.base import EmailSenderProviderError, get_email_sender_provider
from groups.email_providers.microsoft import (
    MICROSOFT_365_SMTP_HOST,
    MICROSOFT_SMTP_PORT,
    MICROSOFT_SMTP_SECURITY,
    OUTLOOK_COM_SMTP_HOST,
    SAFE_AUTH_FAILED,
    SAFE_CONNECT_FAILED,
    SAFE_RECIPIENT_REJECTED,
    SAFE_SMTP_AUTH_DISABLED,
    SAFE_TLS_FAILED,
    resolve_microsoft_smtp_host,
)
from groups.email_sender import (
    email_sender_public_payload,
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
from groups.email_sender_testing import save_verified_email_sender
from groups.models import Group, GroupMembership
from members.models import Member
from organizations.models import Organization


@override_settings(
    SECRET_KEY="test-secret-key-for-group-microsoft-sender-suite",
    APP_SECRETS_ENCRYPTION_KEY="",
)
class GroupMicrosoftEmailSenderTests(TestCase):
    def setUp(self):
        from accounts.models import User

        self.owner = User.objects.create_user(
            email="owner-microsoft-sender@example.com",
            password="password12345",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.organization = Organization.objects.create_with_owner(
            owner=self.owner,
            internal_label="Microsoft Sender Org",
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Microsoft Group",
            check_in_enabled=True,
        )
        self.other_owner = User.objects.create_user(
            email="other-microsoft-sender@example.com",
            password="password12345",
        )
        self.other_owner.email_verified = True
        self.other_owner.save(update_fields=["email_verified"])
        self.other_org = Organization.objects.create_with_owner(
            owner=self.other_owner,
            internal_label="Other Microsoft Org",
        )
        self.other_group = Group.objects.create_group(
            organization=self.other_org,
            name="Other Microsoft Group",
            check_in_enabled=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def _save_microsoft(self, group=None, **overrides):
        payload = {
            "provider": "microsoft",
            "microsoft_email": "team@contoso.com",
            "from_name": "Check Station",
            "smtp_password": "ms-app-password-1",
            "change_password": True,
        }
        payload.update(overrides)
        group = payload.pop("group", None) or group or self.group
        with patch("groups.email_providers.smtp_transport.smtp_send"):
            return save_verified_email_sender(group=group, **payload)

    def _save_gmail(self, **overrides):
        payload = {
            "provider": "gmail",
            "gmail_address": "team@gmail.com",
            "smtp_password": "abcd efgh ijkl mnop",
            "change_password": True,
        }
        payload.update(overrides)
        with patch("groups.email_providers.smtp_transport.smtp_send"):
            return save_verified_email_sender(group=self.group, **payload)

    def _save_smtp(self, **overrides):
        payload = {
            "provider": "custom_smtp",
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_security": "ssl",
            "smtp_username": "smtp-user",
            "from_email": "from@example.com",
            "smtp_password": "smtp-secret-password",
            "change_password": True,
        }
        payload.update(overrides)
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            return save_verified_email_sender(group=self.group, **payload)

    def test_provider_registry_resolves_microsoft(self):
        provider = get_email_sender_provider(EmailSenderProviderKind.MICROSOFT)
        self.assertEqual(provider.kind, EmailSenderProviderKind.MICROSOFT)

    def test_host_resolution_consumer_vs_microsoft_365(self):
        self.assertEqual(
            resolve_microsoft_smtp_host("user@outlook.com"),
            OUTLOOK_COM_SMTP_HOST,
        )
        self.assertEqual(
            resolve_microsoft_smtp_host("user@hotmail.com"),
            OUTLOOK_COM_SMTP_HOST,
        )
        self.assertEqual(
            resolve_microsoft_smtp_host("employee@company.com"),
            MICROSOFT_365_SMTP_HOST,
        )

    def test_microsoft_requires_email_and_password(self):
        with self.assertRaises(ValidationError) as missing_email:
            save_group_email_sender(
                group=self.group,
                provider="microsoft",
                microsoft_email="",
                smtp_password="secret",
                change_password=True,
            )
        self.assertIn("microsoft_email", missing_email.exception.message_dict)

        with self.assertRaises(ValidationError) as missing_password:
            save_group_email_sender(
                group=self.group,
                provider="microsoft",
                microsoft_email="team@contoso.com",
                smtp_password="",
                change_password=True,
            )
        self.assertIn("smtp_password", missing_password.exception.message_dict)

    def test_microsoft_does_not_require_technical_smtp_fields(self):
        sender = self._save_microsoft()
        self.assertEqual(sender.provider, EmailSenderProviderKind.MICROSOFT)
        self.assertEqual(sender.smtp_host, "")
        self.assertIsNone(sender.smtp_port)
        self.assertEqual(sender.smtp_security, "")
        self.assertEqual(sender.from_email, "team@contoso.com")
        self.assertEqual(sender.smtp_username, "team@contoso.com")

    def test_from_email_derives_from_microsoft_account(self):
        sender = self._save_microsoft(microsoft_email="Alias.User@Contoso.COM")
        self.assertEqual(sender.from_email, "alias.user@contoso.com")
        payload = email_sender_public_payload(sender)
        self.assertEqual(payload["microsoft_email"], "alias.user@contoso.com")
        self.assertEqual(payload["from_email"], "alias.user@contoso.com")
        self.assertEqual(payload["smtp_host"], "")
        self.assertEqual(payload["gmail_address"], "")

    def test_secret_encrypted_never_serialized(self):
        sender = self._save_microsoft(smtp_password="plain-secret-value")
        self.assertTrue(sender.password_configured)
        self.assertNotEqual(sender.smtp_password_encrypted, "plain-secret-value")
        self.assertEqual(decrypt_secret(sender.smtp_password_encrypted), "plain-secret-value")
        payload = email_sender_public_payload(sender)
        self.assertNotIn("smtp_password", payload)
        self.assertTrue(payload["password_configured"])

    def test_preserve_secret_on_from_name_only_update(self):
        sender = self._save_microsoft()
        encrypted = sender.smtp_password_encrypted
        updated = save_group_email_sender(
            group=self.group,
            provider="microsoft",
            from_name="New Display",
        )
        self.assertEqual(updated.from_name, "New Display")
        self.assertEqual(updated.smtp_password_encrypted, encrypted)
        self.assertEqual(updated.status, EmailSenderStatus.READY)

    def test_email_or_password_change_requires_verification_then_ready(self):
        sender = self._save_microsoft()
        with self.assertRaises(ValidationError) as raised:
            save_group_email_sender(
                group=self.group,
                provider="microsoft",
                microsoft_email="other@contoso.com",
            )
        self.assertIn(
            "test email before saving",
            raised.exception.message_dict["detail"][0].lower(),
        )
        sender.refresh_from_db()
        self.assertEqual(sender.from_email, "team@contoso.com")
        self.assertEqual(sender.status, EmailSenderStatus.READY)

        updated = self._save_microsoft(microsoft_email="other@contoso.com")
        self.assertEqual(updated.status, EmailSenderStatus.READY)
        self.assertEqual(updated.from_email, "other@contoso.com")

        sender = self._save_microsoft()
        with self.assertRaises(ValidationError) as raised:
            save_group_email_sender(
                group=self.group,
                provider="microsoft",
                smtp_password="replacement-secret",
                change_password=True,
            )
        self.assertIn(
            "test email before saving",
            raised.exception.message_dict["detail"][0].lower(),
        )
        sender.refresh_from_db()
        self.assertEqual(decrypt_secret(sender.smtp_password_encrypted), "ms-app-password-1")

        updated = self._save_microsoft(smtp_password="replacement-secret")
        self.assertEqual(updated.status, EmailSenderStatus.READY)
        self.assertEqual(decrypt_secret(updated.smtp_password_encrypted), "replacement-secret")

    @patch("groups.email_providers.smtp_transport.smtp_send")
    def test_successful_test_uses_microsoft_transport(self, mock_send):
        self._save_microsoft(microsoft_email="ops@contoso.com")
        sender = send_group_email_sender_test(
            group=self.group,
            to_email="tester@example.com",
        )
        self.assertEqual(sender.status, EmailSenderStatus.READY)
        mock_send.assert_called_once()
        kwargs = mock_send.call_args.kwargs
        self.assertEqual(kwargs["host"], MICROSOFT_365_SMTP_HOST)
        self.assertEqual(kwargs["port"], MICROSOFT_SMTP_PORT)
        self.assertEqual(kwargs["security"], MICROSOFT_SMTP_SECURITY)
        self.assertEqual(kwargs["username"], "ops@contoso.com")
        self.assertEqual(kwargs["password"], "ms-app-password-1")

    @patch("groups.email_providers.smtp_transport.smtp_send")
    def test_outlook_com_uses_consumer_smtp_host(self, mock_send):
        self._save_microsoft(microsoft_email="person@outlook.com")
        send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(mock_send.call_args.kwargs["host"], OUTLOOK_COM_SMTP_HOST)

    @patch(
        "groups.email_providers.smtp_transport.smtp_send",
        side_effect=smtplib.SMTPAuthenticationError(535, b"Authentication unsuccessful"),
    )
    def test_auth_failure_safe_message(self, _mock_send):
        self._save_microsoft()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(raised.exception.message_dict["detail"], [SAFE_AUTH_FAILED])

    @patch(
        "groups.email_providers.smtp_transport.smtp_send",
        side_effect=smtplib.SMTPAuthenticationError(
            535,
            b"5.7.57 Client not authenticated to send mail. "
            b"Error: 535 5.7.139 Authentication unsuccessful, "
            b"SmtpClientAuthentication is disabled for the Tenant.",
        ),
    )
    def test_smtp_auth_disabled_safe_message(self, _mock_send):
        self._save_microsoft()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(
            raised.exception.message_dict["detail"],
            [SAFE_SMTP_AUTH_DISABLED],
        )

    @patch(
        "groups.email_providers.smtp_transport.smtp_send",
        side_effect=ConnectionRefusedError("connection refused"),
    )
    def test_connection_failure_safe_message(self, _mock_send):
        self._save_microsoft()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(raised.exception.message_dict["detail"], [SAFE_CONNECT_FAILED])

    @patch(
        "groups.email_providers.smtp_transport.smtp_send",
        side_effect=__import__("ssl").SSLError("certificate verify failed"),
    )
    def test_tls_failure_safe_message(self, _mock_send):
        self._save_microsoft()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(raised.exception.message_dict["detail"], [SAFE_TLS_FAILED])

    @patch(
        "groups.email_providers.smtp_transport.smtp_send",
        side_effect=smtplib.SMTPRecipientsRefused(
            {"bad@example.com": (550, b"User unknown")}
        ),
    )
    def test_recipient_rejection_safe_message(self, _mock_send):
        self._save_microsoft()
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="bad@example.com")
        self.assertEqual(
            raised.exception.message_dict["detail"],
            [SAFE_RECIPIENT_REJECTED],
        )

    def test_after_action_send_via_microsoft(self):
        self._save_microsoft()
        self.group.send_email_after_check_in = True
        self.group.require_email = True
        self.group.save()
        member = Member.objects.create(
            organization=self.organization,
            name="Microsoft Participant",
            email="member-profile@example.com",
        )
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=member,
            participation_email="participation@example.com",
        )
        with patch(
            "groups.email_providers.microsoft.MicrosoftProvider.send_message"
        ) as mock_send:
            ar = perform_action_record_from_kiosk(
                group=self.group,
                action_type=ActionType.CHECK_IN,
                participant_kind="member",
                membership=membership,
            )
            mock_send.assert_called_once()
            self.assertEqual(
                mock_send.call_args.kwargs["to_email"],
                "participation@example.com",
            )
        self.assertTrue(ActionRecord.objects.filter(pk=ar.pk).exists())

    def test_microsoft_failure_does_not_rollback_action(self):
        self._save_microsoft()
        self.group.send_email_after_check_in = True
        self.group.save()
        member = Member.objects.create(
            organization=self.organization,
            name="Fail Microsoft",
        )
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=member,
            participation_email="fail@example.com",
        )
        with patch(
            "groups.email_providers.microsoft.MicrosoftProvider.send_message",
            side_effect=EmailSenderProviderError("Could not send the email"),
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

    def test_switch_gmail_to_microsoft_clears_secret(self):
        gmail = self._save_gmail()
        old_secret = gmail.smtp_password_encrypted
        microsoft = self._save_microsoft(smtp_password="ms-new-secret")
        self.assertEqual(microsoft.provider, EmailSenderProviderKind.MICROSOFT)
        self.assertNotEqual(microsoft.smtp_password_encrypted, old_secret)
        self.assertEqual(decrypt_secret(microsoft.smtp_password_encrypted), "ms-new-secret")
        self.assertNotEqual(
            decrypt_secret(microsoft.smtp_password_encrypted),
            "abcdefghijklmnop",
        )
        self.assertEqual(microsoft.status, EmailSenderStatus.READY)

    def test_switch_smtp_to_microsoft_clears_secret(self):
        smtp = self._save_smtp()
        old_secret = smtp.smtp_password_encrypted
        microsoft = self._save_microsoft(smtp_password="ms-from-smtp")
        self.assertEqual(microsoft.provider, EmailSenderProviderKind.MICROSOFT)
        self.assertEqual(microsoft.smtp_host, "")
        self.assertNotEqual(microsoft.smtp_password_encrypted, old_secret)

    def test_switch_microsoft_to_gmail_clears_secret(self):
        microsoft = self._save_microsoft()
        old_secret = microsoft.smtp_password_encrypted
        gmail = self._save_gmail(smtp_password="neww appp pass wordx")
        self.assertEqual(gmail.provider, EmailSenderProviderKind.GMAIL)
        self.assertNotEqual(gmail.smtp_password_encrypted, old_secret)

    def test_switch_microsoft_to_smtp_clears_secret(self):
        microsoft = self._save_microsoft()
        old_secret = microsoft.smtp_password_encrypted
        smtp = self._save_smtp(smtp_password="brand-new-smtp")
        self.assertEqual(smtp.provider, EmailSenderProviderKind.CUSTOM_SMTP)
        self.assertNotEqual(smtp.smtp_password_encrypted, old_secret)

    def test_tenant_isolation_on_microsoft_api(self):
        self._save_microsoft(group=self.other_group)
        response = self.client.get(f"/api/groups/{self.other_group.id}/email-sender/")
        self.assertEqual(response.status_code, 404)

    def test_api_save_microsoft_and_test(self):
        payload = {
            "provider": "microsoft",
            "microsoft_email": "api@contoso.com",
            "from_name": "API Group",
            "smtp_password": "api-secret-password",
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
                {**payload, "to_email": "owner-microsoft-sender@example.com"},
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
        self.assertEqual(saved.data["provider"], "microsoft")
        self.assertEqual(saved.data["status"], EmailSenderStatus.READY)
        self.assertEqual(saved.data["microsoft_email"], "api@contoso.com")
        self.assertEqual(saved.data["from_email"], "api@contoso.com")
        self.assertEqual(saved.data["smtp_host"], "")
        self.assertNotIn("smtp_password", saved.data)
