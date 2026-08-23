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
from kiosk_builder.testing import configure_group_kiosk_for_launch
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

    def test_automatic_check_in_is_forced_off(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="Auto",
            check_in_enabled=False,
            check_out_enabled=True,
            automatic_check_in_enabled=True,
            automatic_check_in_time=datetime.time(8, 0),
        )
        self.assertFalse(group.automatic_check_in_enabled)
        self.assertIsNone(group.automatic_check_in_time)

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

    def test_break_count_rejects_values_outside_one_to_three(self):
        too_high = self._create_group(
            name="Too Many Breaks",
            actions={"breaks_enabled": True, "max_breaks": 4},
        )
        too_low = self._create_group(
            name="Zero Breaks",
            actions={"breaks_enabled": True, "max_breaks": 0},
        )
        self.assertEqual(too_high.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(too_low.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_group_gets_kiosk_design_without_kiosk_enabled(self):
        from kiosk_builder.models import KioskDesign

        response = self._create_group(name="Auto Kiosk")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("requirements", response.data)
        self.assertNotIn("kiosk_enabled", response.data.get("kiosk", {}))
        group_id = response.data["id"]
        self.assertEqual(KioskDesign.objects.filter(group_id=group_id).count(), 1)
        configure_group_kiosk_for_launch(Group.objects.get(pk=group_id))
        again = self.client.patch(
            f"/api/groups/{group_id}/",
            {"kiosk": {"kiosk_enabled": False}},
            format="json",
        )
        self.assertEqual(again.status_code, status.HTTP_200_OK)
        self.assertEqual(KioskDesign.objects.filter(group_id=group_id).count(), 1)
        start = self.client.get(f"/api/groups/{group_id}/kiosk/")
        self.assertEqual(start.status_code, status.HTTP_200_OK)

    def test_create_group_auto_creates_kiosk_settings(self):
        from kiosk_builder.models import KioskDesign, KioskSettings
        from kiosk_builder.kiosk_settings_constants import KioskType

        response = self._create_group(
            name="Kiosk Settings Group",
            actions={
                "check_in_enabled": True,
                "check_out_enabled": True,
                "breaks_enabled": True,
                "max_breaks": 2,
            },
            participation={"email_required": False, "pin_required": False},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        group_id = response.data["id"]
        settings = KioskSettings.objects.get(group_id=group_id)
        self.assertEqual(settings.mode, KioskType.CARD)
        self.assertFalse(settings.has_exit_code)
        self.assertEqual(KioskDesign.objects.filter(group_id=group_id).count(), 1)

    def test_after_action_writes_are_ignored_for_disabled_actions(self):
        created = self._create_group(
            name="Gated Mail",
            actions={
                "check_in_enabled": False,
                "check_out_enabled": True,
                "breaks_enabled": False,
            },
            notifications={
                "check_in": {
                    "send_email": True,
                    "email_template": "{name} arrived at {time}.",
                },
                "check_out": {
                    "send_email": False,
                    "email_template": "{name} left at {time}.",
                },
            },
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertFalse(created.data["notifications"]["check_in"]["send_email"])
        self.assertFalse(created.data["notifications"]["check_out"]["send_email"])

    def test_automatic_check_in_removed_from_advanced_api(self):
        created = self._create_group(
            name="No Auto",
            actions={"check_in_enabled": False, "check_out_enabled": True},
            advanced={
                "automatic_check_in_enabled": True,
                "automatic_check_in_time": "08:00",
            },
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertIn("email_sender", created.data["advanced"])
        self.assertNotIn("automatic_check_in_enabled", created.data["advanced"])
        group = Group.objects.get(pk=created.data["id"])
        self.assertFalse(group.automatic_check_in_enabled)

    def test_notification_templates_store_placeholders_and_reject_unknown(self):
        valid = self._create_group(
            notifications={
                "check_in": {
                    "send_email": False,
                    "email_template": "{name} arrived at {time} in {group}.",
                }
            }
        )
        invalid = self._create_group(
            name="Bad Template",
            notifications={
                "check_in": {
                    "send_email": False,
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

    def test_membership_succeeds_without_email_photo_pin_or_identifier(self):
        Member.objects.filter(pk=self.member.pk).update(email="")
        self.member.refresh_from_db()
        response = self.client.post(
            f"/api/groups/{self.group.pk}/memberships/",
            {"member_id": self.member.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["effective"]["email"], "")

    def test_group_requirement_fields_are_ignored_on_update(self):
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
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        club.refresh_from_db()
        self.assertFalse(club.require_email)

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

    def test_pin_photo_and_identifier_are_optional_on_membership(self):
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
        created = self.client.post(
            f"/api/groups/{strict.pk}/memberships/",
            {"member_id": member.pk},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)

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

    def test_required_fields_are_not_enforced_from_group_settings(self):
        self.group.require_email = True
        self.group.require_pin = True
        self.group.save()
        created = self.client.post(
            f"/api/groups/{self.group.pk}/participants/",
            {"name": "Nikolai"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertFalse(created.data["has_pin"])

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

    def test_requirement_payload_does_not_block_group_only_participants(self):
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
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.group.refresh_from_db()
        self.assertFalse(self.group.require_pin)


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


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class GroupLifecycleTests(TestCase):
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
            name="Teachers",
            check_in_enabled=True,
            check_out_enabled=True,
            breaks_enabled=True,
            max_breaks=2,
            send_email_after_check_in=True,
            check_in_email_template="{name} arrived at {time}.",
        )
        from kiosk_builder.models import KioskDesign, ensure_group_kiosk_design

        self.design = ensure_group_kiosk_design(self.group)
        self.member = Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
            email="natsumi@example.com",
        )
        self.membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member,
        )
        self.participant = GroupOnlyParticipant.objects.create(
            organization=self.organization,
            group=self.group,
            name="Guest Kid",
        )
        configure_group_kiosk_for_launch(self.group)

    def test_archive_restore_same_pk_and_relationships(self):
        from kiosk_builder.models import KioskDesign

        group_id = self.group.pk
        design_id = self.design.pk
        archive = self.client.post(f"/api/groups/{group_id}/archive/")
        self.assertEqual(archive.status_code, status.HTTP_200_OK)
        self.assertEqual(archive.data["status"], GroupStatus.ARCHIVED)

        update = self.client.patch(
            f"/api/groups/{group_id}/",
            {"name": "Changed"},
            format="json",
        )
        start = self.client.get(f"/api/groups/{group_id}/kiosk/")
        identify = self.client.post(
            f"/api/groups/{group_id}/kiosk/identify/",
            {"name": "Natsumi"},
            format="json",
        )
        perform = self.client.post(
            f"/api/groups/{group_id}/kiosk/perform/",
            {
                "participant_kind": "member",
                "membership_id": self.membership.pk,
                "action": "check_in",
            },
            format="json",
        )
        self.assertEqual(update.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(update.data["code"], "group_archived")
        self.assertEqual(start.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(identify.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(perform.status_code, status.HTTP_404_NOT_FOUND)

        restore = self.client.post(f"/api/groups/{group_id}/restore/")
        self.group.refresh_from_db()
        self.assertEqual(restore.status_code, status.HTTP_200_OK)
        self.assertEqual(restore.data["id"], group_id)
        self.assertEqual(self.group.status, GroupStatus.ACTIVE)
        self.assertTrue(
            GroupMembership.objects.filter(pk=self.membership.pk, group_id=group_id).exists()
        )
        self.assertEqual(KioskDesign.objects.get(pk=design_id).group_id, group_id)
        start_again = self.client.get(f"/api/groups/{group_id}/kiosk/")
        self.assertEqual(start_again.status_code, status.HTTP_200_OK)

    def test_archived_group_skips_after_action(self):
        from groups.operations import AFTER_CHECK_IN, after_action_should_run

        self.group.send_email_after_check_in = True
        self.group.save()
        self.group.archive()
        self.assertFalse(after_action_should_run(self.group, AFTER_CHECK_IN))

    def test_active_group_cannot_be_permanently_deleted(self):
        response = self.client.post(
            f"/api/groups/{self.group.pk}/permanently-delete/"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "group_not_archived")
        self.assertTrue(Group.objects.filter(pk=self.group.pk).exists())

    def test_permanent_delete_removes_group_keeps_history(self):
        from django.core.files.storage import default_storage
        from kiosk_builder.models import KioskDesign
        from attendance.models import ActionRecord, ActionSource, ActionType

        self.design.header_logo = jpeg_photo("logo.jpg")
        self.design.save()
        logo_name = self.design.header_logo.name
        self.assertTrue(default_storage.exists(logo_name))
        record = ActionRecord.objects.create(
            organization=self.organization,
            group=self.group,
            participant_kind="member",
            member=self.member,
            action_type=ActionType.CHECK_IN,
            source=ActionSource.KIOSK,
            participant_name_snapshot="Natsumi",
            participant_email_snapshot="natsumi@example.com",
        )
        other = Group.objects.create_group(
            organization=self.organization,
            name="Keep Me",
        )
        self.group.archive()
        response = self.client.post(
            f"/api/groups/{self.group.pk}/permanently-delete/"
        )
        record.refresh_from_db()
        history = self.client.get("/api/history/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Group.objects.filter(pk=self.group.pk).exists())
        self.assertFalse(GroupMembership.objects.filter(group_id=self.group.pk).exists())
        self.assertFalse(
            GroupOnlyParticipant.objects.filter(group_id=self.group.pk).exists()
        )
        self.assertFalse(KioskDesign.objects.filter(pk=self.design.pk).exists())
        self.assertFalse(default_storage.exists(logo_name))
        self.assertTrue(Group.objects.filter(pk=other.pk).exists())
        self.assertIsNone(record.group_id)
        self.assertEqual(record.group_name_snapshot, "Teachers")
        self.assertEqual(record.participant_name_snapshot, "Natsumi")
        self.assertEqual(history.status_code, status.HTTP_200_OK)
        self.assertEqual(history.data["items"][0]["group_name"], "Teachers")

    def test_permanent_delete_succeeds_when_kiosk_media_is_missing(self):
        from kiosk_builder.models import KioskDesign

        self.design.header_logo = "kiosks/missing-logo.png"
        self.design.save(update_fields=["header_logo"])
        self.group.archive()
        response = self.client.post(
            f"/api/groups/{self.group.pk}/permanently-delete/"
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(KioskDesign.objects.filter(pk=self.design.pk).exists())

    def test_cross_tenant_restore_and_delete_are_denied(self):
        other = Group.objects.create_group(
            organization=self.other_organization,
            name="Secret",
        )
        other.archive()
        restore = self.client.post(f"/api/groups/{other.pk}/restore/")
        delete = self.client.post(f"/api/groups/{other.pk}/permanently-delete/")
        self.assertEqual(restore.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(delete.status_code, status.HTTP_404_NOT_FOUND)
        other.refresh_from_db()
        self.assertEqual(other.status, GroupStatus.ARCHIVED)
