import base64
import datetime

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from attendance.models import ActionRecord, ActionSource, ActionType
from groups.models import (
    Group,
    GroupMembership,
    GroupOnlyParticipant,
    GroupMembershipStatus,
    GroupOnlyParticipantStatus,
    GroupStatus,
    KioskIdentifierField,
    KioskMode,
)
from organizations.models import Organization
from members.models import Member

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True, **extra_fields):
    user = User.objects.create_user(email=email, password=password, **extra_fields)
    if verified:
        user.mark_email_verified()
    return user


def basic_auth_header(identity, password):
    token = base64.b64encode(f"{identity}:{password}".encode()).decode()
    return f"Basic {token}"


class GroupKioskSliceTests(TestCase):
    def setUp(self):
        self.owner1 = create_user("owner1@example.com")
        self.org1 = Organization.objects.create_with_owner(owner=self.owner1)
        self.owner2 = create_user("owner2@example.com")
        self.org2 = Organization.objects.create_with_owner(owner=self.owner2)
        self.client1 = APIClient()
        self.client1.credentials(
            HTTP_AUTHORIZATION=basic_auth_header(self.owner1.email, "secure-password")
        )
        self.client2 = APIClient()
        self.client2.credentials(
            HTTP_AUTHORIZATION=basic_auth_header(self.owner2.email, "secure-password")
        )

    def test_list_mode_allowed_for_check_in_only(self):
        group = Group.objects.create_group(
            organization=self.org1,
            name="Students",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.MEMBER_LIST,
        )
        resp = self.client1.get(f"/api/groups/{group.pk}/kiosk/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["primary_action"], ActionType.CHECK_IN)

    def test_list_mode_allowed_for_check_out_only(self):
        group = Group.objects.create_group(
            organization=self.org1,
            name="After School",
            check_in_enabled=False,
            check_out_enabled=True,
            breaks_enabled=False,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.MEMBER_LIST,
        )
        resp = self.client1.get(f"/api/groups/{group.pk}/kiosk/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["primary_action"], ActionType.CHECK_OUT)

    def test_list_mode_rejected_when_both_manual_actions_enabled(self):
        with self.assertRaises(DjangoValidationError):
            Group.objects.create_group(
                organization=self.org1,
                name="Invalid",
                check_in_enabled=True,
                check_out_enabled=True,
                breaks_enabled=False,
                kiosk_enabled=True,
                kiosk_mode=KioskMode.MEMBER_LIST,
            )

    def test_list_mode_rejected_when_breaks_enabled(self):
        with self.assertRaises(DjangoValidationError):
            Group.objects.create_group(
                organization=self.org1,
                name="Breaky",
                check_in_enabled=True,
                check_out_enabled=True,
                breaks_enabled=True,
                max_breaks=1,
                kiosk_enabled=True,
                kiosk_mode=KioskMode.MEMBER_LIST,
            )

    def test_input_mode_identify_one_field_name(self):
        group = Group.objects.create_group(
            organization=self.org1,
            name="Simple",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            require_pin=False,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.INPUT,
            kiosk_input_field_1=KioskIdentifierField.NAME,
            kiosk_input_field_2="",
        )
        member = Member.objects.create_member(organization=self.org1, name="Natsumi", pin="")
        GroupMembership.objects.create(organization=self.org1, group=group, member=member, status=GroupMembershipStatus.ACTIVE)

        resp = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/identify/",
            {"name": "Natsumi"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["code"], "ok")
        self.assertEqual(resp.data["participant"]["name"], "Natsumi")
        self.assertNotIn("pin", resp.data["participant"])

    def test_input_mode_ambiguous_name_without_pin(self):
        group = Group.objects.create_group(
            organization=self.org1,
            name="Ambiguous",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            require_pin=False,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.INPUT,
            kiosk_input_field_1=KioskIdentifierField.NAME,
            kiosk_input_field_2="",
        )
        a = Member.objects.create_member(organization=self.org1, name="Natsumi", pin="")
        b = Member.objects.create_member(organization=self.org1, name="Natsumi", pin="")
        GroupMembership.objects.create(organization=self.org1, group=group, member=a, status=GroupMembershipStatus.ACTIVE)
        GroupMembership.objects.create(organization=self.org1, group=group, member=b, status=GroupMembershipStatus.ACTIVE)

        resp = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/identify/",
            {"name": "Natsumi"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data["code"], "ambiguous")

    def test_pin_verified_securely_and_wrong_pin_rejected(self):
        now = timezone.now()
        group = Group.objects.create_group(
            organization=self.org1,
            name="Staff Clock",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            require_pin=True,
            require_check_in_identifier=True,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.INPUT,
            kiosk_input_field_1=KioskIdentifierField.IDENTIFIER,
            kiosk_input_field_2=KioskIdentifierField.PIN,
        )
        member = Member.objects.create_member(
            organization=self.org1,
            name="Natsumi",
            check_in_identifier="STAFF-88",
            pin="1234",
        )
        membership = GroupMembership.objects.create(
            organization=self.org1,
            group=group,
            member=member,
            status=GroupMembershipStatus.ACTIVE,
        )

        # Wrong PIN
        resp = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/identify/",
            {"identifier": "STAFF-88", "pin": "0000"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data["code"], "invalid_pin")

        # Correct PIN
        resp2 = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/identify/",
            {"identifier": "STAFF-88", "pin": "1234"},
            format="json",
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp2.data["code"], "ok")
        self.assertEqual(resp2.data["participant"]["identifier"], "STAFF-88")

        # Perform check-out (no breaks; check-in is automatic in this config)
        perform = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/perform/",
            {"participant_kind": "member", "membership_id": membership.id, "action": ActionType.CHECK_IN, "pin": "1234"},
            format="json",
        )
        self.assertEqual(perform.status_code, 200)
        self.assertEqual(perform.data["code"], "ok")
        self.assertTrue(ActionRecord.objects.filter(group=group, participant_kind="member", action_type=ActionType.CHECK_IN).exists())

    def test_group_membership_override_used_for_identifier(self):
        group = Group.objects.create_group(
            organization=self.org1,
            name="Override Group",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            require_pin=True,
            require_check_in_identifier=True,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.INPUT,
            kiosk_input_field_1=KioskIdentifierField.IDENTIFIER,
            kiosk_input_field_2=KioskIdentifierField.PIN,
        )
        member = Member.objects.create_member(
            organization=self.org1,
            name="Natsumi",
            check_in_identifier="NAT-01",
            pin="1111",
        )
        membership = GroupMembership.objects.create(
            organization=self.org1,
            group=group,
            member=member,
            status=GroupMembershipStatus.ACTIVE,
            override_check_in_identifier="STAFF-88",
        )
        membership.set_override_pin("2222")
        membership.save()

        resp = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/identify/",
            {"identifier": "STAFF-88", "pin": "2222"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["participant"]["identifier"], "STAFF-88")

        perform = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/perform/",
            {
                "participant_kind": "member",
                "membership_id": membership.id,
                "action": ActionType.CHECK_IN,
                "pin": "2222",
            },
            format="json",
        )
        self.assertEqual(perform.status_code, 200)
        ar = ActionRecord.objects.get(group=group, action_type=ActionType.CHECK_IN, participant_kind="member")
        self.assertEqual(ar.participant_check_in_identifier_snapshot, "STAFF-88")

    def test_break_sequence_rules_and_max_breaks(self):
        group = Group.objects.create_group(
            organization=self.org1,
            name="Breaks",
            check_in_enabled=True,
            check_out_enabled=True,
            breaks_enabled=True,
            max_breaks=1,
            require_pin=False,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.INPUT,
            kiosk_input_field_1=KioskIdentifierField.NAME,
            kiosk_input_field_2="",
        )
        member = Member.objects.create_member(organization=self.org1, name="Natsumi", pin="")
        membership = GroupMembership.objects.create(
            organization=self.org1,
            group=group,
            member=member,
            status=GroupMembershipStatus.ACTIVE,
        )

        # Break before check-in
        invalid = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/perform/",
            {"participant_kind": "member", "membership_id": membership.id, "action": ActionType.BREAK_START},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)

        # Check-in
        ok_in = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/perform/",
            {"participant_kind": "member", "membership_id": membership.id, "action": ActionType.CHECK_IN},
            format="json",
        )
        self.assertEqual(ok_in.status_code, 200)

        # Start break
        ok_break = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/perform/",
            {"participant_kind": "member", "membership_id": membership.id, "action": ActionType.BREAK_START},
            format="json",
        )
        self.assertEqual(ok_break.status_code, 200)

        # Check-out while on break should be rejected
        invalid_checkout = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/perform/",
            {"participant_kind": "member", "membership_id": membership.id, "action": ActionType.CHECK_OUT},
            format="json",
        )
        self.assertEqual(invalid_checkout.status_code, 400)

        # End break
        ok_end = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/perform/",
            {"participant_kind": "member", "membership_id": membership.id, "action": ActionType.BREAK_END},
            format="json",
        )
        self.assertEqual(ok_end.status_code, 200)

        # Max breaks enforced (max_breaks=1) -> another break_start not allowed
        invalid_second_break = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/perform/",
            {"participant_kind": "member", "membership_id": membership.id, "action": ActionType.BREAK_START},
            format="json",
        )
        self.assertEqual(invalid_second_break.status_code, 400)

    def test_automatic_check_in_creates_automatic_source_record_and_history(self):
        now = timezone.now()
        scheduled_time = (now - datetime.timedelta(minutes=1)).time()
        group = Group.objects.create_group(
            organization=self.org1,
            name="Auto",
            check_in_enabled=False,
            check_out_enabled=True,
            breaks_enabled=False,
            automatic_check_in_enabled=True,
            automatic_check_in_time=scheduled_time,
            require_pin=False,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.INPUT,
            kiosk_input_field_1=KioskIdentifierField.NAME,
            kiosk_input_field_2="",
        )
        member = Member.objects.create_member(organization=self.org1, name="Natsumi", pin="")
        membership = GroupMembership.objects.create(
            organization=self.org1,
            group=group,
            member=member,
            status=GroupMembershipStatus.ACTIVE,
        )

        # Identify and perform check-out. Automatic check-in should happen on perform.
        perform = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/perform/",
            {"participant_kind": "member", "membership_id": membership.id, "action": ActionType.CHECK_OUT},
            format="json",
        )
        self.assertEqual(perform.status_code, 200)

        auto_records = ActionRecord.objects.filter(
            group=group,
            participant_kind="member",
            action_type=ActionType.CHECK_IN,
            source=ActionSource.AUTOMATIC,
        )
        self.assertEqual(auto_records.count(), 1)

        history = self.client1.get(f"/api/history/?group_id={group.pk}")
        self.assertEqual(history.status_code, 200)
        # Should include at least the auto check-in and the kiosk check-out.
        actions = [item["action"] for item in history.data["items"]]
        self.assertIn(ActionType.CHECK_IN, actions)
        self.assertIn(ActionType.CHECK_OUT, actions)

    def test_cross_tenant_group_access_is_rejected(self):
        group = Group.objects.create_group(
            organization=self.org2,
            name="Other",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.MEMBER_LIST,
        )
        resp = self.client1.get(f"/api/groups/{group.pk}/kiosk/")
        self.assertEqual(resp.status_code, 404)

    def test_group_api_input_mode_multi_action_saves(self):
        """
        Regression for a known bug:
        Input-mode Group with check-in ON + check-out ON + breaks ON must save successfully.
        """
        payload = {
            "name": "Staff Multi Action",
            "actions": {
                "check_in_enabled": True,
                "check_out_enabled": True,
                "breaks_enabled": True,
                "max_breaks": 2,
            },
            "requirements": {
                "name": "required",
                "check_in_identifier": "required",
                "pin": "required",
            },
            "notifications": {},
            "advanced": {
                "automatic_check_in_enabled": False,
                "email_sender_mode": "platform",
            },
            "kiosk": {
                "kiosk_enabled": True,
                "kiosk_mode": "input",
                "kiosk_theme": "classic",
                "kiosk_title": "Staff Clock",
                "kiosk_welcome_text": "",
                "kiosk_success_message": "Success",
                "kiosk_confirmation_message": "Confirm",
                "kiosk_return_delay_seconds": 5,
                "kiosk_list_show_name": True,
                "kiosk_list_show_photo": False,
                "kiosk_list_show_identifier": True,
                "kiosk_list_show_email": False,
                "kiosk_input_field_1": KioskIdentifierField.IDENTIFIER,
                "kiosk_input_field_2": KioskIdentifierField.PIN,
            },
        }
        resp = self.client1.post("/api/groups/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["kiosk"]["kiosk_mode"], "input")
        self.assertEqual(resp.data["kiosk"]["kiosk_input_field_1"], KioskIdentifierField.IDENTIFIER)
        self.assertEqual(resp.data["kiosk"]["kiosk_input_field_2"], KioskIdentifierField.PIN)

    def test_group_api_list_mode_rejected_for_multi_action(self):
        """
        Regression:
        Member list mode must not be allowed for Groups with breaks or both check-in+check-out.
        """
        payload = {
            "name": "Invalid List Mode",
            "actions": {
                "check_in_enabled": True,
                "check_out_enabled": True,
                "breaks_enabled": True,
                "max_breaks": 1,
            },
            "requirements": {"name": "required", "pin": "optional"},
            "notifications": {},
            "advanced": {"automatic_check_in_enabled": False, "email_sender_mode": "platform"},
            "kiosk": {"kiosk_enabled": True, "kiosk_mode": "member_list"},
        }
        resp = self.client1.post("/api/groups/", payload, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("kiosk_mode", resp.data)
        self.assertIn("Member list mode", resp.data["kiosk_mode"][0])

    def test_group_kiosk_settings_persist_theme_and_mode(self):
        payload = {
            "name": "Theme Persist",
            "actions": {
                "check_in_enabled": True,
                "check_out_enabled": False,
                "breaks_enabled": False,
                "max_breaks": 1,
            },
            "requirements": {"name": "required", "pin": "optional"},
            "notifications": {},
            "advanced": {"automatic_check_in_enabled": False, "email_sender_mode": "platform"},
            "kiosk": {
                "kiosk_enabled": True,
                "kiosk_mode": "member_list",
                "kiosk_theme": "modern",
                "kiosk_title": "Kids",
                "kiosk_welcome_text": "Welcome",
                "kiosk_success_message": "Checked",
                "kiosk_confirmation_message": "Confirm",
                "kiosk_return_delay_seconds": 7,
                "kiosk_list_show_name": True,
                "kiosk_list_show_photo": False,
                "kiosk_list_show_identifier": True,
                "kiosk_list_show_email": False,
                "kiosk_input_field_1": KioskIdentifierField.IDENTIFIER,
                "kiosk_input_field_2": "",
            },
        }
        created = self.client1.post("/api/groups/", payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        group_id = created.data["id"]

        detail = self.client1.get(f"/api/groups/{group_id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["kiosk"]["kiosk_mode"], "member_list")
        self.assertEqual(detail.data["kiosk"]["kiosk_theme"], "modern")
        self.assertEqual(detail.data["kiosk"]["kiosk_return_delay_seconds"], 7)

    def test_check_out_only_member_list_kiosk_allows_check_out(self):
        group = Group.objects.create_group(
            organization=self.org1,
            name="Out Only",
            check_in_enabled=False,
            check_out_enabled=True,
            breaks_enabled=False,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.MEMBER_LIST,
            require_pin=False,
        )
        member = Member.objects.create_member(organization=self.org1, name="Natsumi", pin="")
        membership = GroupMembership.objects.create(
            organization=self.org1,
            group=group,
            member=member,
            status=GroupMembershipStatus.ACTIVE,
        )

        start = self.client1.get(f"/api/groups/{group.pk}/kiosk/")
        self.assertEqual(start.status_code, 200)
        self.assertEqual(start.data["primary_action"], ActionType.CHECK_OUT)

        perform = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/perform/",
            {"participant_kind": "member", "membership_id": membership.id, "action": ActionType.CHECK_OUT},
            format="json",
        )
        self.assertEqual(perform.status_code, 200, perform.data)
        self.assertTrue(
            ActionRecord.objects.filter(
                group=group, participant_kind="member", action_type=ActionType.CHECK_OUT
            ).exists()
        )

    def test_invalid_duplicate_check_in_is_rejected(self):
        group = Group.objects.create_group(
            organization=self.org1,
            name="Once",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.MEMBER_LIST,
            require_pin=False,
        )
        member = Member.objects.create_member(organization=self.org1, name="Natsumi", pin="")
        membership = GroupMembership.objects.create(
            organization=self.org1, group=group, member=member, status=GroupMembershipStatus.ACTIVE
        )

        first = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/perform/",
            {"participant_kind": "member", "membership_id": membership.id, "action": ActionType.CHECK_IN},
            format="json",
        )
        self.assertEqual(first.status_code, 200)

        second = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/perform/",
            {"participant_kind": "member", "membership_id": membership.id, "action": ActionType.CHECK_IN},
            format="json",
        )
        self.assertEqual(second.status_code, 400)

    def test_history_snapshot_uses_identifier_at_action_time(self):
        group = Group.objects.create_group(
            organization=self.org1,
            name="Snapshot",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            require_pin=True,
            require_check_in_identifier=True,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.INPUT,
            kiosk_input_field_1=KioskIdentifierField.IDENTIFIER,
            kiosk_input_field_2=KioskIdentifierField.PIN,
        )
        member = Member.objects.create_member(
            organization=self.org1,
            name="Natsumi",
            check_in_identifier="NAT-01",
            pin="1111",
        )
        membership = GroupMembership.objects.create(
            organization=self.org1,
            group=group,
            member=member,
            status=GroupMembershipStatus.ACTIVE,
            override_check_in_identifier="STAFF-88",
        )
        membership.set_override_pin("2222")
        membership.save()

        # Perform check-in using STAFF-88.
        performed = self.client1.post(
            f"/api/groups/{group.pk}/kiosk/perform/",
            {"participant_kind": "member", "membership_id": membership.id, "action": ActionType.CHECK_IN, "pin": "2222"},
            format="json",
        )
        self.assertEqual(performed.status_code, 200)

        # Edit the GroupMembership override afterward.
        membership.override_check_in_identifier = "STAFF-99"
        membership.save()

        history = self.client1.get(f"/api/history/?group_id={group.pk}")
        self.assertEqual(history.status_code, 200)
        items = history.data["items"]
        self.assertGreaterEqual(len(items), 1)
        # History should still show the original identifier from the ActionRecord snapshot.
        self.assertEqual(items[0]["person"]["check_in_identifier"], "STAFF-88")

    def test_cross_tenant_member_id_is_rejected(self):
        group1 = Group.objects.create_group(
            organization=self.org1,
            name="G1",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.MEMBER_LIST,
        )
        group2 = Group.objects.create_group(
            organization=self.org2,
            name="G2",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.MEMBER_LIST,
        )
        member2 = Member.objects.create_member(organization=self.org2, name="Other", pin="")
        membership2 = GroupMembership.objects.create(
            organization=self.org2, group=group2, member=member2, status=GroupMembershipStatus.ACTIVE
        )

        resp = self.client1.post(
            f"/api/groups/{group1.pk}/kiosk/perform/",
            {"participant_kind": "member", "membership_id": membership2.id, "action": ActionType.CHECK_IN},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_history_cross_tenant_group_filter_is_isolated(self):
        group1 = Group.objects.create_group(
            organization=self.org1,
            name="H1",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.MEMBER_LIST,
        )
        group2 = Group.objects.create_group(
            organization=self.org2,
            name="H2",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            kiosk_enabled=True,
            kiosk_mode=KioskMode.MEMBER_LIST,
        )
        member1 = Member.objects.create_member(organization=self.org1, name="A", pin="")
        membership1 = GroupMembership.objects.create(
            organization=self.org1, group=group1, member=member1, status=GroupMembershipStatus.ACTIVE
        )
        self.client1.post(
            f"/api/groups/{group1.pk}/kiosk/perform/",
            {"participant_kind": "member", "membership_id": membership1.id, "action": ActionType.CHECK_IN},
            format="json",
        )

        resp_history = self.client1.get(f"/api/history/?group_id={group2.pk}")
        self.assertEqual(resp_history.status_code, 200)
        self.assertEqual(resp_history.data["items"], [])

