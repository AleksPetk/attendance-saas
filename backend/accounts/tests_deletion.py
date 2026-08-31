import io
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from PIL import Image
from rest_framework.test import APIClient

from accounts.deletion import permanently_delete_customer_account
from accounts.testing import force_platform_admin_login
from accounts.tokens import email_verification_token_generator
from attendance.models import ActionRecord, ActionSource, ActionType
from groups.models import Group, GroupMembership, GroupOnlyParticipant
from members.models import Member, MemberStatus
from organizations.models import (
    Organization,
    OrganizationStatus,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
    WorkspaceStaffStatus,
)

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True, **extra_fields):
    user = User.objects.create_user(email=email, password=password, **extra_fields)
    if verified:
        user.mark_email_verified()
    return user


def jpeg_photo(name="photo.jpg", color=(20, 80, 160)):
    buffer = io.BytesIO()
    Image.new("RGB", (48, 48), color=color).save(buffer, format="JPEG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/jpeg")


def use_temp_media(test_case):
    media_dir = tempfile.TemporaryDirectory()
    test_case.addCleanup(media_dir.cleanup)
    override = override_settings(MEDIA_ROOT=media_dir.name)
    override.enable()
    test_case.addCleanup(override.disable)
    return media_dir.name


def seed_workspace(owner):
    organization = Organization.objects.create_with_owner(owner=owner)
    staff = WorkspaceStaffAccount.objects.create_account(
        organization=organization,
        username="natsumi",
        password="staff-password",
        role=WorkspaceStaffRole.ADMIN,
        email="natsumi.admin@example.com",
    )
    member = Member.objects.create_member(
        organization=organization,
        name="Member One",
        photo=jpeg_photo(),
    )
    group = Group.objects.create_group(organization=organization, name="Club")
    membership = GroupMembership.objects.create(
        organization=organization,
        group=group,
        member=member,
        override_photo=jpeg_photo(name="override.jpg", color=(10, 10, 10)),
    )
    participant = GroupOnlyParticipant.objects.create(
        organization=organization,
        group=group,
        name="Walk-in",
        photo=jpeg_photo(name="participant.jpg", color=(200, 20, 20)),
    )
    record = ActionRecord.objects.create(
        organization=organization,
        group=group,
        participant_kind="member",
        member=member,
        action_type=ActionType.CHECK_IN,
        source=ActionSource.KIOSK,
        participant_name_snapshot=member.name,
    )
    return {
        "organization": organization,
        "staff": staff,
        "member": member,
        "group": group,
        "membership": membership,
        "participant": participant,
        "record": record,
    }


