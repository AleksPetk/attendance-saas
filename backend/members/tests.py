import base64
import datetime
import io
import tempfile

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from accounts.testing import force_platform_admin_login
from attendance.models import ActionRecord, ActionSource, ActionType
from attendance.services import ensure_automatic_check_in_action_record_for_membership
from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    KioskIdentifierField,
    KioskMode,
)
from members.models import MEMBER_ADDRESS_MAX_LENGTH, Member, MemberStatus
from kiosk_builder.kiosk_settings_constants import KioskType
from kiosk_builder.testing import configure_group_kiosk_for_launch
from organizations.models import Organization, WorkspaceStaffAccount, WorkspaceStaffRole

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True, **extra_fields):
    user = User.objects.create_user(email=email, password=password, **extra_fields)
    if verified:
        user.mark_email_verified()
    return user


def basic_auth_header(username, password):
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return f"Basic {token}"


def jpeg_photo(name="photo.jpg", color=(20, 80, 160)):
    buffer = io.BytesIO()
    Image.new("RGB", (48, 48), color=color).save(buffer, format="JPEG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/jpeg")


class MemberModelTests(TestCase):
    def setUp(self):
        self.owner = create_user("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)

    def test_create_member_with_name_only(self):
        member = Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
        )

        self.assertEqual(member.name, "Natsumi")
        self.assertEqual(member.email, "")
        self.assertEqual(member.phone, "")
        self.assertEqual(member.address, "")
        self.assertEqual(member.check_in_identifier, "")
        self.assertFalse(member.has_pin)
        self.assertFalse(member.has_photo)
        self.assertIsNotNone(member.pk)
        self.assertEqual(member.status, MemberStatus.ACTIVE)

    def test_duplicate_names_are_allowed(self):
        first = Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
        )
        second = Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
        )

        self.assertEqual(first.name, "Natsumi")
        self.assertEqual(second.name, "Natsumi")
        self.assertNotEqual(first.pk, second.pk)
        self.assertEqual(
            Member.objects.filter(
                organization=self.organization,
                name="Natsumi",
            ).count(),
            2,
        )

    def test_create_member_with_optional_profile_fields(self):
        member = Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
            email="Natsumi@Example.com",
            phone="555-0100",
            address="12 Maple Street, Apt 4",
            notes="English teacher",
            date_of_birth="1994-04-12",
        )

        self.assertEqual(member.email, "natsumi@example.com")
        self.assertEqual(member.phone, "555-0100")
        self.assertEqual(member.address, "12 Maple Street, Apt 4")
        self.assertEqual(member.notes, "English teacher")
        self.assertEqual(str(member.date_of_birth), "1994-04-12")
        self.assertFalse(member.has_pin)
        self.assertEqual(member.check_in_identifier, "")

    def test_deprecated_pin_helper_still_hashes_for_group_fallback(self):
        member = Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
            pin="2468",
        )

        self.assertTrue(member.has_pin)
        self.assertNotEqual(member.pin_hash, "2468")
        self.assertTrue(check_password("2468", member.pin_hash))
        self.assertTrue(member.check_pin("2468"))
        self.assertFalse(member.check_pin("0000"))

    def test_archive_instead_of_hard_delete(self):
        member = Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
        )
        member.delete()
        member.refresh_from_db()

        self.assertEqual(member.status, MemberStatus.ARCHIVED)
        self.assertIsNotNone(member.archived_at)
        self.assertEqual(Member.objects.filter(pk=member.pk).count(), 1)

        member.restore()
        member.refresh_from_db()
        self.assertEqual(member.status, MemberStatus.ACTIVE)
        self.assertIsNone(member.archived_at)

    def test_members_cannot_move_between_organizations(self):
        member = Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
        )
        other = Organization.objects.create_with_owner(
            owner=create_user("other@example.com")
        )
        member.organization = other
        with self.assertRaises(ValidationError):
            member.save()

    def test_blank_name_is_rejected(self):
        with self.assertRaises(ValidationError):
            Member.objects.create_member(organization=self.organization, name="  ")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class MemberAPITests(TestCase):
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

    def test_create_name_only_member(self):
        response = self.client.post("/api/members/", {"name": "Natsumi"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "Natsumi")
        self.assertEqual(response.data["id"], Member.objects.get().pk)
        self.assertEqual(response.data["email"], "")
        self.assertEqual(response.data["phone"], "")
        self.assertEqual(response.data["address"], "")
        self.assertNotIn("internal_code", response.data)
        self.assertNotIn("check_in_identifier", response.data)
        self.assertNotIn("pin", response.data)
        self.assertNotIn("has_pin", response.data)
        self.assertNotIn("pin_hash", response.data)

    def test_api_allows_duplicate_names(self):
        first = self.client.post("/api/members/", {"name": "Natsumi"}, format="json")
        second = self.client.post("/api/members/", {"name": "Natsumi"}, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(first.data["name"], "Natsumi")
        self.assertEqual(second.data["name"], "Natsumi")
        self.assertNotEqual(first.data["id"], second.data["id"])

    def test_create_member_with_optional_fields(self):
        response = self.client.post(
            "/api/members/",
            {
                "name": "Natsumi",
                "email": "natsumi@example.com",
                "phone": "555-0100",
                "address": "12 Maple Street",
                "notes": "Teacher",
                "date_of_birth": "1994-04-12",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["email"], "natsumi@example.com")
        self.assertEqual(response.data["phone"], "555-0100")
        self.assertEqual(response.data["address"], "12 Maple Street")
        self.assertEqual(response.data["notes"], "Teacher")
        self.assertEqual(response.data["date_of_birth"], "1994-04-12")
        member = Member.objects.get(pk=response.data["id"])
        self.assertFalse(member.has_pin)
        self.assertEqual(member.check_in_identifier, "")

    def test_member_api_does_not_set_deprecated_pin_or_identifier(self):
        response = self.client.post(
            "/api/members/",
            {
                "name": "Natsumi",
                "pin": "1357",
                "check_in_identifier": "STUDENT-123",
                "internal_code": "MBR-HACKED",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        member = Member.objects.get(pk=response.data["id"])
        self.assertFalse(member.has_pin)
        self.assertEqual(member.check_in_identifier, "")
        self.assertNotIn("internal_code", response.data)
        self.assertNotIn("check_in_identifier", response.data)
        self.assertNotIn("has_pin", response.data)

    def test_address_is_persisted_and_rejected_when_too_long(self):
        created = self.client.post(
            "/api/members/",
            {"name": "Natsumi", "address": "Room 3, 12 Maple Street"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data["address"], "Room 3, 12 Maple Street")

        too_long = self.client.post(
            "/api/members/",
            {"name": "Other", "address": "x" * (MEMBER_ADDRESS_MAX_LENGTH + 1)},
            format="json",
        )
        self.assertEqual(too_long.status_code, status.HTTP_400_BAD_REQUEST)

    def test_photo_upload_uses_member_pk_path(self):
        response = self.client.post(
            "/api/members/",
            {"name": "Natsumi", "photo": jpeg_photo()},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["has_photo"])
        self.assertTrue(response.data["photo_url"].endswith(".jpg"))
        member = Member.objects.get(pk=response.data["id"])
        self.assertTrue(member.photo.name)
        self.assertIn(f"members/{self.organization.pk}/{member.pk}.jpg", member.photo.name)
        self.assertNotIn("MBR-", member.photo.name)

    def test_list_defaults_to_active_and_supports_profile_search(self):
        Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
            email="natsumi@example.com",
            phone="555-0100",
            address="12 Maple Street",
        )
        Member.objects.create_member(
            organization=self.organization,
            name="Aiko",
            check_in_identifier="STUDENT-123",
        )
        archived = Member.objects.create_member(
            organization=self.organization,
            name="Archived Person",
        )
        archived.archive()
        Member.objects.create_member(
            organization=self.other_organization,
            name="Natsumi",
        )

        listing = self.client.get("/api/members/")
        by_name = self.client.get("/api/members/?search=Natsumi")
        by_email = self.client.get("/api/members/?search=natsumi@example")
        by_phone = self.client.get("/api/members/?search=555-0100")
        by_address = self.client.get("/api/members/?search=maple")
        by_identifier = self.client.get("/api/members/?search=STUDENT-123")
        archived_list = self.client.get("/api/members/?status=archived")

        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        names = [item["name"] for item in listing.data]
        self.assertEqual(names, ["Aiko", "Natsumi"])
        self.assertEqual(by_name.data[0]["name"], "Natsumi")
        self.assertEqual(by_email.data[0]["name"], "Natsumi")
        self.assertEqual(by_phone.data[0]["name"], "Natsumi")
        self.assertEqual(by_address.data[0]["name"], "Natsumi")
        self.assertEqual(by_identifier.data, [])
        self.assertEqual(archived_list.data[0]["name"], "Archived Person")

    def test_search_matches_member_id(self):
        member = Member.objects.create_member(
            organization=self.organization,
            name="Aiko",
        )
        by_id = self.client.get(f"/api/members/?search={member.pk}")
        by_hash = self.client.get(f"/api/members/?search=%23{member.pk}")

        self.assertEqual(by_id.data[0]["id"], member.pk)
        self.assertEqual(by_hash.data[0]["id"], member.pk)

    def test_search_is_case_insensitive(self):
        Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
            email="natsumi@example.com",
        )
        response = self.client.get("/api/members/?search=NATSUMI")
        self.assertEqual(response.data[0]["name"], "Natsumi")

    def test_edit_member_updates_profile_fields(self):
        create = self.client.post("/api/members/", {"name": "Natsumi"}, format="json")
        member_id = create.data["id"]

        update = self.client.patch(
            f"/api/members/{member_id}/",
            {
                "name": "Natsumi Sato",
                "email": "natsumi@example.com",
                "address": "12 Maple Street",
            },
            format="json",
        )

        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(update.data["name"], "Natsumi Sato")
        self.assertEqual(update.data["email"], "natsumi@example.com")
        self.assertEqual(update.data["address"], "12 Maple Street")
        self.assertEqual(update.data["id"], member_id)

    def test_archive_hides_member_from_default_list(self):
        create = self.client.post("/api/members/", {"name": "Natsumi"}, format="json")
        member_id = create.data["id"]

        archive = self.client.post(f"/api/members/{member_id}/archive/")
        listing = self.client.get("/api/members/")

        self.assertEqual(archive.status_code, status.HTTP_200_OK)
        self.assertEqual(archive.data["status"], MemberStatus.ARCHIVED)
        self.assertEqual(listing.data, [])

    def test_delete_archives_instead_of_removing(self):
        create = self.client.post("/api/members/", {"name": "Natsumi"}, format="json")
        member_id = create.data["id"]
        response = self.client.delete(f"/api/members/{member_id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(Member.objects.filter(pk=member_id).exists())
        self.assertEqual(
            Member.objects.get(pk=member_id).status,
            MemberStatus.ARCHIVED,
        )

    def test_owner_cannot_see_or_edit_another_workspace_member(self):
        other_member = Member.objects.create_member(
            organization=self.other_organization,
            name="Secret",
        )

        listing = self.client.get("/api/members/")
        detail = self.client.get(f"/api/members/{other_member.pk}/")
        update = self.client.patch(
            f"/api/members/{other_member.pk}/",
            {"name": "Hacked"},
            format="json",
        )

        self.assertEqual(listing.data, [])
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(update.status_code, status.HTTP_404_NOT_FOUND)
        other_member.refresh_from_db()
        self.assertEqual(other_member.name, "Secret")

    def test_workspace_staff_can_view_members(self):
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.ADMIN,
            email="natsumi.admin@example.com",
        )
        staff_client = APIClient()
        staff_client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("natsumi", "staff-password"),
            HTTP_X_WORKSPACE_ID=self.organization.workspace_id,
        )
        response = staff_client.get("/api/members/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_unauthenticated_member_access_is_rejected(self):
        client = APIClient()
        response = client.get("/api/members/")
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


class MemberRelationshipTests(TestCase):
    def setUp(self):
        self.owner = create_user("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)

    def test_group_membership_is_preserved_when_member_profile_changes(self):
        member = Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
            email="old@example.com",
            check_in_identifier="NAT-01",
            pin="1234",
        )
        group = Group.objects.create_group(
            organization=self.organization,
            name="Staff",
        )
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=group,
            member=member,
        )

        member.name = "Natsumi Sato"
        member.email = "new@example.com"
        member.address = "12 Maple Street"
        member.save()
        membership.refresh_from_db()

        self.assertEqual(membership.member_id, member.pk)
        self.assertEqual(membership.effective_name, "Natsumi Sato")
        self.assertEqual(membership.effective_email, "new@example.com")
        self.assertEqual(membership.effective_check_in_identifier, "NAT-01")
        self.assertTrue(membership.has_effective_pin)
        self.assertTrue(membership.check_effective_pin("1234"))

    def test_action_record_snapshots_are_not_rewritten_when_member_changes(self):
        member = Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
            email="old@example.com",
            check_in_identifier="NAT-01",
        )
        group = Group.objects.create_group(
            organization=self.organization,
            name="Staff",
        )
        GroupMembership.objects.create(
            organization=self.organization,
            group=group,
            member=member,
        )
        record = ActionRecord.objects.create(
            organization=self.organization,
            group=group,
            participant_kind="member",
            member=member,
            action_type=ActionType.CHECK_IN,
            source=ActionSource.KIOSK,
            participant_name_snapshot="Natsumi",
            participant_email_snapshot="old@example.com",
            participant_check_in_identifier_snapshot="NAT-01",
        )

        member.name = "Natsumi Sato"
        member.email = "new@example.com"
        member.check_in_identifier = ""
        member.save()
        record.refresh_from_db()

        self.assertEqual(record.participant_name_snapshot, "Natsumi")
        self.assertEqual(record.participant_email_snapshot, "old@example.com")
        self.assertEqual(record.participant_check_in_identifier_snapshot, "NAT-01")
        self.assertEqual(record.member_id, member.pk)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class MemberLifecycleAPITests(TestCase):
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

    def _create_member(self, **fields):
        payload = {"name": "Mama", **fields}
        response = self.client.post("/api/members/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return response.data

    def test_member_id_is_returned_and_immutable(self):
        created = self._create_member()
        member_id = created["id"]
        self.assertIsInstance(member_id, int)

        update = self.client.patch(
            f"/api/members/{member_id}/",
            {"id": member_id + 99, "name": "Mama"},
            format="json",
        )
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(update.data["id"], member_id)

    def test_archived_member_normal_update_is_rejected(self):
        created = self._create_member()
        member_id = created["id"]
        archive = self.client.post(f"/api/members/{member_id}/archive/")
        self.assertEqual(archive.status_code, status.HTTP_200_OK)

        update = self.client.patch(
            f"/api/members/{member_id}/",
            {"name": "Changed"},
            format="json",
        )
        delete = self.client.delete(f"/api/members/{member_id}/")
        member = Member.objects.get(pk=member_id)

        self.assertEqual(update.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(update.data["code"], "member_archived")
        self.assertEqual(delete.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(member.name, "Mama")
        self.assertEqual(member.status, MemberStatus.ARCHIVED)

        detail = self.client.get(f"/api/members/{member_id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(detail.data["status"], MemberStatus.ARCHIVED)

    def test_restore_archived_member_keeps_same_pk_and_profile(self):
        created = self.client.post(
            "/api/members/",
            {
                "name": "Mama",
                "email": "mama@example.com",
                "address": "12 Maple Street",
                "photo": jpeg_photo(),
            },
            format="multipart",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        member_id = created.data["id"]
        photo_name = Member.objects.get(pk=member_id).photo.name

        self.client.post(f"/api/members/{member_id}/archive/")
        restore = self.client.post(f"/api/members/{member_id}/restore/")
        member = Member.objects.get(pk=member_id)
        listing = self.client.get("/api/members/")

        self.assertEqual(restore.status_code, status.HTTP_200_OK)
        self.assertEqual(restore.data["id"], member_id)
        self.assertEqual(restore.data["status"], MemberStatus.ACTIVE)
        self.assertEqual(member.pk, member_id)
        self.assertEqual(member.email, "mama@example.com")
        self.assertEqual(member.address, "12 Maple Street")
        self.assertEqual(member.photo.name, photo_name)
        self.assertEqual(listing.data[0]["id"], member_id)

    def test_restore_active_member_is_rejected(self):
        created = self._create_member()
        response = self.client.post(f"/api/members/{created['id']}/restore/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "not_archived")

    def test_active_member_cannot_be_permanently_deleted(self):
        created = self._create_member()
        member_id = created["id"]
        response = self.client.post(f"/api/members/{member_id}/permanently-delete/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "member_not_archived")
        self.assertTrue(Member.objects.filter(pk=member_id).exists())

    def test_archived_member_permanent_delete_removes_row_and_photo(self):
        created = self.client.post(
            "/api/members/",
            {"name": "Mama", "photo": jpeg_photo()},
            format="multipart",
        )
        member_id = created.data["id"]
        photo_name = Member.objects.get(pk=member_id).photo.name
        self.assertTrue(default_storage.exists(photo_name))

        self.client.post(f"/api/members/{member_id}/archive/")
        response = self.client.post(f"/api/members/{member_id}/permanently-delete/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Member.objects.filter(pk=member_id).exists())
        self.assertFalse(default_storage.exists(photo_name))

    def test_permanent_delete_succeeds_when_photo_file_is_missing(self):
        created = self._create_member()
        member_id = created["id"]
        member = Member.objects.get(pk=member_id)
        member.photo = "members/missing-does-not-exist.jpg"
        member.save(update_fields=["photo"])
        member.archive()

        response = self.client.post(f"/api/members/{member_id}/permanently-delete/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Member.objects.filter(pk=member_id).exists())

    def test_permanent_delete_removes_group_membership_and_keeps_history(self):
        kept = Member.objects.create_member(
            organization=self.organization,
            name="Kept Person",
        )
        member = Member.objects.create_member(
            organization=self.organization,
            name="Mama",
            email="mama@example.com",
        )
        group = Group.objects.create_group(
            organization=self.organization,
            name="Staff",
        )
        GroupMembership.objects.create(
            organization=self.organization,
            group=group,
            member=member,
        )
        GroupMembership.objects.create(
            organization=self.organization,
            group=group,
            member=kept,
        )
        record = ActionRecord.objects.create(
            organization=self.organization,
            group=group,
            participant_kind="member",
            member=member,
            action_type=ActionType.CHECK_IN,
            source=ActionSource.KIOSK,
            participant_name_snapshot="Mama",
            participant_email_snapshot="mama@example.com",
            participant_check_in_identifier_snapshot="NAT-01",
        )
        member.archive()

        response = self.client.post(f"/api/members/{member.pk}/permanently-delete/")
        record.refresh_from_db()
        history = self.client.get("/api/history/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Member.objects.filter(pk=member.pk).exists())
        self.assertFalse(GroupMembership.objects.filter(member_id=member.pk).exists())
        self.assertTrue(Member.objects.filter(pk=kept.pk).exists())
        self.assertTrue(GroupMembership.objects.filter(member_id=kept.pk).exists())
        self.assertIsNone(record.member_id)
        self.assertEqual(record.participant_name_snapshot, "Mama")
        self.assertEqual(record.participant_email_snapshot, "mama@example.com")
        self.assertEqual(record.participant_check_in_identifier_snapshot, "NAT-01")
        self.assertEqual(history.status_code, status.HTTP_200_OK)
        self.assertEqual(history.data["items"][0]["person"]["name"], "Mama")

    def test_cross_tenant_restore_and_delete_are_denied(self):
        other = Member.objects.create_member(
            organization=self.other_organization,
            name="Secret",
        )
        other.archive()

        restore = self.client.post(f"/api/members/{other.pk}/restore/")
        delete = self.client.post(f"/api/members/{other.pk}/permanently-delete/")

        self.assertEqual(restore.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(delete.status_code, status.HTTP_404_NOT_FOUND)
        other.refresh_from_db()
        self.assertEqual(other.status, MemberStatus.ARCHIVED)
        self.assertTrue(Member.objects.filter(pk=other.pk).exists())


class MemberOperationalInactivityTests(TestCase):
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
            name="Staff",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            require_pin=False,
            kiosk_mode=KioskMode.INPUT,
            kiosk_input_field_1=KioskIdentifierField.NAME,
            kiosk_input_field_2="",
        )
        self.list_group = Group.objects.create_group(
            organization=self.organization,
            name="Visible List",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            require_pin=False,
            kiosk_mode=KioskMode.MEMBER_LIST,
        )
        configure_group_kiosk_for_launch(
            self.group,
            mode=KioskType.INPUT,
            input_field_count=1,
        )
        configure_group_kiosk_for_launch(self.list_group)
        self.member = Member.objects.create_member(
            organization=self.organization,
            name="Mama",
            email="mama@example.com",
        )
        self.kept = Member.objects.create_member(
            organization=self.organization,
            name="Kept Person",
        )
        self.membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member,
            status=GroupMembershipStatus.ACTIVE,
        )
        self.list_membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.list_group,
            member=self.member,
            status=GroupMembershipStatus.ACTIVE,
        )
        GroupMembership.objects.create(
            organization=self.organization,
            group=self.list_group,
            member=self.kept,
            status=GroupMembershipStatus.ACTIVE,
        )
        ActionRecord.objects.create(
            organization=self.organization,
            group=self.group,
            participant_kind="member",
            member=self.member,
            action_type=ActionType.CHECK_IN,
            source=ActionSource.KIOSK,
            performed_at=timezone.now() - datetime.timedelta(days=1),
            participant_name_snapshot="Mama",
            participant_email_snapshot="mama@example.com",
        )

    def test_archived_member_is_excluded_from_operational_group_queries(self):
        self.member.archive()
        memberships = self.client.get(f"/api/groups/{self.list_group.pk}/memberships/")
        detail = self.client.get(f"/api/groups/{self.list_group.pk}/")
        available = self.client.get(
            f"/api/groups/{self.list_group.pk}/available-members/"
        )

        self.assertEqual(memberships.status_code, status.HTTP_200_OK)
        names = [item["effective"]["name"] for item in memberships.data]
        self.assertEqual(names, ["Kept Person"])
        self.assertEqual(detail.data["member_count"], 1)
        available_ids = [item["id"] for item in available.data]
        self.assertNotIn(self.member.pk, available_ids)
        self.assertTrue(
            GroupMembership.objects.filter(pk=self.list_membership.pk).exists()
        )
        self.assertEqual(
            GroupMembership.objects.get(pk=self.list_membership.pk).status,
            GroupMembershipStatus.ACTIVE,
        )

    def test_archived_member_is_excluded_from_kiosk_member_list(self):
        self.member.archive()
        start = self.client.get(f"/api/groups/{self.list_group.pk}/kiosk/")
        self.assertEqual(start.status_code, status.HTTP_200_OK)
        people_ids = [person.get("member_id") for person in start.data["people"]]
        self.assertNotIn(self.member.pk, people_ids)
        self.assertIn(self.kept.pk, people_ids)

    def test_archived_member_cannot_be_identified_or_checked_in(self):
        self.member.archive()
        identify = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/identify/",
            {"participant_code": self.membership.group_participant_code},
            format="json",
        )
        perform = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/perform/",
            {
                "participant_kind": "member",
                "membership_id": self.membership.id,
                "action": ActionType.CHECK_IN,
            },
            format="json",
        )
        history = self.client.get("/api/history/")

        self.assertEqual(identify.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(identify.data["code"], "not_found")
        self.assertEqual(perform.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            ActionRecord.objects.filter(
                member=self.member,
                action_type=ActionType.CHECK_IN,
                source=ActionSource.KIOSK,
                performed_at__date=timezone.now().date(),
            ).exists()
        )
        self.assertEqual(history.data["items"][0]["person"]["name"], "Mama")

    def test_archived_member_is_excluded_from_deprecated_automatic_check_in(self):
        now = timezone.now()
        scheduled_time = (now - datetime.timedelta(minutes=1)).time()
        auto_group = Group.objects.create_group(
            organization=self.organization,
            name="Auto",
            check_in_enabled=False,
            check_out_enabled=True,
            breaks_enabled=False,
            automatic_check_in_enabled=True,
            automatic_check_in_time=scheduled_time,
            require_pin=False,
            kiosk_mode=KioskMode.INPUT,
            kiosk_input_field_1=KioskIdentifierField.NAME,
            kiosk_input_field_2="",
        )
        configure_group_kiosk_for_launch(auto_group)
        auto_membership = GroupMembership.objects.create(
            organization=self.organization,
            group=auto_group,
            member=self.member,
            status=GroupMembershipStatus.ACTIVE,
        )
        self.member.archive()
        auto_membership.refresh_from_db()

        result = ensure_automatic_check_in_action_record_for_membership(
            group=auto_group,
            membership=auto_membership,
            now=now,
        )
        self.assertFalse(result["created"])
        perform = self.client.post(
            f"/api/groups/{auto_group.pk}/kiosk/perform/",
            {
                "participant_kind": "member",
                "membership_id": auto_membership.id,
                "action": ActionType.CHECK_OUT,
            },
            format="json",
        )

        self.assertFalse(result["created"])
        self.assertEqual(perform.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            ActionRecord.objects.filter(
                group=auto_group,
                member_id=self.member.pk,
                source=ActionSource.AUTOMATIC,
            ).exists()
        )

    def test_restore_reuses_same_membership_and_re_enables_kiosk(self):
        membership_id = self.membership.pk
        self.member.archive()
        restore = self.client.post(f"/api/members/{self.member.pk}/restore/")
        memberships = self.client.get(f"/api/groups/{self.group.pk}/memberships/")
        identify = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/identify/",
            {"participant_code": self.membership.group_participant_code},
            format="json",
        )
        start = self.client.get(f"/api/groups/{self.list_group.pk}/kiosk/")

        self.assertEqual(restore.status_code, status.HTTP_200_OK)
        self.assertEqual(restore.data["id"], self.member.pk)
        self.assertEqual(
            GroupMembership.objects.get(pk=membership_id).status,
            GroupMembershipStatus.ACTIVE,
        )
        self.assertEqual(memberships.data[0]["id"], membership_id)
        self.assertEqual(identify.status_code, status.HTTP_200_OK)
        self.assertEqual(identify.data["participant"]["membership_id"], membership_id)
        people_ids = [person.get("member_id") for person in start.data["people"]]
        self.assertIn(self.member.pk, people_ids)
        self.assertIn(self.kept.pk, people_ids)

    def test_cross_tenant_archived_member_stays_hidden(self):
        other_group = Group.objects.create_group(
            organization=self.other_organization,
            name="Other Staff",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            require_pin=False,
            kiosk_mode=KioskMode.INPUT,
            kiosk_input_field_1=KioskIdentifierField.NAME,
            kiosk_input_field_2="",
        )
        configure_group_kiosk_for_launch(other_group)
        other_member = Member.objects.create_member(
            organization=self.other_organization,
            name="Mama",
        )
        other_membership = GroupMembership.objects.create(
            organization=self.other_organization,
            group=other_group,
            member=other_member,
            status=GroupMembershipStatus.ACTIVE,
        )
        other_member.archive()

        identify = self.client.post(
            f"/api/groups/{other_group.pk}/kiosk/identify/",
            {"participant_code": other_membership.group_participant_code},
            format="json",
        )
        memberships = self.client.get(f"/api/groups/{other_group.pk}/memberships/")

        self.assertEqual(identify.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(memberships.status_code, status.HTTP_404_NOT_FOUND)


class MemberAdminTests(TestCase):
    def setUp(self):
        self.platform_admin = User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        self.client = Client()
        force_platform_admin_login(self.client, self.platform_admin)
        self.owner = create_user("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)

    def test_member_changelist_and_add_form_load(self):
        Member.objects.create_member(organization=self.organization, name="Natsumi")
        changelist = self.client.get(reverse("admin:members_member_changelist"))
        add_form = self.client.get(reverse("admin:members_member_add"))

        self.assertEqual(changelist.status_code, 200)
        self.assertEqual(add_form.status_code, 200)
        self.assertContains(changelist, "Natsumi")
        self.assertContains(changelist, self.organization.workspace_id)
        self.assertNotContains(changelist, "MBR-")
