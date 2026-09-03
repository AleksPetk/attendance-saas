"""Regression: Standard Group live kiosk must list operational participants."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.testing import force_platform_admin_login
from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupSection,
    GroupType,
)
from kiosk_builder.kiosk_settings_constants import KioskType
from kiosk_builder.testing import configure_group_kiosk_for_launch
from members.models import Member, MemberStatus
from organizations.models import Organization

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True):
    user = User.objects.create_user(email=email, password=password)
    if verified:
        user.mark_email_verified()
    return user


class StandardKioskPeopleRegressionTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create_with_owner(
            owner=create_user("standard-kiosk-people@example.com")
        )
        self.client = APIClient()
        force_platform_admin_login(self.client, self.organization.owner)
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Sels",
            group_type=GroupType.STANDARD,
            check_in_enabled=True,
            require_pin=True,
        )
        configure_group_kiosk_for_launch(
            self.group,
            mode=KioskType.CARD,
            use_pin=True,
        )
        self.member_a = Member.objects.create(
            organization=self.organization,
            name="Mama",
        )
        self.member_b = Member.objects.create(
            organization=self.organization,
            name="Shaylin",
        )
        self.membership_a = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member_a,
        )
        self.membership_a.set_participation_pin("1111")
        self.membership_a.save(update_fields=["participation_pin_hash"])
        self.membership_b = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member_b,
        )
        self.membership_b.set_participation_pin("2222")
        self.membership_b.save(update_fields=["participation_pin_hash"])

    def test_a_standard_group_with_two_members_returns_two_people(self):
        response = self.client.get(
            reverse("group-kiosk-start", kwargs={"group_pk": self.group.pk})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["kiosk"]["structured"])
        self.assertEqual(len(response.data["people"]), 2)
        names = {person.get("name") for person in response.data["people"]}
        self.assertEqual(names, {"Mama", "Shaylin"})

    def test_b_standard_participants_do_not_require_section(self):
        self.assertIsNone(self.membership_a.section_id)
        self.assertIsNone(self.membership_b.section_id)
        self.assertEqual(GroupMembership.objects.filter(group=self.group).operational().count(), 2)
        response = self.client.get(
            reverse("group-kiosk-start", kwargs={"group_pk": self.group.pk})
        )
        self.assertEqual(len(response.data["people"]), 2)
        for person in response.data["people"]:
            self.assertIsNone(person.get("section_id"))

    def test_c_require_pin_on_still_returns_valid_participants(self):
        self.assertTrue(self.group.require_pin)
        response = self.client.get(
            reverse("group-kiosk-start", kwargs={"group_pk": self.group.pk})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["people"]), 2)
        for person in response.data["people"]:
            self.assertTrue(person["requires_pin"])
            self.assertNotIn("pin", person)
            self.assertIn("photo_url", person)

    def test_d_archived_member_excluded(self):
        self.member_b.status = MemberStatus.ARCHIVED
        self.member_b.save(update_fields=["status", "updated_at"])
        response = self.client.get(
            reverse("group-kiosk-start", kwargs={"group_pk": self.group.pk})
        )
        self.assertEqual(len(response.data["people"]), 1)
        self.assertEqual(response.data["people"][0]["name"], "Mama")

    def test_h_member_photo_url_included_when_present(self):
        from io import BytesIO

        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image

        buffer = BytesIO()
        Image.new("RGB", (48, 48), color=(30, 120, 200)).save(buffer, format="JPEG")
        buffer.seek(0)
        self.member_a.photo.save(
            f"members/{self.organization.pk}/{self.member_a.pk}.jpg",
            SimpleUploadedFile("mama.jpg", buffer.read(), content_type="image/jpeg"),
            save=True,
        )
        response = self.client.get(
            reverse("group-kiosk-start", kwargs={"group_pk": self.group.pk})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        by_name = {person["name"]: person for person in response.data["people"]}
        self.assertIsNone(by_name["Shaylin"]["photo_url"])
        self.assertTrue(by_name["Mama"]["photo_url"])

    def test_i_visitor_photo_url_is_null(self):
        from groups.models import GroupOnlyParticipant

        visitor = GroupOnlyParticipant.objects.create(
            organization=self.organization,
            group=self.group,
            name="Guest Visitor",
            email="guest@example.com",
        )
        visitor.set_participation_pin("3333")
        visitor.save(update_fields=["pin_hash"])
        response = self.client.get(
            reverse("group-kiosk-start", kwargs={"group_pk": self.group.pk})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        visitor = next(
            person
            for person in response.data["people"]
            if person["participant_kind"] == "group_only_participant"
        )
        self.assertIsNone(visitor["photo_url"])

    def test_e_inactive_membership_excluded(self):
        self.membership_b.status = GroupMembershipStatus.INACTIVE
        self.membership_b.save(update_fields=["status", "updated_at"])
        response = self.client.get(
            reverse("group-kiosk-start", kwargs={"group_pk": self.group.pk})
        )
        self.assertEqual(len(response.data["people"]), 1)
        self.assertEqual(response.data["people"][0]["membership_id"], self.membership_a.id)

    def test_f_structured_group_start_requires_class_scoping(self):
        structured = Group.objects.create_group(
            organization=self.organization,
            name="Structured School",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
        )
        configure_group_kiosk_for_launch(structured, use_pin=False)
        class_a = GroupSection.objects.create_section(group=structured, name="Class A")
        member = Member.objects.create(organization=self.organization, name="Aleks")
        GroupMembership.objects.create(
            organization=self.organization,
            group=structured,
            member=member,
            section=class_a,
        )
        start = self.client.get(
            reverse("group-kiosk-start", kwargs={"group_pk": structured.pk})
        )
        self.assertEqual(start.status_code, status.HTTP_200_OK)
        self.assertTrue(start.data["kiosk"]["structured"])
        self.assertEqual(start.data["people"], [])
        self.assertEqual(len(start.data["classes"]), 1)

    def test_g_structured_class_a_does_not_leak_class_b(self):
        structured = Group.objects.create_group(
            organization=self.organization,
            name="Leak Check",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
        )
        configure_group_kiosk_for_launch(structured, use_pin=False)
        class_a = GroupSection.objects.create_section(group=structured, name="Class A")
        class_b = GroupSection.objects.create_section(group=structured, name="Class B")
        member_a = Member.objects.create(organization=self.organization, name="Only A")
        member_b = Member.objects.create(organization=self.organization, name="Only B")
        GroupMembership.objects.create(
            organization=self.organization,
            group=structured,
            member=member_a,
            section=class_a,
        )
        GroupMembership.objects.create(
            organization=self.organization,
            group=structured,
            member=member_b,
            section=class_b,
        )
        people_a = self.client.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": structured.pk, "section_pk": class_a.pk},
            )
        )
        people_b = self.client.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": structured.pk, "section_pk": class_b.pk},
            )
        )
        self.assertEqual({p["name"] for p in people_a.data["people"]}, {"Only A"})
        self.assertEqual({p["name"] for p in people_b.data["people"]}, {"Only B"})

    def test_manager_list_and_kiosk_agree_on_standard_count(self):
        manager = self.client.get(
            reverse("group-membership-list", kwargs={"group_pk": self.group.pk})
        )
        kiosk = self.client.get(
            reverse("group-kiosk-start", kwargs={"group_pk": self.group.pk})
        )
        self.assertEqual(manager.status_code, status.HTTP_200_OK)
        self.assertEqual(kiosk.status_code, status.HTTP_200_OK)
        self.assertEqual(len(manager.data), 2)
        self.assertEqual(len(kiosk.data["people"]), 2)
