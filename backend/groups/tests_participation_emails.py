"""Tests for up to 3 participation emails per Group/Class participation."""

from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.testing import force_platform_admin_login
from attendance.models import ActionType
from attendance.services import perform_action_record_from_kiosk
from groups.email_providers.base import EmailSenderProviderError
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
from groups.forward_emails import unique_after_action_recipients
from groups.models import (
    Group,
    GroupMembership,
    GroupOnlyParticipant,
    GroupSection,
    GroupType,
)
from groups.participation_emails import normalize_participation_emails
from groups.readiness import compute_group_setup_status
from groups.standard_group_import import import_standard_group_as_class
from kiosk_builder.testing import configure_group_kiosk_for_launch
from members.models import Member
from organizations.models import Organization
from accounts.models import User


def create_user(email, *, password="secure-password", verified=True, **extra_fields):
    user = User.objects.create_user(email=email, password=password, **extra_fields)
    if verified:
        user.mark_email_verified()
    return user


class ParticipationEmailNormalizeTests(TestCase):
    def test_a_zero_emails_allowed(self):
        self.assertEqual(normalize_participation_emails([]), [])
        self.assertEqual(normalize_participation_emails(None), [])
        self.assertEqual(normalize_participation_emails(""), [])

    def test_b_one_email(self):
        self.assertEqual(
            normalize_participation_emails(["Mother@Example.com"]),
            ["mother@example.com"],
        )

    def test_c_two_emails(self):
        self.assertEqual(
            normalize_participation_emails(["a@example.com", "b@example.com"]),
            ["a@example.com", "b@example.com"],
        )

    def test_d_three_emails(self):
        emails = ["a@example.com", "b@example.com", "c@example.com"]
        self.assertEqual(normalize_participation_emails(emails), emails)

    def test_e_fourth_rejected(self):
        with self.assertRaises(ValidationError):
            normalize_participation_emails(
                [
                    "a@example.com",
                    "b@example.com",
                    "c@example.com",
                    "d@example.com",
                ]
            )

    def test_f_invalid_email_rejected(self):
        with self.assertRaises(ValidationError):
            normalize_participation_emails(["not-an-email"])

    def test_g_duplicate_email_rejected(self):
        with self.assertRaises(ValidationError):
            normalize_participation_emails(["A@example.com", "a@example.com"])

    def test_empty_slots_dropped(self):
        self.assertEqual(
            normalize_participation_emails(["a@example.com", "  ", ""]),
            ["a@example.com"],
        )


class ParticipationEmailApiTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create_with_owner(
            owner=create_user("owner-part-emails@example.com")
        )
        self.user = self.organization.owner
        self.client = APIClient()
        force_platform_admin_login(self.client, self.user)
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Participation Emails Group",
            require_email=False,
        )
        self.member = Member.objects.create(
            organization=self.organization,
            name="Child Member",
            email="child-profile@example.com",
        )

    def test_h_legacy_single_email_backfilled_on_save(self):
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member,
            participation_email="Legacy@Example.com",
        )
        membership.refresh_from_db()
        self.assertEqual(membership.participation_emails, ["legacy@example.com"])
        self.assertEqual(membership.participation_email, "legacy@example.com")

    def test_i_member_profile_email_unchanged_on_edit(self):
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member,
            participation_emails=["mother@example.com"],
        )
        url = reverse(
            "group-membership-detail",
            kwargs={"group_pk": self.group.pk, "pk": membership.pk},
        )
        response = self.client.patch(
            url,
            {
                "participation_emails": [
                    "father@example.com",
                    "guardian@example.com",
                ]
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["participation_emails"],
            ["father@example.com", "guardian@example.com"],
        )
        self.assertEqual(
            response.data["participation"]["emails"],
            ["father@example.com", "guardian@example.com"],
        )
        self.member.refresh_from_db()
        self.assertEqual(self.member.email, "child-profile@example.com")

    def test_a_available_member_suggests_profile_email_for_prefill(self):
        url = reverse("group-available-members", kwargs={"group_pk": self.group.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(item for item in response.data if item["id"] == self.member.id)
        self.assertEqual(row["suggested_participation_email"], "child-profile@example.com")

    def test_b_available_member_without_profile_email_suggests_blank(self):
        blank = Member.objects.create(
            organization=self.organization,
            name="No Email",
            email="",
        )
        url = reverse("group-available-members", kwargs={"group_pk": self.group.pk})
        response = self.client.get(url)
        row = next(item for item in response.data if item["id"] == blank.id)
        self.assertEqual(row["suggested_participation_email"], "")

    def test_e_get_membership_returns_saved_emails_not_profile(self):
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member,
            participation_emails=["mother@example.com", "father@example.com"],
        )
        url = reverse(
            "group-membership-detail",
            kwargs={"group_pk": self.group.pk, "pk": membership.pk},
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["participation"]["emails"],
            ["mother@example.com", "father@example.com"],
        )
        self.assertNotEqual(
            response.data["participation"]["emails"][0],
            self.member.email,
        )

    def test_g_structured_class_available_member_suggests_profile_email(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="School Prefill",
            group_type=GroupType.STRUCTURED,
            require_email=False,
        )
        section = GroupSection.objects.create_section(group=group, name="Class Prefill")
        member = Member.objects.create(
            organization=self.organization,
            name="Class Child",
            email="class-child@example.com",
        )
        url = reverse(
            "group-section-available-members",
            kwargs={"group_pk": group.pk, "section_pk": section.pk},
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(item for item in response.data if item["id"] == member.id)
        self.assertEqual(row["suggested_participation_email"], "class-child@example.com")

    def test_h_visitor_create_without_emails_stays_blank(self):
        url = reverse("group-participant-list", kwargs={"group_pk": self.group.pk})
        response = self.client.post(url, {"name": "Guest Only"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["participation_emails"], [])
        self.assertEqual(response.data["email"], "")

    def test_api_accepts_two_and_three_emails(self):
        url = reverse("group-membership-list", kwargs={"group_pk": self.group.pk})
        response = self.client.post(
            url,
            {
                "member_id": self.member.id,
                "participation_emails": [
                    "mother@example.com",
                    "father@example.com",
                    "guardian@example.com",
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["participation_emails"]), 3)
        self.assertEqual(response.data["participation_email"], "mother@example.com")

    def test_api_rejects_fourth_and_duplicates(self):
        url = reverse("group-membership-list", kwargs={"group_pk": self.group.pk})
        too_many = self.client.post(
            url,
            {
                "member_id": self.member.id,
                "participation_emails": [
                    "a@example.com",
                    "b@example.com",
                    "c@example.com",
                    "d@example.com",
                ],
            },
            format="json",
        )
        self.assertEqual(too_many.status_code, status.HTTP_400_BAD_REQUEST)

        dup = self.client.post(
            url,
            {
                "member_id": self.member.id,
                "participation_emails": ["A@example.com", "a@example.com"],
            },
            format="json",
        )
        self.assertEqual(dup.status_code, status.HTTP_400_BAD_REQUEST)

    def test_visitor_supports_multiple_emails(self):
        url = reverse("group-participant-list", kwargs={"group_pk": self.group.pk})
        response = self.client.post(
            url,
            {
                "name": "Guest Child",
                "participation_emails": [
                    "mom@example.com",
                    "dad@example.com",
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            response.data["participation_emails"],
            ["mom@example.com", "dad@example.com"],
        )
        self.assertEqual(response.data["email"], "mom@example.com")

    def test_structured_class_member_and_visitor_support_multiple_emails(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="School",
            group_type=GroupType.STRUCTURED,
            require_email=False,
        )
        section = GroupSection.objects.create_section(group=group, name="Class A")
        member = Member.objects.create(
            organization=self.organization,
            name="Class Child",
            email="class-child@example.com",
        )
        membership_response = self.client.post(
            reverse(
                "group-section-membership-list",
                kwargs={"group_pk": group.pk, "section_pk": section.pk},
            ),
            {
                "member_id": member.pk,
                "participation_emails": [
                    "mother@class.example",
                    "father@class.example",
                ],
            },
            format="json",
        )
        self.assertEqual(membership_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(membership_response.data["participation_emails"]), 2)

        visitor_response = self.client.post(
            reverse(
                "group-section-participant-list",
                kwargs={"group_pk": group.pk, "section_pk": section.pk},
            ),
            {
                "name": "Class Visitor",
                "participation_emails": [
                    "v1@example.com",
                    "v2@example.com",
                    "v3@example.com",
                ],
            },
            format="json",
        )
        self.assertEqual(visitor_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(visitor_response.data["participation_emails"]), 3)


class ParticipationEmailReadinessTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create_with_owner(
            owner=create_user("owner-ready-emails@example.com")
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Ready Emails",
            require_email=True,
        )
        self.member = Member.objects.create(
            organization=self.organization,
            name="Ready Child",
            email="ready-profile@example.com",
        )

    def test_j_require_email_on_zero_emails_incomplete(self):
        GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member,
            participation_emails=[],
            participation_email="",
        )
        status_data = compute_group_setup_status(self.group)
        self.assertFalse(status_data["setup_complete"])
        self.assertEqual(status_data["missing_email_count"], 1)

    def test_k_require_email_on_one_email_complete(self):
        GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member,
            participation_emails=["mother@example.com"],
        )
        status_data = compute_group_setup_status(self.group)
        self.assertTrue(status_data["setup_complete"])
        self.assertEqual(status_data["missing_email_count"], 0)

    def test_l_additional_emails_optional(self):
        GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member,
            participation_emails=["mother@example.com", "father@example.com"],
        )
        status_data = compute_group_setup_status(self.group)
        self.assertTrue(status_data["setup_complete"])

    def test_m_archived_participants_ignored(self):
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member,
            participation_emails=[],
            participation_email="",
        )
        membership.deactivate()
        status_data = compute_group_setup_status(self.group)
        self.assertTrue(status_data["setup_complete"])
        self.assertEqual(status_data["missing_email_count"], 0)


@override_settings(
    APP_SECRETS_ENCRYPTION_KEY="",
    SECRET_KEY="test-secret-key-for-participation-emails-suite",
)
class ParticipationEmailDeliveryTests(TestCase):
    def setUp(self):
        self.owner = create_user("owner-delivery-emails@example.com")
        self.organization = Organization.objects.create_with_owner(
            owner=self.owner,
            internal_label="Participation Delivery Org",
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Delivery Participation Group",
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
                from_name="Participation Group",
                smtp_password="super-secret-password",
                change_password=True,
            )

    def _membership(self, emails):
        member = Member.objects.create(
            organization=self.organization,
            name="Pat",
        )
        return GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=member,
            participation_emails=emails,
        )

    def test_n_one_participant_email_receives_message(self):
        membership = self._membership(["mother@example.com"])
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
            self.assertEqual(batch_recipients(mock_send), ["mother@example.com"])
        delivery = GroupEmailDelivery.objects.get(action_record=ar)
        self.assertEqual(delivery.recipient_kind, GroupEmailRecipientKind.PARTICIPANT)
        self.assertEqual(delivery.status, GroupEmailDeliveryStatus.SENT)

    def test_o_three_participant_emails_all_receive_message(self):
        membership = self._membership(
            ["mother@example.com", "father@example.com", "guardian@example.com"]
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
                [
                    "mother@example.com",
                    "father@example.com",
                    "guardian@example.com",
                ],
            )
        kinds = list(
            GroupEmailDelivery.objects.filter(action_record=ar)
            .order_by("id")
            .values_list("recipient", "recipient_kind", "status")
        )
        self.assertEqual(
            kinds,
            [
                ("mother@example.com", GroupEmailRecipientKind.PARTICIPANT, "sent"),
                ("father@example.com", GroupEmailRecipientKind.PARTICIPANT, "sent"),
                ("guardian@example.com", GroupEmailRecipientKind.PARTICIPANT, "sent"),
            ],
        )

    def test_p_participant_plus_forward_all_receive(self):
        self.group.forward_emails = ["office@example.com", "teacher@example.com"]
        self.group.save()
        membership = self._membership(["mother@example.com", "father@example.com"])
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
                [
                    "mother@example.com",
                    "father@example.com",
                    "office@example.com",
                    "teacher@example.com",
                ],
            )
        self.assertEqual(GroupEmailDelivery.objects.filter(action_record=ar).count(), 4)

    def test_q_duplicates_across_participant_and_forward_deduped(self):
        recipients = unique_after_action_recipients(
            participant_emails=["mother@example.com", "father@example.com"],
            forward_emails=["father@example.com", "office@example.com"],
        )
        self.assertEqual(
            recipients,
            [
                ("mother@example.com", GroupEmailRecipientKind.PARTICIPANT),
                ("father@example.com", GroupEmailRecipientKind.PARTICIPANT),
                ("office@example.com", GroupEmailRecipientKind.FORWARD),
            ],
        )
        self.group.forward_emails = ["father@example.com", "office@example.com"]
        self.group.save()
        membership = self._membership(["mother@example.com", "father@example.com"])
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
            self.assertEqual(
                batch_recipients(mock_send),
                [
                    "mother@example.com",
                    "father@example.com",
                    "office@example.com",
                ],
            )

    def test_r_recipients_remain_private_separate_deliveries(self):
        self.group.forward_emails = ["office@example.com"]
        self.group.save()
        membership = self._membership(["mother@example.com", "father@example.com"])
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
                body = message["text_body"]
                to_email = message["to_email"]
                for other in (
                    "mother@example.com",
                    "father@example.com",
                    "office@example.com",
                ):
                    if other != to_email:
                        self.assertNotIn(other, body)

    def test_s_one_recipient_failure_does_not_stop_others(self):
        membership = self._membership(
            ["mother@example.com", "father@example.com", "guardian@example.com"]
        )

        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_fail_for(
                "father@example.com", error_message="SMTP failed for father"
            ),
        ):
            ar = perform_action_record_from_kiosk(
                group=self.group,
                action_type=ActionType.CHECK_IN,
                participant_kind="member",
                membership=membership,
            )
        # T — ActionRecord preserved
        self.assertIsNotNone(ar.pk)
        rows = list(
            GroupEmailDelivery.objects.filter(action_record=ar)
            .order_by("id")
            .values_list("recipient", "status")
        )
        self.assertEqual(
            rows,
            [
                ("mother@example.com", "sent"),
                ("father@example.com", "failed"),
                ("guardian@example.com", "sent"),
            ],
        )

    def test_u_audit_records_each_delivery(self):
        membership = self._membership(["mother@example.com", "father@example.com"])
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
        self.assertEqual(
            GroupEmailDelivery.objects.filter(action_record=ar).count(),
            2,
        )


class ParticipationEmailSnapshotImportTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create_with_owner(
            owner=create_user("owner-import-emails@example.com")
        )
        self.source = Group.objects.create_group(
            organization=self.organization,
            name="Fitness",
            group_type=GroupType.STANDARD,
            check_in_enabled=True,
        )
        self.member = Member.objects.create(
            organization=self.organization,
            name="Aleks",
            email="aleks@import.example",
        )
        self.membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.source,
            member=self.member,
            participation_emails=["mother@example.com", "father@example.com"],
            participation_pin="1111",
        )
        self.destination = Group.objects.create_group(
            organization=self.organization,
            name="School Event",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
        )
        configure_group_kiosk_for_launch(self.destination, exit_code="1111", use_pin=True)

    def test_snapshot_copies_multiple_participation_emails(self):
        result = import_standard_group_as_class(
            organization=self.organization,
            destination_group=self.destination,
            source_group_id=self.source.id,
            name="Imported Class",
        )
        dest = GroupMembership.objects.get(
            group=self.destination,
            member=self.member,
            section=result.section,
        )
        self.assertEqual(
            dest.participation_emails,
            ["mother@example.com", "father@example.com"],
        )
        self.membership.participation_emails = ["changed@example.com"]
        self.membership.save()
        dest.refresh_from_db()
        self.assertEqual(
            dest.participation_emails,
            ["mother@example.com", "father@example.com"],
        )
