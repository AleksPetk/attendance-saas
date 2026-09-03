"""Focused tests for Custom SMTP connection modes and safe errors."""

import smtplib
import ssl
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase, TestCase, override_settings

from accounts.models import User
from groups.email_providers.custom_smtp import (
    SAFE_AUTH_FAILED,
    SAFE_CONNECT_FAILED,
    SAFE_RECIPIENT_REFUSED,
    SAFE_SENDER_NOT_OWNED,
    SAFE_TLS_FAILED,
    CustomSMTPProvider,
    _classify_smtp_error,
)
from groups.email_sender import send_group_email_sender_test
from groups.email_sender_models import SmtpSecurity
from groups.email_sender_testing import save_verified_email_sender
from groups.models import Group
from organizations.models import Organization


class SmtpErrorClassificationTests(SimpleTestCase):
    def test_auth_failure_message(self):
        public, _ = _classify_smtp_error(
            smtplib.SMTPAuthenticationError(535, b"auth failed"),
            password="secret",
        )
        self.assertEqual(public, SAFE_AUTH_FAILED)
        self.assertNotIn("secret", public)

    def test_tls_mismatch_message(self):
        public, _ = _classify_smtp_error(
            ssl.SSLError(1, "[SSL: WRONG_VERSION_NUMBER] wrong version number"),
            security=SmtpSecurity.SSL,
        )
        self.assertEqual(public, SAFE_TLS_FAILED)

    def test_starttls_timeout_maps_to_secure_connection_hint(self):
        public, _ = _classify_smtp_error(
            smtplib.SMTPServerDisconnected("Connection unexpectedly closed: timed out"),
            security=SmtpSecurity.STARTTLS,
        )
        self.assertEqual(public, SAFE_TLS_FAILED)

    def test_dns_failure_maps_to_connect(self):
        import socket

        public, _ = _classify_smtp_error(
            socket.gaierror(8, "nodename nor servname provided, or not known")
        )
        self.assertEqual(public, SAFE_CONNECT_FAILED)

    def test_hostinger_style_sender_not_owned_via_recipients_refused(self):
        refused = smtplib.SMTPRecipientsRefused(
            {
                "maiandaleks@gmail.com": (
                    553,
                    b"5.7.1 <checkstation@sels.com>: Sender address rejected: "
                    b"not owned by user checkstation@sels.jp",
                )
            }
        )
        public, diagnostic = _classify_smtp_error(
            refused,
            security=SmtpSecurity.SSL,
            stage="send_message",
        )
        self.assertEqual(public, SAFE_SENDER_NOT_OWNED)
        self.assertEqual(diagnostic["code"], 553)
        self.assertIn("Sender address rejected", diagnostic["response"])
        self.assertEqual(diagnostic["stage"], "send_message")

    def test_true_recipient_refusal_stays_recipient_message(self):
        refused = smtplib.SMTPRecipientsRefused(
            {"bad@example.com": (550, b"5.1.1 User unknown")}
        )
        public, diagnostic = _classify_smtp_error(refused, stage="send_message")
        self.assertEqual(public, SAFE_RECIPIENT_REFUSED)
        self.assertEqual(diagnostic["code"], 550)


