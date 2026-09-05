"""Async Group email outbox + SMTP destination hardening tests."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from attendance.models import ActionRecord, ActionType
from attendance.services import perform_action_record_from_kiosk
from groups.email_outbox import (
    claim_due_jobs,
    classify_smtp_failure_retryable,
    enqueue_after_action_email_outbox,
    process_due_email_outbox,
    process_outbox_job,
    reclaim_stale_processing,
)
from groups.email_providers.base import EmailSenderProviderError
from groups.email_providers.smtp_destination import (
    ALLOWED_CUSTOM_SMTP_PORTS,
    assert_allowed_custom_smtp_port,
    assert_public_smtp_host,
    sanitize_email_header_value,
)
from groups.email_providers.smtp_transport import build_email_message
from groups.email_sender_models import (
    GroupEmailDelivery,
    GroupEmailDeliveryStatus,
    GroupEmailOutboxJob,
    GroupEmailOutboxStatus,
)
from groups.email_sender_testing import (
    GROUP_EMAIL_CRYPTO_TEST_SETTINGS,
    flush_email_outbox,
    mock_batch_send_fail_for,
    mock_batch_send_success,
    save_verified_email_sender,
)
from groups.models import Group, GroupMembership
from members.models import Member
from organizations.models import Organization


@override_settings(**GROUP_EMAIL_CRYPTO_TEST_SETTINGS)
class EmailOutboxKioskTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="outbox-owner@example.com", password="password12345"
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.org = Organization.objects.create_with_owner(
            owner=self.owner, internal_label="Outbox Org"
        )
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Outbox Group",
            check_in_enabled=True,
        )
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            save_verified_email_sender(
                group=self.group,
                provider="custom_smtp",
                smtp_host="smtp.example.com",
                smtp_port=587,
                smtp_security="starttls",
                smtp_username="user@example.com",
                from_email="from@example.com",
                from_name="Outbox",
                smtp_password="secret-password",
            )
        self.group.send_email_after_check_in = True
        self.group.save(update_fields=["send_email_after_check_in", "updated_at"])
        self.member = Member.objects.create(
            organization=self.org, name="Kid Checkin"
        )
        self.membership = GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=self.member,
            participation_email="kid@example.com",
        )

    def test_kiosk_action_enqueues_without_smtp(self):
        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_success,
        ) as mock_send:
            ar = perform_action_record_from_kiosk(
                group=self.group,
                action_type=ActionType.CHECK_IN,
                participant_kind="member",
                membership=self.membership,
            )
            mock_send.assert_not_called()
        self.assertTrue(ActionRecord.objects.filter(pk=ar.pk).exists())
        job = GroupEmailOutboxJob.objects.get(action_record=ar)
        self.assertEqual(job.status, GroupEmailOutboxStatus.PENDING)
        self.assertEqual(job.event_type, "check_in")
        self.assertFalse(
            GroupEmailDelivery.objects.filter(action_record=ar).exists()
        )

    def test_rollback_removes_outbox_job(self):
        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                ar = ActionRecord.objects.create(
                    organization=self.org,
                    group=self.group,
                    source_group_id=self.group.pk,
                    participant_kind="member",
                    member=self.member,
                    action_type=ActionType.CHECK_IN,
                    source="kiosk",
                    performed_at=timezone.now(),
                    participant_name_snapshot="Kid",
                    group_name_snapshot=self.group.name,
                    group_type_snapshot=self.group.group_type,
                )
                enqueue_after_action_email_outbox(
                    group=self.group,
                    action_type=ActionType.CHECK_IN,
                    action_record=ar,
                    membership=self.membership,
                )
                self.assertTrue(
                    GroupEmailOutboxJob.objects.filter(action_record=ar).exists()
                )
                raise RuntimeError("boom")
        self.assertEqual(GroupEmailOutboxJob.objects.count(), 0)
        self.assertEqual(ActionRecord.objects.count(), 0)

    def test_worker_sends_and_marks_succeeded(self):
        ar = perform_action_record_from_kiosk(
            group=self.group,
            action_type=ActionType.CHECK_IN,
            participant_kind="member",
            membership=self.membership,
        )
        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_success,
        ) as mock_send:
            result = flush_email_outbox()
            mock_send.assert_called_once()
        self.assertEqual(result["succeeded"], 1)
        job = GroupEmailOutboxJob.objects.get(action_record=ar)
        self.assertEqual(job.status, GroupEmailOutboxStatus.SUCCEEDED)
        delivery = GroupEmailDelivery.objects.get(action_record=ar)
        self.assertEqual(delivery.status, GroupEmailDeliveryStatus.SENT)
        self.assertEqual(delivery.recipient, "kid@example.com")

    def test_temporary_failure_schedules_retry_then_succeeds(self):
        ar = perform_action_record_from_kiosk(
            group=self.group,
            action_type=ActionType.CHECK_IN,
            participant_kind="member",
            membership=self.membership,
        )
        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_fail_for(
                "kid@example.com", error_message="Could not connect to the SMTP server."
            ),
        ):
            process_due_email_outbox()
        job = GroupEmailOutboxJob.objects.get(action_record=ar)
        self.assertEqual(job.status, GroupEmailOutboxStatus.PENDING)
        self.assertEqual(job.attempt_count, 1)
        self.assertGreater(job.available_at, timezone.now())
        self.assertTrue(ActionRecord.objects.filter(pk=ar.pk).exists())

        job.available_at = timezone.now() - timedelta(seconds=1)
        job.save(update_fields=["available_at", "updated_at"])
        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_success,
        ):
            process_due_email_outbox()
        job.refresh_from_db()
        self.assertEqual(job.status, GroupEmailOutboxStatus.SUCCEEDED)
        self.assertEqual(
            GroupEmailDelivery.objects.filter(
                action_record=ar, status=GroupEmailDeliveryStatus.SENT
            ).count(),
            1,
        )

    def test_permanent_auth_failure_is_terminal(self):
        ar = perform_action_record_from_kiosk(
            group=self.group,
            action_type=ActionType.CHECK_IN,
            participant_kind="member",
            membership=self.membership,
        )
        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_fail_for(
                "kid@example.com",
                error_message="SMTP authentication failed. Check your username and password.",
            ),
        ):
            process_due_email_outbox()
        job = GroupEmailOutboxJob.objects.get(action_record=ar)
        self.assertEqual(job.status, GroupEmailOutboxStatus.FAILED)
        self.assertTrue(ActionRecord.objects.filter(pk=ar.pk).exists())

    def test_stale_processing_reclaimed(self):
        ar = perform_action_record_from_kiosk(
            group=self.group,
            action_type=ActionType.CHECK_IN,
            participant_kind="member",
            membership=self.membership,
        )
        job = GroupEmailOutboxJob.objects.get(action_record=ar)
        job.status = GroupEmailOutboxStatus.PROCESSING
        job.processing_started_at = timezone.now() - timedelta(minutes=20)
        job.save(
            update_fields=["status", "processing_started_at", "updated_at"]
        )
        reclaimed = reclaim_stale_processing()
        self.assertEqual(reclaimed, 1)
        job.refresh_from_db()
        self.assertEqual(job.status, GroupEmailOutboxStatus.PENDING)

    def test_duplicate_enqueue_unique(self):
        ar = perform_action_record_from_kiosk(
            group=self.group,
            action_type=ActionType.CHECK_IN,
            participant_kind="member",
            membership=self.membership,
        )
        second = enqueue_after_action_email_outbox(
            group=self.group,
            action_type=ActionType.CHECK_IN,
            action_record=ar,
            membership=self.membership,
        )
        self.assertEqual(GroupEmailOutboxJob.objects.filter(action_record=ar).count(), 1)
        self.assertEqual(second.pk, GroupEmailOutboxJob.objects.get(action_record=ar).pk)

    def test_duplicate_worker_claim_skipped(self):
        perform_action_record_from_kiosk(
            group=self.group,
            action_type=ActionType.CHECK_IN,
            participant_kind="member",
            membership=self.membership,
        )
        first = claim_due_jobs(limit=1)
        second = claim_due_jobs(limit=1)
        self.assertEqual(len(first), 1)
        self.assertEqual(len(second), 0)

    def test_outbox_payload_has_no_secrets(self):
        ar = perform_action_record_from_kiosk(
            group=self.group,
            action_type=ActionType.CHECK_IN,
            participant_kind="member",
            membership=self.membership,
        )
        job = GroupEmailOutboxJob.objects.get(action_record=ar)
        blob = str(job.__dict__)
        self.assertNotIn("secret-password", blob)
        self.assertFalse(hasattr(job, "smtp_password"))
        field_names = {f.name for f in GroupEmailOutboxJob._meta.get_fields()}
        self.assertNotIn("smtp_password", field_names)
        self.assertNotIn("smtp_password_encrypted", field_names)


class SmtpDestinationSecurityTests(TestCase):
    def test_ports_allowlist(self):
        for port in ALLOWED_CUSTOM_SMTP_PORTS:
            self.assertEqual(assert_allowed_custom_smtp_port(port), port)
        with self.assertRaises(ValidationError):
            assert_allowed_custom_smtp_port(25)
        with self.assertRaises(ValidationError):
            assert_allowed_custom_smtp_port(2526)

    def test_literal_blocked_hosts(self):
        for host in (
            "127.0.0.1",
            "10.0.0.5",
            "192.168.1.1",
            "172.16.0.1",
            "169.254.169.254",
            "100.64.1.1",
            "::1",
            "fe80::1",
            "fc00::1",
            "localhost",
        ):
            with self.assertRaises(ValidationError):
                assert_public_smtp_host(host)

    def test_header_sanitization(self):
        dirty = "Name\r\nBcc: evil@example.com"
        clean = sanitize_email_header_value(dirty)
        self.assertNotIn("\r", clean)
        self.assertNotIn("\n", clean)
        self.assertEqual(clean, "Name Bcc: evil@example.com")
        message = build_email_message(
            from_email="from@example.com",
            from_name=dirty,
            to_email="to@example.com",
            subject="Hello\nInjected",
            text_body="body",
        )
        self.assertNotIn("\n", message["From"])
        self.assertNotIn("\n", message["Subject"])

    def test_retry_classification(self):
        self.assertTrue(
            classify_smtp_failure_retryable(
                EmailSenderProviderError(
                    "Could not connect to the SMTP server.",
                    diagnostic={"exception": "TimeoutError", "code": None},
                )
            )
        )
        self.assertFalse(
            classify_smtp_failure_retryable(
                EmailSenderProviderError(
                    "SMTP authentication failed. Check your username and password.",
                    diagnostic={"exception": "SMTPAuthenticationError", "code": 535},
                )
            )
        )


@override_settings(
    **GROUP_EMAIL_CRYPTO_TEST_SETTINGS,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "group-email-test-rate-limit",
        }
    },
)
class EmailSenderTestRateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(
            email="rate-smtp@example.com", password="password12345"
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.org = Organization.objects.create_with_owner(
            owner=self.owner, internal_label="Rate SMTP"
        )
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Rate Group",
            check_in_enabled=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    @override_settings(
        GROUP_EMAIL_TEST_RATE_LIMIT_USER=2,
        GROUP_EMAIL_TEST_RATE_LIMIT_GROUP=100,
        GROUP_EMAIL_TEST_RATE_LIMIT_IP=100,
        GROUP_EMAIL_TEST_RATE_LIMIT_WINDOW_SECONDS=3600,
    )
    def test_test_email_rate_limited(self):
        url = f"/api/groups/{self.group.id}/email-sender/test/"
        payload = {
            "provider": "custom_smtp",
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_security": "starttls",
            "smtp_username": "user@example.com",
            "from_email": "from@example.com",
            "smtp_password": "secret",
            "change_password": True,
            "to_email": "tester@example.com",
        }
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            first = self.client.post(url, payload, format="json")
            second = self.client.post(url, payload, format="json")
            third = self.client.post(url, payload, format="json")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(third.status_code, 429, third.data)
        self.assertEqual(third.data["code"], "rate_limited")
