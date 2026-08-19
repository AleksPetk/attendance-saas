import base64
import datetime
import io
import tempfile

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from accounts.testing import force_platform_admin_login
from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupOnlyParticipant,
    GroupStatus,
)
from members.models import Member
from organizations.models import Organization

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True, **extra_fields):
    user = User.objects.create_user(email=email, password=password, **extra_fields)
    if verified:
        user.mark_email_verified()
    return user


def basic_auth_header(username, password):
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return f"Basic {token}"


def jpeg_photo(name="photo.jpg"):
    buffer = io.BytesIO()
    Image.new("RGB", (48, 48), color=(20, 80, 160)).save(buffer, format="JPEG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/jpeg")


class GroupModelTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create_with_owner(
            owner=create_user("owner@example.com")
        )

    def test_create_check_in_only_group(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="Morning Class",
            check_in_enabled=True,
            check_out_enabled=False,
        )
        self.assertTrue(group.check_in_enabled)
        self.assertFalse(group.check_out_enabled)
        self.assertFalse(group.breaks_enabled)

    def test_check_out_only_and_both_off_are_allowed(self):
        checkout = Group.objects.create_group(
            organization=self.organization,
            name="Checkout Only",
            check_in_enabled=False,
            check_out_enabled=True,
        )
        neither = Group.objects.create_group(
            organization=self.organization,
            name="Neither",
            check_in_enabled=False,
            check_out_enabled=False,
        )
        self.assertFalse(checkout.check_in_enabled)
        self.assertTrue(checkout.check_out_enabled)
        self.assertFalse(neither.check_in_enabled)
        self.assertFalse(neither.check_out_enabled)

    def test_breaks_require_max_count(self):
        with self.assertRaises(ValidationError):
            Group.objects.create_group(
                organization=self.organization,
                name="Breaks",
                breaks_enabled=True,
            )
        group = Group.objects.create_group(
            organization=self.organization,
            name="Breaks",
            breaks_enabled=True,
            max_breaks=3,
        )
        self.assertEqual(group.max_breaks, 3)

    def test_automatic_check_in_requires_time_and_manual_off(self):
        with self.assertRaises(ValidationError):
            Group.objects.create_group(
                organization=self.organization,
                name="Auto",
                check_in_enabled=True,
                automatic_check_in_enabled=True,
                automatic_check_in_time=datetime.time(8, 0),
            )
        with self.assertRaises(ValidationError):
            Group.objects.create_group(
                organization=self.organization,
                name="Auto",
                check_in_enabled=False,
                automatic_check_in_enabled=True,
            )
        group = Group.objects.create_group(
            organization=self.organization,
            name="Auto",
            check_in_enabled=False,
            check_out_enabled=True,
            automatic_check_in_enabled=True,
            automatic_check_in_time=datetime.time(8, 0),
        )
        self.assertTrue(group.automatic_check_in_enabled)
        self.assertEqual(group.automatic_check_in_time, datetime.time(8, 0))

    def test_group_names_are_unique_per_workspace_not_globally(self):
        other = Organization.objects.create_with_owner(
            owner=create_user("other@example.com")
        )
        Group.objects.create_group(organization=self.organization, name="Staff")
        Group.objects.create_group(organization=other, name="Staff")
        self.assertEqual(Group.objects.filter(name="Staff").count(), 2)

    def test_archive_instead_of_hard_delete(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="Staff",
        )
        group.delete()
        group.refresh_from_db()
        self.assertEqual(group.status, GroupStatus.ARCHIVED)
        Group.objects.create_group(organization=self.organization, name="Staff")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class GroupAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = create_user("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.other_owner = create_user("other@example.com")
        self.other_organization = Organization.objects.create_with_owner(
            owner=self.other_owner
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("owner@example.com", "secure-password")
        )

    def _create_group(self, **payload):
        body = {"name": "Staff", **payload}
        return self.client.post("/api/groups/", body, format="json")

    def test_create_check_in_only_group(self):
        response = self._create_group(
            actions={
                "check_in_enabled": True,
                "check_out_enabled": False,
                "breaks_enabled": False,
            }
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["actions"]["check_in_enabled"])
        self.assertFalse(response.data["actions"]["check_out_enabled"])
        self.assertEqual(response.data["member_count"], 0)

    def test_create_check_out_only_and_both_off(self):
        checkout = self._create_group(
            name="Out",
            actions={"check_in_enabled": False, "check_out_enabled": True},
        )
        neither = self._create_group(
            name="Idle",
            actions={"check_in_enabled": False, "check_out_enabled": False},
        )
        self.assertEqual(checkout.status_code, status.HTTP_201_CREATED)
        self.assertEqual(neither.status_code, status.HTTP_201_CREATED)

    def test_breaks_with_max_count(self):
        response = self._create_group(
            actions={"breaks_enabled": True, "max_breaks": 2}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["actions"]["max_breaks"], 2)

    def test_automatic_check_in_config_validation(self):
        missing_time = self._create_group(
            name="Auto",
            actions={"check_in_enabled": False, "check_out_enabled": True},
            advanced={"automatic_check_in_enabled": True},
        )
        with_manual = self._create_group(
            name="Auto Manual",
            actions={"check_in_enabled": True},
            advanced={
                "automatic_check_in_enabled": True,
                "automatic_check_in_time": "08:00",
            },
        )
        valid = self._create_group(
            name="Auto Valid",
            actions={"check_in_enabled": False, "check_out_enabled": True},
            advanced={
                "automatic_check_in_enabled": True,
                "automatic_check_in_time": "08:00",
            },
        )
        self.assertEqual(missing_time.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(with_manual.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(valid.status_code, status.HTTP_201_CREATED)
        self.assertEqual(valid.data["advanced"]["automatic_check_in_time"], "08:00")

    def test_notification_templates_store_placeholders_and_reject_unknown(self):
        valid = self._create_group(
            notifications={
                "check_in": {
                    "send_email": True,
                    "email_template": "{name} arrived at {time} in {group}.",
                }
            }
        )
        invalid = self._create_group(
            name="Bad Template",
            notifications={
                "check_in": {
                    "send_email": True,
                    "email_template": "{student_name} arrived",
                }
            },
        )
        self.assertEqual(valid.status_code, status.HTTP_201_CREATED)
        self.assertIn("{name}", valid.data["notifications"]["check_in"]["email_template"])
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

    def test_group_settings_edit(self):
        created = self._create_group()
        group_id = created.data["id"]
        updated = self.client.patch(
            f"/api/groups/{group_id}/",
            {
                "name": "Teachers",
                "actions": {"check_out_enabled": True, "breaks_enabled": True, "max_breaks": 1},
            },
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["name"], "Teachers")
        self.assertTrue(updated.data["actions"]["check_out_enabled"])
        self.assertEqual(updated.data["actions"]["max_breaks"], 1)

    def test_owner_cannot_see_or_edit_another_workspace_group(self):
        other_group = Group.objects.create_group(
            organization=self.other_organization,
            name="Secret Group",
        )
        listing = self.client.get("/api/groups/")
        detail = self.client.get(f"/api/groups/{other_group.pk}/")
        update = self.client.patch(
            f"/api/groups/{other_group.pk}/",
            {"name": "Hacked"},
            format="json",
        )
        self.assertEqual(listing.data, [])
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(update.status_code, status.HTTP_404_NOT_FOUND)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class GroupMembershipAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = create_user("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.other_owner = create_user("other@example.com")
        self.other_organization = Organization.objects.create_with_owner(
            owner=self.other_owner
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("owner@example.com", "secure-password")
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Students",
            require_email=True,
        )
        self.member = Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
            email="natsumi@personal.com",
        )

    def test_membership_succeeds_when_member_has_required_email(self):
        response = self.client.post(
            f"/api/groups/{self.group.pk}/memberships/",
            {"member_id": self.member.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["effective"]["email"], "natsumi@personal.com")
        self.member.refresh_from_db()
        self.assertEqual(self.member.email, "natsumi@personal.com")

    def test_membership_fails_without_required_email_or_override(self):
        Member.objects.filter(pk=self.member.pk).update(email="")
        self.member.refresh_from_db()
        response = self.client.post(
            f"/api/groups/{self.group.pk}/memberships/",
            {"member_id": self.member.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "missing_required_fields")
        self.assertIn("email", response.data["missing_fields"])
        self.assertFalse(GroupMembership.objects.filter(member=self.member).exists())

    def test_group_override_email_succeeds_and_does_not_change_member(self):
        Member.objects.filter(pk=self.member.pk).update(email="")
        self.member.refresh_from_db()
        response = self.client.post(
            f"/api/groups/{self.group.pk}/memberships/",
            {
                "member_id": self.member.pk,
                "override_email": "parent@example.com",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["effective"]["email"], "parent@example.com")
        self.assertEqual(response.data["overrides"]["email"], "parent@example.com")
        self.member.refresh_from_db()
        self.assertEqual(self.member.email, "")

    def test_email_optional_allows_member_without_email(self):
        optional = Group.objects.create_group(
            organization=self.organization,
            name="Club",
            require_email=False,
        )
        member = Member.objects.create_member(
            organization=self.organization,
            name="Guest",
        )
        response = self.client.post(
            f"/api/groups/{optional.pk}/memberships/",
            {"member_id": member.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["effective"]["email"], "")

    def test_pin_photo_and_identifier_requirements(self):
        strict = Group.objects.create_group(
            organization=self.organization,
            name="Staff",
            require_pin=True,
            require_photo=True,
            require_check_in_identifier=True,
        )
        member = Member.objects.create_member(
            organization=self.organization,
            name="Aiko",
        )
        missing = self.client.post(
            f"/api/groups/{strict.pk}/memberships/",
            {"member_id": member.pk},
            format="json",
        )
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            set(missing.data["missing_fields"]),
            {"pin", "photo", "check_in_identifier"},
        )

        complete = self.client.post(
            f"/api/groups/{strict.pk}/memberships/",
            {
                "member_id": member.pk,
                "override_check_in_identifier": "STAFF-9",
                "override_pin": "4321",
                "override_photo": jpeg_photo(),
            },
            format="multipart",
        )
        self.assertEqual(complete.status_code, status.HTTP_201_CREATED)
        self.assertTrue(complete.data["effective"]["has_pin"])
        self.assertTrue(complete.data["effective"]["has_photo"])
        member.refresh_from_db()
        self.assertFalse(member.has_pin)
        self.assertEqual(member.check_in_identifier, "")

    def test_member_may_join_multiple_groups(self):
        second = Group.objects.create_group(
            organization=self.organization,
            name="Teachers",
            require_email=False,
        )
        first = self.client.post(
            f"/api/groups/{self.group.pk}/memberships/",
            {"member_id": self.member.pk},
            format="json",
        )
        extra = self.client.post(
            f"/api/groups/{second.pk}/memberships/",
            {"member_id": self.member.pk},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(extra.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            GroupMembership.objects.filter(member=self.member, status="active").count(),
            2,
        )

    def test_duplicate_membership_is_rejected(self):
        self.client.post(
            f"/api/groups/{self.group.pk}/memberships/",
            {"member_id": self.member.pk},
            format="json",
        )
        duplicate = self.client.post(
            f"/api/groups/{self.group.pk}/memberships/",
            {"member_id": self.member.pk},
            format="json",
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cross_workspace_member_assignment_is_rejected(self):
        foreign_member = Member.objects.create_member(
            organization=self.other_organization,
            name="Foreign",
            email="foreign@example.com",
        )
        response = self.client.post(
            f"/api/groups/{self.group.pk}/memberships/",
            {"member_id": foreign_member.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            GroupMembership.objects.filter(member=foreign_member).exists()
        )

        other_client = APIClient()
        other_client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("other@example.com", "secure-password")
        )
        other_group = Group.objects.create_group(
            organization=self.other_organization,
            name="Other Staff",
        )
        stolen_group = other_client.post(
            f"/api/groups/{self.group.pk}/memberships/",
            {"member_id": foreign_member.pk},
            format="json",
        )
        stolen_member = other_client.post(
            f"/api/groups/{other_group.pk}/memberships/",
            {"member_id": self.member.pk},
            format="json",
        )
        self.assertEqual(stolen_group.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(stolen_member.status_code, status.HTTP_400_BAD_REQUEST)

    def test_removing_membership_does_not_delete_member(self):
        created = self.client.post(
            f"/api/groups/{self.group.pk}/memberships/",
            {"member_id": self.member.pk},
            format="json",
        )
        membership_id = created.data["id"]
        removed = self.client.delete(
            f"/api/groups/{self.group.pk}/memberships/{membership_id}/"
        )
        self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)
        self.member.refresh_from_db()
        self.assertEqual(self.member.name, "Natsumi")
        membership = GroupMembership.objects.get(pk=membership_id)
        self.assertEqual(membership.status, GroupMembershipStatus.INACTIVE)

    def test_archived_member_cannot_be_added(self):
        self.member.archive()
        response = self.client.post(
            f"/api/groups/{self.group.pk}/memberships/",
            {"member_id": self.member.pk, "override_email": "a@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_requirement_change_warns_instead_of_corrupting(self):
        club = Group.objects.create_group(
            organization=self.organization,
            name="Club",
            require_email=False,
        )
        member = Member.objects.create_member(
            organization=self.organization,
            name="Guest",
        )
        self.client.post(
            f"/api/groups/{club.pk}/memberships/",
            {"member_id": member.pk},
            format="json",
        )
        response = self.client.patch(
            f"/api/groups/{club.pk}/",
            {"requirements": {"email": "required"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "requirement_conflicts")
        self.assertEqual(response.data["conflicts"][0]["name"], "Guest")
        self.assertIn("email", response.data["conflicts"][0]["missing_fields"])
        club.refresh_from_db()
        self.assertFalse(club.require_email)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class GroupOnlyParticipantAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = create_user("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.other_owner = create_user("other@example.com")
        self.other_organization = Organization.objects.create_with_owner(
            owner=self.other_owner
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("owner@example.com", "secure-password")
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Summer Class",
        )

    def test_create_with_name_only_when_allowed(self):
        response = self.client.post(
            f"/api/groups/{self.group.pk}/participants/",
            {"name": "Nikolai"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "Nikolai")
        self.assertFalse(Member.objects.filter(name="Nikolai").exists())
        members = self.client.get("/api/members/")
        self.assertEqual(members.data, [])

    def test_required_fields_are_enforced(self):
        self.group.require_email = True
        self.group.require_pin = True
        self.group.save()
        missing = self.client.post(
            f"/api/groups/{self.group.pk}/participants/",
            {"name": "Nikolai"},
            format="json",
        )
        complete = self.client.post(
            f"/api/groups/{self.group.pk}/participants/",
            {"name": "Nikolai", "email": "nikolai@example.com", "pin": "9876"},
            format="json",
        )
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(set(missing.data["missing_fields"]), {"email", "pin"})
        self.assertEqual(complete.status_code, status.HTTP_201_CREATED)
        self.assertTrue(complete.data["has_pin"])
        self.assertNotIn("pin", complete.data)

    def test_participant_tenant_isolation(self):
        created = self.client.post(
            f"/api/groups/{self.group.pk}/participants/",
            {"name": "Nikolai"},
            format="json",
        )
        other_client = APIClient()
        other_client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("other@example.com", "secure-password")
        )
        listing = other_client.get(f"/api/groups/{self.group.pk}/participants/")
        detail = other_client.get(
            f"/api/groups/{self.group.pk}/participants/{created.data['id']}/"
        )
        self.assertEqual(listing.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_requirement_change_detects_incomplete_participants(self):
        self.client.post(
            f"/api/groups/{self.group.pk}/participants/",
            {"name": "Nikolai"},
            format="json",
        )
        response = self.client.patch(
            f"/api/groups/{self.group.pk}/",
            {"requirements": {"pin": "required"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            response.data["conflicts"][0]["kind"],
            "group_only_participant",
        )


class GroupAdminTests(TestCase):
    def setUp(self):
        self.platform_admin = User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        self.client = Client()
        force_platform_admin_login(self.client, self.platform_admin)
        self.organization = Organization.objects.create_with_owner(
            owner=create_user("owner@example.com")
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Staff",
        )
        self.member = Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
        )
        GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member,
        )
        GroupOnlyParticipant.objects.create(
            organization=self.organization,
            group=self.group,
            name="Nikolai",
        )

    def test_group_admin_pages_load(self):
        pages = [
            reverse("admin:groups_group_changelist"),
            reverse("admin:groups_group_add"),
            reverse("admin:groups_groupmembership_changelist"),
            reverse("admin:groups_grouponlyparticipant_changelist"),
        ]
        for url in pages:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200, url)
        changelist = self.client.get(reverse("admin:groups_group_changelist"))
        self.assertContains(changelist, "Staff")
        self.assertContains(changelist, self.organization.workspace_id)
