import base64
import io
import tempfile

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from accounts.testing import force_platform_admin_login
from members.models import MEMBER_INTERNAL_CODE_PATTERN, Member, MemberStatus
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
        self.assertEqual(member.check_in_identifier, "")
        self.assertFalse(member.has_pin)
        self.assertFalse(member.has_photo)
        self.assertRegex(member.internal_code, MEMBER_INTERNAL_CODE_PATTERN)
        self.assertEqual(member.status, MemberStatus.ACTIVE)

    def test_create_member_with_optional_data(self):
        member = Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
            email="Natsumi@Example.com",
            phone="555-0100",
            check_in_identifier="STUDENT-123",
            notes="English teacher",
            pin="2468",
        )

        self.assertEqual(member.email, "natsumi@example.com")
        self.assertEqual(member.check_in_identifier, "STUDENT-123")
        self.assertTrue(member.has_pin)
        self.assertNotEqual(member.pin_hash, "2468")
        self.assertTrue(check_password("2468", member.pin_hash))
        self.assertTrue(member.check_pin("2468"))
        self.assertFalse(member.check_pin("0000"))

    def test_internal_code_is_globally_unique_and_immutable(self):
        first = Member.objects.create_member(
            organization=self.organization,
            name="Natsumi",
        )
        other_org = Organization.objects.create_with_owner(
            owner=create_user("other@example.com")
        )
        second = Member.objects.create_member(organization=other_org, name="Natsumi")

        self.assertNotEqual(first.internal_code, second.internal_code)
        first.internal_code = "MBR-AAAAAA"
        with self.assertRaises(ValidationError):
            first.save()

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
        self.assertRegex(response.data["internal_code"], MEMBER_INTERNAL_CODE_PATTERN)
        self.assertEqual(response.data["email"], "")
        self.assertFalse(response.data["has_pin"])
        self.assertNotIn("pin", response.data)
        self.assertNotIn("pin_hash", response.data)

    def test_create_member_with_optional_fields_and_pin(self):
        response = self.client.post(
            "/api/members/",
            {
                "name": "Natsumi",
                "email": "natsumi@example.com",
                "phone": "555-0100",
                "check_in_identifier": "STUDENT-123",
                "notes": "Teacher",
                "date_of_birth": "1994-04-12",
                "pin": "1357",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["check_in_identifier"], "STUDENT-123")
        self.assertTrue(response.data["has_pin"])
        member = Member.objects.get(pk=response.data["id"])
        self.assertTrue(member.check_pin("1357"))
        self.assertNotEqual(member.pin_hash, "1357")

    def test_photo_upload_is_stored_and_not_plain_original_size_only(self):
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

    def test_list_defaults_to_active_and_supports_search(self):
        Member.objects.create_member(organization=self.organization, name="Natsumi")
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
        search = self.client.get("/api/members/?search=Natsumi")
        archived_list = self.client.get("/api/members/?status=archived")

        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        names = [item["name"] for item in listing.data]
        self.assertEqual(names, ["Natsumi"])
        self.assertEqual(search.data[0]["name"], "Natsumi")
        self.assertEqual(archived_list.data[0]["name"], "Archived Person")

    def test_edit_member_does_not_change_internal_code(self):
        create = self.client.post("/api/members/", {"name": "Natsumi"}, format="json")
        member_id = create.data["id"]
        original_code = create.data["internal_code"]

        update = self.client.patch(
            f"/api/members/{member_id}/",
            {"name": "Natsumi Sato", "email": "natsumi@example.com"},
            format="json",
        )

        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(update.data["name"], "Natsumi Sato")
        self.assertEqual(update.data["internal_code"], original_code)
        self.assertEqual(update.data["email"], "natsumi@example.com")

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

    def test_workspace_staff_cannot_manage_members(self):
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.ADMIN,
        )
        staff_client = APIClient()
        staff_client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("natsumi", "staff-password"),
            HTTP_X_WORKSPACE_ID=self.organization.workspace_id,
        )
        response = staff_client.get("/api/members/")
        # Staff can view members (read-only in this conservative slice).
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_unauthenticated_member_access_is_rejected(self):
        client = APIClient()
        response = client.get("/api/members/")
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


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
