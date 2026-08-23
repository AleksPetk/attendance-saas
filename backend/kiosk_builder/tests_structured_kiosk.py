"""Structured Group live kiosk: Class → Participant → Action."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.testing import force_platform_admin_login
from attendance.models import ActionRecord, ActionType
from groups.models import (
    Group,
    GroupMembership,
    GroupOnlyParticipant,
    GroupSection,
    GroupSectionStatus,
    GroupType,
)
from kiosk_builder.testing import configure_group_kiosk_for_launch
from members.models import Member, MemberStatus
from organizations.models import Organization

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True, **extra_fields):
    user = User.objects.create_user(email=email, password=password, **extra_fields)
    if verified:
        user.mark_email_verified()
    return user


class StructuredKioskFlowTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create_with_owner(
            owner=create_user("structured-kiosk@example.com")
        )
        self.user = self.organization.owner
        self.client = APIClient()
        force_platform_admin_login(self.client, self.user)

        self.group = Group.objects.create_group(
            organization=self.organization,
            name="School",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
            check_out_enabled=True,
            breaks_enabled=True,
            max_breaks=2,
        )
        configure_group_kiosk_for_launch(self.group, use_pin=False)
        self.class_a = GroupSection.objects.create_section(group=self.group, name="Class A")
        self.class_b = GroupSection.objects.create_section(group=self.group, name="Class B")
        self.member_a = Member.objects.create(
            organization=self.organization,
            name="Aleks",
            email="aleks@example.com",
        )
        self.member_b = Member.objects.create(
            organization=self.organization,
            name="Clara",
            email="clara@example.com",
        )
        self.membership_a = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member_a,
            section=self.class_a,
            participation_pin="1111",
        )
        self.membership_b = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member_b,
            section=self.class_b,
            participation_pin="2222",
        )
        self.visitor = GroupOnlyParticipant.objects.create(
            organization=self.organization,
            group=self.group,
            section=self.class_a,
            name="Nami",
            participation_pin="3333",
        )

    def _start(self):
        return self.client.get(
            reverse("group-kiosk-start", kwargs={"group_pk": self.group.pk})
        )

    def test_a_class_pin_off_opens_participant_list(self):
        start = self._start()
        self.assertEqual(start.status_code, status.HTTP_200_OK)
        self.assertTrue(start.data["kiosk"]["structured"])
        self.assertEqual(start.data["kiosk"]["kiosk_mode"], "card")
        self.assertFalse(start.data["kiosk"]["require_class_pin"])
        self.assertEqual(start.data["people"], [])
        class_ids = {item["id"] for item in start.data["classes"]}
        self.assertEqual(class_ids, {self.class_a.pk, self.class_b.pk})
        self.assertNotIn("class_pin", start.data["classes"][0])

        people = self.client.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": self.group.pk, "section_pk": self.class_a.pk},
            )
        )
        self.assertEqual(people.status_code, status.HTTP_200_OK)
        names = {item.get("name") for item in people.data["people"]}
        self.assertEqual(names, {"Aleks", "Nami"})

    def test_b_class_pin_on_correct_pin(self):
        self.group.require_class_pin = True
        self.group.save()
        self.class_a.set_class_pin("9999")
        self.class_a.save()
        self.class_b.set_class_pin("8888")
        self.class_b.save()
        configure_group_kiosk_for_launch(self.group, use_pin=False)

        verify = self.client.post(
            reverse(
                "group-kiosk-class-verify-pin",
                kwargs={"group_pk": self.group.pk, "section_pk": self.class_a.pk},
            ),
            {"pin": "9999"},
            format="json",
        )
        self.assertEqual(verify.status_code, status.HTTP_200_OK)
        self.assertTrue(verify.data["ok"])

        people = self.client.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": self.group.pk, "section_pk": self.class_a.pk},
            )
            + "?pin=9999"
        )
        self.assertEqual(people.status_code, status.HTTP_200_OK)
        self.assertEqual(len(people.data["people"]), 2)

    def test_c_wrong_class_pin_blocked(self):
        self.group.require_class_pin = True
        self.group.save()
        self.class_a.set_class_pin("9999")
        self.class_a.save()
        self.class_b.set_class_pin("8888")
        self.class_b.save()
        configure_group_kiosk_for_launch(self.group)

        verify = self.client.post(
            reverse(
                "group-kiosk-class-verify-pin",
                kwargs={"group_pk": self.group.pk, "section_pk": self.class_a.pk},
            ),
            {"pin": "0000"},
            format="json",
        )
        self.assertEqual(verify.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(verify.data["code"], "invalid_class_pin")

        people = self.client.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": self.group.pk, "section_pk": self.class_a.pk},
            )
            + "?pin=0000"
        )
        self.assertEqual(people.status_code, status.HTTP_400_BAD_REQUEST)

    def test_d_class_pin_never_in_kiosk_payload(self):
        self.group.require_class_pin = True
        self.group.save()
        self.class_a.set_class_pin("9999")
        self.class_a.save()
        self.class_b.set_class_pin("8888")
        self.class_b.save()
        configure_group_kiosk_for_launch(self.group)
        start = self._start()
        payload = str(start.data)
        self.assertNotIn("9999", payload)
        self.assertNotIn("8888", payload)

    def test_e_archived_class_hidden(self):
        self.class_b.archive()
        start = self._start()
        class_ids = {item["id"] for item in start.data["classes"]}
        self.assertEqual(class_ids, {self.class_a.pk})

    def test_f_empty_class_hidden(self):
        empty = GroupSection.objects.create_section(group=self.group, name="Empty")
        start = self._start()
        class_ids = {item["id"] for item in start.data["classes"]}
        self.assertNotIn(empty.pk, class_ids)

    def test_g_h_class_scoping(self):
        people_a = self.client.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": self.group.pk, "section_pk": self.class_a.pk},
            )
        )
        people_b = self.client.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": self.group.pk, "section_pk": self.class_b.pk},
            )
        )
        names_a = {item.get("name") for item in people_a.data["people"]}
        names_b = {item.get("name") for item in people_b.data["people"]}
        self.assertEqual(names_a, {"Aleks", "Nami"})
        self.assertEqual(names_b, {"Clara"})

    def test_i_archived_member_excluded(self):
        self.member_a.archive()
        people = self.client.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": self.group.pk, "section_pk": self.class_a.pk},
            )
        )
        names = {item.get("name") for item in people.data["people"]}
        self.assertEqual(names, {"Nami"})

    def test_j_inactive_participation_excluded(self):
        self.membership_a.deactivate()
        people = self.client.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": self.group.pk, "section_pk": self.class_a.pk},
            )
        )
        names = {item.get("name") for item in people.data["people"]}
        self.assertEqual(names, {"Nami"})

    def test_k_l_card_display_and_code_label(self):
        self.group.require_email = True
        self.group.save()
        self.membership_a.participation_email = "aleks-class@example.com"
        self.membership_a.save()
        self.membership_b.participation_email = "clara-class@example.com"
        self.membership_b.save()
        self.visitor.email = "nami@example.com"
        self.visitor.save()
        settings = self.group.kiosk_settings
        settings.card_show_name = True
        settings.card_show_participant_code = True
        settings.card_show_email = True
        settings.save()
        configure_group_kiosk_for_launch(self.group, use_pin=False)

        start = self._start()
        self.assertEqual(start.status_code, status.HTTP_200_OK)
        self.assertEqual(
            start.data["kiosk"]["participant_code_label"],
            "Class Participant Code",
        )
        people = self.client.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": self.group.pk, "section_pk": self.class_a.pk},
            )
        )
        aleks = next(item for item in people.data["people"] if item["name"] == "Aleks")
        self.assertEqual(aleks["participant_code"], self.membership_a.group_participant_code)
        self.assertEqual(aleks["email"], "aleks-class@example.com")

    def test_m_n_class_and_participant_pins_independent(self):
        self.group.require_class_pin = True
        self.group.require_pin = True
        self.group.save()
        self.class_a.set_class_pin("9999")
        self.class_a.save()
        self.class_b.set_class_pin("8888")
        self.class_b.save()
        configure_group_kiosk_for_launch(self.group, use_pin=True)

        # Class PIN required for people
        blocked = self.client.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": self.group.pk, "section_pk": self.class_a.pk},
            )
        )
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)

        people = self.client.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": self.group.pk, "section_pk": self.class_a.pk},
            )
            + "?pin=9999"
        )
        self.assertEqual(people.status_code, status.HTTP_200_OK)

        identify_wrong = self.client.post(
            reverse("group-kiosk-identify", kwargs={"group_pk": self.group.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_a.pk,
                "pin": "0000",
            },
            format="json",
        )
        self.assertEqual(identify_wrong.status_code, status.HTTP_400_BAD_REQUEST)

        identify_ok = self.client.post(
            reverse("group-kiosk-identify", kwargs={"group_pk": self.group.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_a.pk,
                "pin": "1111",
            },
            format="json",
        )
        self.assertEqual(identify_ok.status_code, status.HTTP_200_OK)
        self.assertEqual(identify_ok.data["code"], "ok")

    def test_o_p_check_in_and_break(self):
        identify = self.client.post(
            reverse("group-kiosk-identify", kwargs={"group_pk": self.group.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_a.pk,
            },
            format="json",
        )
        self.assertEqual(identify.status_code, status.HTTP_200_OK)
        self.assertIn(ActionType.CHECK_IN, identify.data["allowed_actions"])

        perform = self.client.post(
            reverse("group-kiosk-perform", kwargs={"group_pk": self.group.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_a.pk,
                "action": ActionType.CHECK_IN,
            },
            format="json",
        )
        self.assertEqual(perform.status_code, status.HTTP_200_OK)
        self.assertIn("confirmation", perform.data)
        self.assertEqual(
            ActionRecord.objects.filter(
                group=self.group,
                member=self.member_a,
                action_type=ActionType.CHECK_IN,
            ).count(),
            1,
        )

        identify2 = self.client.post(
            reverse("group-kiosk-identify", kwargs={"group_pk": self.group.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_a.pk,
            },
            format="json",
        )
        self.assertIn(ActionType.BREAK_START, identify2.data["allowed_actions"])

    def test_q_r_attendance_reset_now(self):
        self.client.post(
            reverse("group-kiosk-perform", kwargs={"group_pk": self.group.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_a.pk,
                "action": ActionType.CHECK_IN,
            },
            format="json",
        )
        reset = self.client.post(
            reverse("group-kiosk-reset-now", kwargs={"group_pk": self.group.pk})
        )
        self.assertEqual(reset.status_code, status.HTTP_200_OK)
        identify = self.client.post(
            reverse("group-kiosk-identify", kwargs={"group_pk": self.group.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_a.pk,
            },
            format="json",
        )
        self.assertIn(ActionType.CHECK_IN, identify.data["allowed_actions"])

    def test_s_t_u_confirmation_payload_and_return_to_classes(self):
        perform = self.client.post(
            reverse("group-kiosk-perform", kwargs={"group_pk": self.group.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_a.pk,
                "action": ActionType.CHECK_IN,
            },
            format="json",
        )
        self.assertEqual(perform.status_code, status.HTTP_200_OK)
        conf = perform.data["confirmation"]
        self.assertIn("template", conf)
        self.assertIn("message", conf)
        self.assertIn(conf["return_delay_seconds"], (1, 3, 5))
        start = self._start()
        self.assertEqual(start.data["kiosk"]["return_to"], "classes")

    def test_missing_class_pins_block_launch(self):
        self.group.require_class_pin = True
        self.group.save()
        configure_group_kiosk_for_launch(self.group)
        start = self._start()
        self.assertEqual(start.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(start.data["code"], "group_setup_incomplete")
        self.assertIn("Class", start.data["detail"])

    def test_manager_api_exposes_class_pin_kiosk_does_not(self):
        self.class_a.set_class_pin("5555")
        self.class_a.save()
        detail = self.client.get(
            reverse(
                "group-section-detail",
                kwargs={"group_pk": self.group.pk, "pk": self.class_a.pk},
            )
        )
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(detail.data["class_pin"], "5555")
        start = self._start()
        self.assertNotIn("5555", str(start.data))
