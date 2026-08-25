"""Structured Group type, Classes (GroupSection), and Class participants."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.testing import force_platform_admin_login
from groups.models import (
    Group,
    GroupMembership,
    GroupOnlyParticipant,
    GroupSection,
    GroupSectionStatus,
    GroupType,
)
from groups.readiness import compute_group_setup_status
from members.models import Member, MemberStatus
from organizations.models import Organization, OrganizationPlan

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True, **extra_fields):
    user = User.objects.create_user(email=email, password=password, **extra_fields)
    if verified:
        user.mark_email_verified()
    return user


class StructuredGroupFoundationTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create_with_owner(
            owner=create_user("structured-owner@example.com")
        )
        self.organization.plan = OrganizationPlan.BUSINESS
        self.organization.save(update_fields=["plan"])
        self.user = self.organization.owner
        self.client = APIClient()
        force_platform_admin_login(self.client, self.user)
        self.other_org = Organization.objects.create_with_owner(
            owner=create_user("other-owner@example.com")
        )
        self.member = Member.objects.create(
            organization=self.organization,
            name="Alex Member",
            email="alex@example.com",
        )

    def test_existing_groups_default_to_standard(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="Legacy Style",
        )
        self.assertEqual(group.group_type, GroupType.STANDARD)
        response = self.client.get(reverse("group-detail", kwargs={"pk": group.pk}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["group_type"], "standard")
        self.assertTrue(response.data["kiosk_available"])

    def test_create_standard_group(self):
        response = self.client.post(
            reverse("group-list"),
            {"name": "Standard A", "group_type": "standard"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["group_type"], "standard")
        self.assertFalse(response.data["require_class_pin"])

    def test_create_structured_group_with_class_pin_setting(self):
        response = self.client.post(
            reverse("group-list"),
            {
                "name": "School",
                "group_type": "structured",
                "require_class_pin": True,
                "actions": {"check_in_enabled": True},
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["group_type"], "structured")
        self.assertTrue(response.data["require_class_pin"])
        self.assertTrue(response.data["kiosk_available"])
        self.assertEqual(response.data["structured"]["require_class_pin"], True)

    def test_group_type_immutable_after_creation(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="Immutable",
            group_type=GroupType.STANDARD,
        )
        response = self.client.patch(
            reverse("group-detail", kwargs={"pk": group.pk}),
            {"group_type": "structured"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        group.refresh_from_db()
        self.assertEqual(group.group_type, GroupType.STANDARD)

    def test_standard_cannot_create_class(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="No Classes",
            group_type=GroupType.STANDARD,
        )
        response = self.client.post(
            reverse("group-section-list", kwargs={"group_pk": group.pk}),
            {"name": "Class A"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(GroupSection.objects.filter(group=group).count(), 0)

    def test_structured_can_create_and_rename_class(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="School",
            group_type=GroupType.STRUCTURED,
        )
        create = self.client.post(
            reverse("group-section-list", kwargs={"group_pk": group.pk}),
            {"name": "Class A"},
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        section_id = create.data["id"]
        self.assertEqual(create.data["name"], "Class A")

        rename = self.client.patch(
            reverse(
                "group-section-detail",
                kwargs={"group_pk": group.pk, "pk": section_id},
            ),
            {"name": "Class Alpha"},
            format="json",
        )
        self.assertEqual(rename.status_code, status.HTTP_200_OK)
        self.assertEqual(rename.data["name"], "Class Alpha")

    def test_duplicate_active_class_name_rejected(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="School",
            group_type=GroupType.STRUCTURED,
        )
        GroupSection.objects.create_section(group=group, name="Class A")
        response = self.client.post(
            reverse("group-section-list", kwargs={"group_pk": group.pk}),
            {"name": "Class A"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_class_tenant_isolation(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="School",
            group_type=GroupType.STRUCTURED,
        )
        section = GroupSection.objects.create_section(group=group, name="Class A")
        other_client = APIClient()
        force_platform_admin_login(other_client, self.other_org.owner)
        response = other_client.get(
            reverse(
                "group-section-detail",
                kwargs={"group_pk": group.pk, "pk": section.pk},
            )
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_class_belongs_only_to_structured_group(self):
        standard = Group.objects.create_group(
            organization=self.organization,
            name="Standard",
            group_type=GroupType.STANDARD,
        )
        with self.assertRaises(Exception):
            GroupSection.objects.create_section(group=standard, name="Nope")

    def test_add_member_and_visitor_to_class_keeps_group_participant_code(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="School",
            group_type=GroupType.STRUCTURED,
            require_email=True,
            require_pin=True,
        )
        section = GroupSection.objects.create_section(group=group, name="Class A")
        membership_response = self.client.post(
            reverse(
                "group-section-membership-list",
                kwargs={"group_pk": group.pk, "section_pk": section.pk},
            ),
            {
                "member_id": self.member.pk,
                "participation_email": "class@example.com",
                "participation_pin": "1234",
            },
            format="multipart",
        )
        self.assertEqual(membership_response.status_code, status.HTTP_201_CREATED)
        code = membership_response.data["group_participant_code"]
        self.assertTrue(code.startswith(f"G{group.pk}-"))
        self.assertEqual(membership_response.data["section_id"], section.pk)

        visitor_response = self.client.post(
            reverse(
                "group-section-participant-list",
                kwargs={"group_pk": group.pk, "section_pk": section.pk},
            ),
            {
                "name": "Visitor One",
                "email": "visitor@example.com",
                "participation_pin": "5678",
            },
            format="multipart",
        )
        self.assertEqual(visitor_response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            visitor_response.data["group_participant_code"].startswith(f"G{group.pk}-")
        )
        self.assertEqual(visitor_response.data["section_id"], section.pk)

        # Parent group-level create is blocked for Structured Groups.
        blocked = self.client.post(
            reverse("group-membership-list", kwargs={"group_pk": group.pk}),
            {"member_id": self.member.pk},
            format="multipart",
        )
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)

    def test_moving_class_keeps_participant_code(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="School",
            group_type=GroupType.STRUCTURED,
        )
        class_a = GroupSection.objects.create_section(group=group, name="Class A")
        class_b = GroupSection.objects.create_section(group=group, name="Class B")
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=group,
            member=self.member,
            section=class_a,
        )
        original = membership.group_participant_code
        membership.section = class_b
        membership.save()
        membership.refresh_from_db()
        self.assertEqual(membership.group_participant_code, original)

    def test_readiness_counts_active_class_participants_only(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="School",
            group_type=GroupType.STRUCTURED,
            require_pin=True,
        )
        active = GroupSection.objects.create_section(group=group, name="Active")
        archived = GroupSection.objects.create_section(group=group, name="Archived")
        GroupMembership.objects.create(
            organization=self.organization,
            group=group,
            member=self.member,
            section=active,
            participation_pin="1234",
        )
        other = Member.objects.create(
            organization=self.organization,
            name="Other",
        )
        GroupMembership.objects.create(
            organization=self.organization,
            group=group,
            member=other,
            section=archived,
            # missing pin on purpose
        )
        archived.archive()
        status_payload = compute_group_setup_status(group)
        self.assertEqual(status_payload["operational_participant_count"], 1)
        self.assertTrue(status_payload["setup_complete"])
        self.assertEqual(status_payload["missing_pin_count"], 0)

    def test_archived_member_not_operational_in_class(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="School",
            group_type=GroupType.STRUCTURED,
            require_email=True,
        )
        section = GroupSection.objects.create_section(group=group, name="Class A")
        GroupMembership.objects.create(
            organization=self.organization,
            group=group,
            member=self.member,
            section=section,
            # missing email
        )
        self.member.archive()
        status_payload = compute_group_setup_status(group)
        self.assertEqual(status_payload["operational_participant_count"], 0)
        self.assertEqual(status_payload["launchable_class_count"], 0)
        self.assertFalse(status_payload["setup_complete"])

    def test_class_archive_and_permanent_delete(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="School",
            group_type=GroupType.STRUCTURED,
        )
        section = GroupSection.objects.create_section(group=group, name="Class A")
        GroupMembership.objects.create(
            organization=self.organization,
            group=group,
            member=self.member,
            section=section,
        )
        archive = self.client.delete(
            reverse(
                "group-section-detail",
                kwargs={"group_pk": group.pk, "pk": section.pk},
            )
        )
        self.assertEqual(archive.status_code, status.HTTP_204_NO_CONTENT)
        section.refresh_from_db()
        self.assertEqual(section.status, GroupSectionStatus.ARCHIVED)
        self.assertEqual(
            compute_group_setup_status(group)["operational_participant_count"],
            0,
        )

        permanent = self.client.post(
            reverse(
                "group-section-permanently-delete",
                kwargs={"group_pk": group.pk, "pk": section.pk},
            )
        )
        self.assertEqual(permanent.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(GroupSection.objects.filter(pk=section.pk).exists())
        self.assertEqual(
            GroupMembership.objects.filter(group=group, member=self.member).count(),
            0,
        )

    def test_standard_participant_flow_unchanged(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="Club",
            group_type=GroupType.STANDARD,
        )
        response = self.client.post(
            reverse("group-membership-list", kwargs={"group_pk": group.pk}),
            {"member_id": self.member.pk},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data["section_id"])
        membership = GroupMembership.objects.get(pk=response.data["id"])
        self.assertIsNone(membership.section_id)

    def test_structured_kiosk_launch_blocked_without_classes(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="School",
            group_type=GroupType.STRUCTURED,
        )
        response = self.client.get(
            reverse("group-kiosk-start", kwargs={"group_pk": group.pk})
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "group_setup_incomplete")