class OwnerPermanentDeleteAPITests(TestCase):
    def setUp(self):
        use_temp_media(self)
        self.api = APIClient()
        self.owner = create_user("owner@example.com")
        self.seed = seed_workspace(self.owner)
        self.other = create_user("other@example.com")
        self.other_seed = seed_workspace(self.other)
        self.api.force_login(self.owner)

    def test_owner_can_permanently_delete_own_account(self):
        owner_id = self.owner.pk
        org_id = self.seed["organization"].pk
        member_id = self.seed["member"].pk
        group_id = self.seed["group"].pk
        staff_id = self.seed["staff"].pk
        record_id = self.seed["record"].pk
        photo_name = self.seed["member"].photo.name

        response = self.api.post(
            "/api/auth/account/delete/",
            {"current_password": "secure-password", "confirmation": "DELETE"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["code"], "account_deleted")

        self.assertFalse(User.objects.filter(pk=owner_id).exists())
        self.assertFalse(Organization.objects.filter(pk=org_id).exists())
        self.assertFalse(WorkspaceStaffAccount.objects.filter(pk=staff_id).exists())
        self.assertFalse(Member.objects.filter(pk=member_id).exists())
        self.assertFalse(Group.objects.filter(pk=group_id).exists())
        self.assertFalse(GroupMembership.objects.filter(pk=self.seed["membership"].pk).exists())
        self.assertFalse(
            GroupOnlyParticipant.objects.filter(pk=self.seed["participant"].pk).exists()
        )
        self.assertFalse(ActionRecord.objects.filter(pk=record_id).exists())
        self.assertFalse(default_storage.exists(photo_name))

        self.assertTrue(User.objects.filter(pk=self.other.pk).exists())
        self.assertTrue(Organization.objects.filter(pk=self.other_seed["organization"].pk).exists())
        self.assertTrue(Member.objects.filter(pk=self.other_seed["member"].pk).exists())
        self.assertTrue(Group.objects.filter(pk=self.other_seed["group"].pk).exists())
        self.assertTrue(ActionRecord.objects.filter(pk=self.other_seed["record"].pk).exists())

        workspace = self.api.get("/api/workspace/")
        self.assertIn(workspace.status_code, (401, 403))

    def test_wrong_password_is_rejected(self):
        response = self.api.post(
            "/api/auth/account/delete/",
            {"current_password": "wrong-password", "confirmation": "DELETE"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())
        self.assertTrue(Organization.objects.filter(owner=self.owner).exists())

    def test_missing_or_wrong_confirmation_is_rejected(self):
        missing = self.api.post(
            "/api/auth/account/delete/",
            {"current_password": "secure-password"},
            format="json",
        )
        wrong = self.api.post(
            "/api/auth/account/delete/",
            {"current_password": "secure-password", "confirmation": "delete"},
            format="json",
        )
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(wrong.status_code, 400)
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())

    def test_workspace_staff_cannot_delete_owner_account(self):
        staff_api = APIClient()
        staff_api.force_login(
            self.seed["staff"],
            backend="organizations.authentication.WorkspaceStaffSessionAuthenticationBackend",
        )
        response = staff_api.post(
            "/api/auth/account/delete/",
            {"current_password": "staff-password", "confirmation": "DELETE"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())

    def test_unauthenticated_delete_is_rejected(self):
        api = APIClient()
        response = api.post(
            "/api/auth/account/delete/",
            {"current_password": "secure-password", "confirmation": "DELETE"},
            format="json",
        )
        self.assertIn(response.status_code, (401, 403))
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())

    def test_deleted_email_can_register_again(self):
        self.api.post(
            "/api/auth/account/delete/",
            {"current_password": "secure-password", "confirmation": "DELETE"},
            format="json",
        )
        with patch("organizations.views.send_verification_email_for_user"):
            register = APIClient().post(
                "/api/auth/register/",
                {
                    "email": "owner@example.com",
                    "password": "new-secure-password",
                    "password_confirm": "new-secure-password",
                    "legal_acknowledgement": True,
                },
                format="json",
            )
        self.assertEqual(register.status_code, 201)
        new_user = User.objects.get(email="owner@example.com")
        self.assertNotEqual(new_user.pk, self.owner.pk)
        self.assertFalse(new_user.email_verified)
        self.assertEqual(Organization.objects.filter(owner=new_user).count(), 0)

    def test_archive_does_not_permanently_delete(self):
        organization = self.seed["organization"]
        organization.delete()
        organization.refresh_from_db()
        self.assertEqual(organization.status, OrganizationStatus.ARCHIVED)
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())
        self.assertTrue(Member.objects.filter(pk=self.seed["member"].pk).exists())
        self.assertTrue(ActionRecord.objects.filter(pk=self.seed["record"].pk).exists())

    def test_member_archive_still_works(self):
        member = self.seed["member"]
        member.delete()
        member.refresh_from_db()
        self.assertEqual(member.status, MemberStatus.ARCHIVED)
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())
        self.assertTrue(Organization.objects.filter(pk=self.seed["organization"].pk).exists())

    def test_staff_deactivate_still_works(self):
        staff = self.seed["staff"]
        staff.delete()
        staff.refresh_from_db()
        self.assertEqual(staff.status, WorkspaceStaffStatus.INACTIVE)
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())


