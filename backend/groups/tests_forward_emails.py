"""Tests for Group-level Forward Emails configuration and delivery."""

from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from attendance.models import ActionRecord, ActionType
from attendance.services import perform_action_record_from_kiosk
from groups.email_sender_models import (
    GroupEmailDelivery,
    GroupEmailDeliveryStatus,
    GroupEmailRecipientKind,
)
from groups.email_sender_testing import (
    batch_recipients,
    mock_batch_send_fail_for,
    mock_batch_send_success,
    save_verified_email_sender,
)
from groups.forward_emails import (
    normalize_forward_emails,
    unique_after_action_recipients,
)
from groups.models import Group, GroupMembership, GroupType
from groups.serializers import GroupSerializer
from members.models import Member
from organizations.models import Organization, OrganizationPlan


@override_settings(
    DEBUG=True,
    APP_SECRETS_ENCRYPTION_KEY="",
    SECRET_KEY="test-secret-key-for-forward-emails-suite",
)
class ForwardEmailConfigTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner-forward@example.com",
            password="password12345",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.organization = Organization.objects.create_with_owner(
            owner=self.owner,
            internal_label="Forward Emails Org",
        )
        self.organization.plan = OrganizationPlan.PLUS
        self.organization.save(update_fields=["plan"])
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Forward Group",
            check_in_enabled=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def test_a_zero_forwarding_addresses_allowed(self):
        self.assertEqual(normalize_forward_emails([]), [])
        self.assertEqual(normalize_forward_emails(None), [])
        self.group.forward_emails = []
        self.group.save()
        self.group.refresh_from_db()
        self.assertEqual(self.group.forward_emails, [])

    def test_b_one_address(self):
        self.assertEqual(
            normalize_forward_emails(["Office@Example.com"]),
            ["office@example.com"],
        )

    def test_c_two_addresses(self):
        self.assertEqual(
            normalize_forward_emails(["a@example.com", "b@example.com"]),
            ["a@example.com", "b@example.com"],
        )

    def test_d_three_addresses(self):
        emails = ["a@example.com", "b@example.com", "c@example.com"]
        self.assertEqual(normalize_forward_emails(emails), emails)

    def test_e_fourth_rejected(self):
        with self.assertRaises(ValidationError):
            normalize_forward_emails(
                [
                    "a@example.com",
                    "b@example.com",
                    "c@example.com",
                    "d@example.com",
                ]
            )

    def test_f_invalid_email_rejected(self):
        with self.assertRaises(ValidationError):
            normalize_forward_emails(["not-an-email"])

    def test_g_duplicates_rejected_and_case_normalized(self):
        with self.assertRaises(ValidationError):
            normalize_forward_emails(["a@example.com", "A@example.com"])
        self.assertEqual(
            normalize_forward_emails(["  B@Example.COM "]),
            ["b@example.com"],
        )

    def test_h_addresses_persist_through_group_save_update(self):
        serializer = GroupSerializer(
            instance=self.group,
            data={
                "advanced": {
                    "forward_emails": [
                        "office@example.com",
                        "teacher@example.com",
                    ]
                }
            },
            partial=True,
            context={"organization": self.organization},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        group = serializer.save()
        self.assertEqual(
            group.forward_emails,
            ["office@example.com", "teacher@example.com"],
        )
        response = self.client.get(f"/api/groups/{group.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["forward_emails"],
            ["office@example.com", "teacher@example.com"],
        )
        self.assertEqual(
            response.data["advanced"]["forward_emails"],
            ["office@example.com", "teacher@example.com"],
        )

        cleared = GroupSerializer(
            instance=group,
            data={"forward_emails": []},
            partial=True,
            context={"organization": self.organization},
        )
        self.assertTrue(cleared.is_valid(), cleared.errors)
        cleared.save()
        group.refresh_from_db()
        self.assertEqual(group.forward_emails, [])

    def test_api_rejects_four_addresses(self):
        response = self.client.patch(
            f"/api/groups/{self.group.id}/",
            {
                "forward_emails": [
                    "a@example.com",
                    "b@example.com",
                    "c@example.com",
                    "d@example.com",
                ]
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_structured_group_accepts_forward_emails(self):
        structured = Group.objects.create_group(
            organization=self.organization,
            name="Structured Forward",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
        )
        serializer = GroupSerializer(
            instance=structured,
            data={"forward_emails": ["desk@example.com"]},
            partial=True,
            context={"organization": self.organization},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        group = serializer.save()
        self.assertEqual(group.forward_emails, ["desk@example.com"])


@override_settings(
    DEBUG=True,
    APP_SECRETS_ENCRYPTION_KEY="",
    SECRET_KEY="test-secret-key-for-forward-emails-suite",
)
class ForwardEmailDeliveryTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner-forward-delivery@example.com",
            password="password12345",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.organization = Organization.objects.create_with_owner(
            owner=self.owner,
            internal_label="Forward Delivery Org",
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Delivery Forward Group",
            check_in_enabled=True,
        )
        self._save_smtp()
        self.group.send_email_after_check_in = True
        self.group.require_email = True
        self.group.save()

    def _save_smtp(self):
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            save_verified_email_sender(
                group=self.group,
                provider="custom_smtp",
                smtp_host="smtp.example.com",
                smtp_port=587,
                smtp_security="starttls",
                smtp_username="user@example.com",
                from_email="from@example.com",
                from_name="Forward Group",
                smtp_password="super-secret-password",
                change_password=True,
            )

    def _membership(self, *, email="parent@example.com", name="Pat"):
        member = Member.objects.create(
            organization=self.organization,
            name=name,
        )
        return GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=member,
            participation_email=email,
        )

    def test_unique_recipient_builder(self):
        recipients = unique_after_action_recipients(
            participant_email="A@example.com",
            forward_emails=[
                "a@example.com",
                "office@example.com",
                "office@example.com",
            ],
        )
        self.assertEqual(
            recipients,
            [
                ("a@example.com", GroupEmailRecipientKind.PARTICIPANT),
                ("office@example.com", GroupEmailRecipientKind.FORWARD),
            ],
        )

    def test_i_participant_receives_normal_after_action_email(self):
        membership = self._membership()
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
                ["parent@example.com"],
            )
        delivery = GroupEmailDelivery.objects.get(action_record=ar)
        self.assertEqual(delivery.recipient_kind, GroupEmailRecipientKind.PARTICIPANT)
        self.assertEqual(delivery.status, GroupEmailDeliveryStatus.SENT)

    def test_j_one_forward_recipient_receives_copy(self):
        self.group.forward_emails = ["office@example.com"]
        self.group.save()
        membership = self._membership()
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
            recipients = batch_recipients(mock_send)
            self.assertEqual(recipients, ["parent@example.com", "office@example.com"])
            messages = mock_send.call_args.kwargs["messages"]
            subjects = {m["subject"] for m in messages}
            bodies = {m["text_body"] for m in messages}
            self.assertEqual(len(subjects), 1)
            self.assertEqual(len(bodies), 1)
        kinds = list(
            GroupEmailDelivery.objects.filter(action_record=ar)
            .order_by("id")
            .values_list("recipient", "recipient_kind", "status")
        )
        self.assertEqual(
            kinds,
            [
                ("parent@example.com", GroupEmailRecipientKind.PARTICIPANT, "sent"),
                ("office@example.com", GroupEmailRecipientKind.FORWARD, "sent"),
            ],
        )

    def test_k_three_forward_recipients_receive_copies(self):
        self.group.forward_emails = [
            "office@example.com",
            "teacher@example.com",
            "desk@example.com",
        ]
        self.group.save()
        membership = self._membership()
        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_success,
        ) as mock_send:
            perform_action_record_from_kiosk(
                group=self.group,
                action_type=ActionType.CHECK_IN,
                participant_kind="member",
                membership=membership,
            )
            mock_send.assert_called_once()
            self.assertEqual(
                batch_recipients(mock_send),
                [
                    "parent@example.com",
                    "office@example.com",
                    "teacher@example.com",
                    "desk@example.com",
                ],
            )

    def test_l_participant_address_duplicated_in_forwarding_only_one_delivery(self):
        self.group.forward_emails = ["parent@example.com", "office@example.com"]
        self.group.save()
        membership = self._membership(email="parent@example.com")
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
            self.assertEqual(
                batch_recipients(mock_send),
                ["parent@example.com", "office@example.com"],
            )
        participant_rows = GroupEmailDelivery.objects.filter(
            action_record=ar,
            recipient="parent@example.com",
        )
        self.assertEqual(participant_rows.count(), 1)
        self.assertEqual(
            participant_rows.get().recipient_kind,
            GroupEmailRecipientKind.PARTICIPANT,
        )

    def test_m_duplicate_forwarding_addresses_only_one_delivery(self):
        # Model normalization rejects duplicates on save; delivery builder also
        # dedupes if raw lists somehow include repeats.
        recipients = unique_after_action_recipients(
            participant_email="parent@example.com",
            forward_emails=["office@example.com", "office@example.com"],
        )
        self.assertEqual(
            [email for email, _kind in recipients],
            ["parent@example.com", "office@example.com"],
        )

    def test_n_forward_recipients_not_exposed_to_participant(self):
        self.group.forward_emails = ["office@example.com", "teacher@example.com"]
        self.group.save()
        membership = self._membership()
        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_success,
        ) as mock_send:
            perform_action_record_from_kiosk(
                group=self.group,
                action_type=ActionType.CHECK_IN,
                participant_kind="member",
                membership=membership,
            )
            for message in mock_send.call_args.kwargs["messages"]:
                self.assertEqual(message["to_email"].count("@"), 1)
                self.assertNotIn(",", message["to_email"])

    def test_o_participant_ok_one_forward_fails_action_preserved(self):
        self.group.forward_emails = ["office@example.com", "teacher@example.com"]
        self.group.save()
        membership = self._membership()

        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_fail_for("teacher@example.com"),
        ):
            ar = perform_action_record_from_kiosk(
                group=self.group,
                action_type=ActionType.CHECK_IN,
                participant_kind="member",
                membership=membership,
            )
        self.assertTrue(ActionRecord.objects.filter(pk=ar.pk).exists())
        by_recipient = {
            row.recipient: (row.status, row.recipient_kind)
            for row in GroupEmailDelivery.objects.filter(action_record=ar)
        }
        self.assertEqual(
            by_recipient["parent@example.com"],
            (GroupEmailDeliveryStatus.SENT, GroupEmailRecipientKind.PARTICIPANT),
        )
        self.assertEqual(
            by_recipient["office@example.com"],
            (GroupEmailDeliveryStatus.SENT, GroupEmailRecipientKind.FORWARD),
        )
        self.assertEqual(
            by_recipient["teacher@example.com"],
            (GroupEmailDeliveryStatus.FAILED, GroupEmailRecipientKind.FORWARD),
        )

    def test_p_participant_fails_forward_succeeds_action_preserved(self):
        self.group.forward_emails = ["office@example.com"]
        self.group.save()
        membership = self._membership()

        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_fail_for("parent@example.com"),
        ):
            ar = perform_action_record_from_kiosk(
                group=self.group,
                action_type=ActionType.CHECK_IN,
                participant_kind="member",
                membership=membership,
            )
        self.assertTrue(ActionRecord.objects.filter(pk=ar.pk).exists())
        by_recipient = {
            row.recipient: (row.status, row.recipient_kind)
            for row in GroupEmailDelivery.objects.filter(action_record=ar)
        }
        self.assertEqual(
            by_recipient["parent@example.com"],
            (GroupEmailDeliveryStatus.FAILED, GroupEmailRecipientKind.PARTICIPANT),
        )
        self.assertEqual(
            by_recipient["office@example.com"],
            (GroupEmailDeliveryStatus.SENT, GroupEmailRecipientKind.FORWARD),
        )

    def test_q_audit_records_each_recipient_status(self):
        self.group.forward_emails = ["office@example.com"]
        self.group.save()
        membership = self._membership()
        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_success,
        ):
            ar = perform_action_record_from_kiosk(
                group=self.group,
                action_type=ActionType.CHECK_IN,
                participant_kind="member",
                membership=membership,
            )
        rows = list(
            GroupEmailDelivery.objects.filter(action_record=ar).order_by("id")
        )
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].recipient_kind, GroupEmailRecipientKind.PARTICIPANT)
        self.assertEqual(rows[1].recipient_kind, GroupEmailRecipientKind.FORWARD)
        self.assertEqual(rows[0].event_type, "check_in")
        self.assertEqual(rows[1].event_type, "check_in")

    def test_no_participant_email_skips_forwards(self):
        self.group.forward_emails = ["office@example.com"]
        self.group.require_email = False
        self.group.save()
        membership = self._membership(email="")
        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch"
        ) as mock_send:
            ar = perform_action_record_from_kiosk(
                group=self.group,
                action_type=ActionType.CHECK_IN,
                participant_kind="member",
                membership=membership,
            )
            mock_send.assert_not_called()
        delivery = GroupEmailDelivery.objects.get(action_record=ar)
        self.assertEqual(delivery.recipient_kind, GroupEmailRecipientKind.PARTICIPANT)
        self.assertEqual(delivery.status, GroupEmailDeliveryStatus.FAILED)

    def test_forward_change_does_not_affect_sender_ready(self):
        from groups.email_sender import get_group_email_sender

        sender = get_group_email_sender(self.group)
        self.assertTrue(sender.is_ready)
        self.group.forward_emails = ["office@example.com"]
        self.group.save()
        sender.refresh_from_db()
        self.assertTrue(sender.is_ready)