@override_settings(
    DEBUG=True,
    APP_SECRETS_ENCRYPTION_KEY="",
    SECRET_KEY="test-secret-key-for-smtp-modes",
)
class CustomSMTPConnectionModeTests(TestCase):
    def setUp(self):
        owner = User.objects.create_user(
            email="smtp-modes@example.com",
            password="password12345",
        )
        owner.email_verified = True
        owner.save(update_fields=["email_verified"])
        self.organization = Organization.objects.create_with_owner(
            owner=owner,
            internal_label="SMTP Modes",
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="SMTP Modes Group",
        )
        self.provider = CustomSMTPProvider()

    def _sender(self, *, security, port):
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            return save_verified_email_sender(
                group=self.group,
                provider="custom_smtp",
                smtp_host="smtp.example.com",
                smtp_port=port,
                smtp_security=security,
                smtp_username="user@example.com",
                from_email="from@example.com",
                smtp_password="secret-password",
                change_password=True,
            )

    def _message(self):
        return SimpleNamespace()

    @patch("groups.email_providers.smtp_transport.smtplib.SMTP_SSL")
    @patch("groups.email_providers.smtp_transport.smtplib.SMTP")
    def test_ssl_tls_uses_smtp_ssl_not_starttls(self, mock_smtp, mock_ssl):
        sender = self._sender(security=SmtpSecurity.SSL, port=465)
        ssl_client = MagicMock()
        mock_ssl.return_value.__enter__.return_value = ssl_client

        self.provider._smtp_send(
            sender,
            self._message(),
            password="secret-password",
            envelope_from="from@example.com",
            envelope_to="tester@example.com",
        )

        mock_ssl.assert_called_once()
        self.assertEqual(mock_ssl.call_args.args[:2], ("smtp.example.com", 465))
        mock_smtp.assert_not_called()
        ssl_client.starttls.assert_not_called()
        ssl_client.login.assert_called_once()
        ssl_client.send_message.assert_called_once()
        kwargs = ssl_client.send_message.call_args.kwargs
        self.assertEqual(kwargs["from_addr"], "from@example.com")
        self.assertEqual(kwargs["to_addrs"], ["tester@example.com"])

    @patch("groups.email_providers.smtp_transport.smtplib.SMTP_SSL")
    @patch("groups.email_providers.smtp_transport.smtplib.SMTP")
    def test_starttls_uses_smtp_then_starttls(self, mock_smtp, mock_ssl):
        sender = self._sender(security=SmtpSecurity.STARTTLS, port=587)
        plain = MagicMock()
        mock_smtp.return_value.__enter__.return_value = plain

        self.provider._smtp_send(
            sender,
            self._message(),
            password="secret-password",
            envelope_from="from@example.com",
            envelope_to="tester@example.com",
        )

        mock_smtp.assert_called_once()
        self.assertEqual(mock_smtp.call_args.args[:2], ("smtp.example.com", 587))
        mock_ssl.assert_not_called()
        plain.ehlo.assert_called()
        plain.starttls.assert_called_once()
        plain.login.assert_called_once()
        plain.send_message.assert_called_once()
        kwargs = plain.send_message.call_args.kwargs
        self.assertEqual(kwargs["from_addr"], "from@example.com")
        self.assertEqual(kwargs["to_addrs"], ["tester@example.com"])

    @patch(
        "groups.email_providers.smtp_transport.smtplib.SMTP",
        side_effect=smtplib.SMTPServerDisconnected(
            "Connection unexpectedly closed: timed out"
        ),
    )
    def test_starttls_on_ssl_port_safe_error(self, _mock_smtp):
        sender = self._sender(security=SmtpSecurity.STARTTLS, port=465)
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(raised.exception.message_dict["detail"], [SAFE_TLS_FAILED])
        self.assertNotIn("secret-password", str(raised.exception))

    @patch("groups.email_providers.smtp_transport.smtplib.SMTP_SSL")
    def test_ssl_auth_failure_safe_error(self, mock_ssl):
        self._sender(security=SmtpSecurity.SSL, port=465)
        ssl_client = MagicMock()
        ssl_client.login.side_effect = smtplib.SMTPAuthenticationError(
            535, b"Invalid login"
        )
        mock_ssl.return_value.__enter__.return_value = ssl_client
        with self.assertRaises(ValidationError) as raised:
            send_group_email_sender_test(group=self.group, to_email="tester@example.com")
        self.assertEqual(raised.exception.message_dict["detail"], [SAFE_AUTH_FAILED])


@override_settings(
    DEBUG=True,
    APP_SECRETS_ENCRYPTION_KEY="",
    SECRET_KEY="test-secret-key-for-smtp-batch",
)
class SmtpBatchConnectionReuseTests(TestCase):
    def setUp(self):
        owner = User.objects.create_user(
            email="smtp-batch@example.com",
            password="password12345",
        )
        owner.email_verified = True
        owner.save(update_fields=["email_verified"])
        self.organization = Organization.objects.create_with_owner(
            owner=owner,
            internal_label="SMTP Batch",
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="SMTP Batch Group",
        )
        self.provider = CustomSMTPProvider()

    def _sender(self):
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            return save_verified_email_sender(
                group=self.group,
                provider="custom_smtp",
                smtp_host="smtp.example.com",
                smtp_port=587,
                smtp_security=SmtpSecurity.STARTTLS,
                smtp_username="user@example.com",
                from_email="from@example.com",
                smtp_password="secret-password",
                change_password=True,
            )

    @patch("groups.email_providers.smtp_transport.smtplib.SMTP")
    def test_batch_send_reuses_one_connection_for_multiple_recipients(self, mock_smtp):
        sender = self._sender()
        plain = MagicMock()
        mock_smtp.return_value.__enter__.return_value = plain
        messages = [
            {
                "to_email": "one@example.com",
                "subject": "Subject",
                "text_body": "Body",
                "html_body": "<p>Body</p>",
            },
            {
                "to_email": "two@example.com",
                "subject": "Subject",
                "text_body": "Body",
                "html_body": "<p>Body</p>",
            },
        ]

        results = self.provider.send_messages_batch(sender, messages=messages)

        mock_smtp.assert_called_once()
        self.assertEqual(plain.login.call_count, 1)
        self.assertEqual(plain.send_message.call_count, 2)
        self.assertEqual(
            [item["to_email"] for item in results],
            ["one@example.com", "two@example.com"],
        )
        self.assertTrue(all(item["ok"] for item in results))