class UnverifiedPermanentDeleteTests(TestCase):
    def test_unverified_deleted_email_can_register_again(self):
        user = create_user("unverified@example.com", verified=False)
        Organization.objects.create_with_owner(owner=user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = email_verification_token_generator.make_token(user)

        api = APIClient()
        api.force_login(user)
        response = api.post(
            "/api/auth/account/delete/",
            {"current_password": "secure-password", "confirmation": "DELETE"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(User.objects.filter(email="unverified@example.com").exists())

        stale = APIClient().post(
            "/api/auth/verify-email/",
            {"uid": uid, "token": token},
            format="json",
        )
        self.assertEqual(stale.status_code, 400)
        self.assertEqual(stale.data["code"], "token_invalid")

        with patch("organizations.views.send_verification_email_for_user"):
            register = APIClient().post(
                "/api/auth/register/",
                {
                    "email": "unverified@example.com",
                    "password": "secure-password",
                    "password_confirm": "secure-password",
                    "legal_acknowledgement": True,
                },
                format="json",
            )
        self.assertEqual(register.status_code, 201)
        self.assertTrue(User.objects.filter(email="unverified@example.com").exists())


class PermanentDeleteMediaTests(TestCase):
    def test_missing_media_file_does_not_fail_deletion(self):
        use_temp_media(self)
        owner = create_user("media@example.com")
        seed = seed_workspace(owner)
        photo_name = seed["member"].photo.name
        default_storage.delete(photo_name)
        permanently_delete_customer_account(owner)
        self.assertFalse(User.objects.filter(pk=owner.pk).exists())
        self.assertFalse(Organization.objects.filter(pk=seed["organization"].pk).exists())


class DjangoAdminPermanentDeleteTests(TestCase):
    def setUp(self):
        use_temp_media(self)
        self.superuser = User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        self.staff_operator = User.objects.create_user(
            email="platform-staff@example.com",
            password="secure-password",
            is_staff=True,
            is_superuser=False,
        )
        self.owner = create_user("test@example.com")
        self.seed = seed_workspace(self.owner)
        self.client = Client()

    def test_superuser_cannot_permanently_delete_user_who_owns_organization(self):
        force_platform_admin_login(self.client, self.superuser)
        url = reverse(
            "admin:accounts_user_permanent_delete", args=[self.owner.pk]
        )
        get_page = self.client.get(url)
        self.assertEqual(get_page.status_code, 302)
        deleted = self.client.post(
            url,
            {
                "confirmation": "DELETE",
                "admin_password": "secure-password",
                "reason": "Trying to delete an owner from the user screen.",
            },
        )
        self.assertEqual(deleted.status_code, 302)
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())
        self.assertTrue(
            Organization.objects.filter(pk=self.seed["organization"].pk).exists()
        )

    def test_superuser_permanent_delete_user_without_organization(self):
        orphan = create_user("orphan@example.com")
        force_platform_admin_login(self.client, self.superuser)
        url = reverse("admin:accounts_user_permanent_delete", args=[orphan.pk])
        get_page = self.client.get(url)
        self.assertEqual(get_page.status_code, 200)
        self.assertContains(get_page, "This cannot be undone")

        denied = self.client.post(url, {"confirmation": "DELETE"})
        self.assertEqual(denied.status_code, 200)
        self.assertTrue(User.objects.filter(pk=orphan.pk).exists())

        deleted = self.client.post(
            url,
            {
                "confirmation": "DELETE",
                "admin_password": "secure-password",
                "reason": "Orphan test account no longer needed.",
            },
        )
        self.assertEqual(deleted.status_code, 302)
        self.assertFalse(User.objects.filter(email="orphan@example.com").exists())

    def test_superuser_permanent_delete_from_organization_admin(self):
        owner = create_user("org-delete@example.com")
        seed = seed_workspace(owner)
        force_platform_admin_login(self.client, self.superuser)
        url = reverse(
            "admin:organizations_organization_permanent_delete",
            args=[seed["organization"].pk],
        )
        denied = self.client.post(url, {"confirmation": "DELETE"})
        self.assertEqual(denied.status_code, 200)
        self.assertTrue(User.objects.filter(pk=owner.pk).exists())

        response = self.client.post(
            url,
            {
                "confirmation": "DELETE",
                "admin_password": "secure-password",
                "reason": "Test workspace is ready for permanent deletion.",
            },
        )
        self.assertEqual(response.status_code, 302)
        self.assertFalse(User.objects.filter(pk=owner.pk).exists())
        self.assertFalse(Organization.objects.filter(pk=seed["organization"].pk).exists())

    def test_non_superuser_platform_staff_cannot_permanently_delete(self):
        force_platform_admin_login(self.client, self.staff_operator)
        url = reverse(
            "admin:accounts_user_permanent_delete", args=[self.owner.pk]
        )
        response = self.client.post(url, {"confirmation": "DELETE"})
        self.assertEqual(response.status_code, 403)
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())

    def test_ordinary_admin_delete_still_archives(self):
        owner = create_user("archive-admin@example.com")
        organization = Organization.objects.create_with_owner(owner=owner)
        force_platform_admin_login(self.client, self.superuser)
        url = reverse(
            "admin:organizations_organization_delete",
            args=[organization.pk],
        )
        get_page = self.client.get(url)
        self.assertEqual(get_page.status_code, 200)
        post = self.client.post(url, {"post": "yes"})
        self.assertEqual(post.status_code, 302)
        organization.refresh_from_db()
        self.assertEqual(organization.status, OrganizationStatus.ARCHIVED)
        self.assertTrue(User.objects.filter(pk=owner.pk).exists())

    def test_cannot_permanently_delete_platform_operator(self):
        force_platform_admin_login(self.client, self.superuser)
        url = reverse(
            "admin:accounts_user_permanent_delete", args=[self.staff_operator.pk]
        )
        response = self.client.post(url, {"confirmation": "DELETE"})
        self.assertEqual(response.status_code, 302)
        self.assertTrue(User.objects.filter(pk=self.staff_operator.pk).exists())
