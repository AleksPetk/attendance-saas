from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.testing import force_platform_admin_login
from groups.models import Group, GroupStatus
from members.models import Member, MemberStatus
from organizations.models import (
    Organization,
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


def login_owner(api, email="owner@example.com", password="secure-password"):
    response = api.post(
        "/api/auth/login/",
        {"email": email, "password": password},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    return api


def login_workspace_staff(api, organization, username, password):
    response = api.post(
        "/api/auth/staff-login/",
        {
            "workspace_id": organization.workspace_id,
            "username": username,
            "password": password,
        },
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    return api


class WorkspaceAdminPermissionBase(TestCase):
    def setUp(self):
        self.owner = create_user("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.admin = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="jane.admin",
            password="admin-password",
            role=WorkspaceStaffRole.ADMIN,
            email="jane.admin@example.com",
        )
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        self.other_owner = create_user("other-owner@example.com")
        self.other_org = Organization.objects.create_with_owner(owner=self.other_owner)
        self.other_admin = WorkspaceStaffAccount.objects.create_account(
            organization=self.other_org,
            username="other.admin",
            password="other-admin-password",
            role=WorkspaceStaffRole.ADMIN,
            email="other.admin@example.com",
        )


class WorkspaceAdminAllowedTests(WorkspaceAdminPermissionBase):
    def setUp(self):
        super().setUp()
        self.api = login_workspace_staff(
            APIClient(),
            self.organization,
            "jane.admin",
            "admin-password",
        )

    def test_workspace_payload_exposes_admin_capabilities(self):
        response = self.api.get(reverse("current-workspace"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], WorkspaceStaffRole.ADMIN)
        caps = response.data["capabilities"]
        self.assertTrue(caps["can_manage_workspace"])
        self.assertTrue(caps["can_manage_staff_accounts"])
        self.assertFalse(caps["can_manage_workspace_admin_accounts"])
        self.assertFalse(caps["can_manage_owner_account"])
        self.assertTrue(caps["can_launch_kiosk"])

    def test_admin_can_create_member(self):
        response = self.api.post(
            "/api/members/",
            {
                "name": "Alex Member",
                "email": "alex@example.com",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            Member.objects.filter(
                organization=self.organization,
                name="Alex Member",
                status=MemberStatus.ACTIVE,
            ).exists()
        )

    def test_admin_can_create_group(self):
        response = self.api.post(
            "/api/groups/",
            {"name": "Morning Class", "group_type": "standard"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            Group.objects.filter(
                organization=self.organization,
                name="Morning Class",
                status=GroupStatus.ACTIVE,
            ).exists()
        )

    def test_admin_can_view_history(self):
        response = self.api.get("/api/history/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_admin_can_create_staff_account(self):
        response = self.api.post(
            reverse("workspace-staff-list"),
            {
                "username": "new.staff",
                "email": "new.staff@example.com",
                "role": WorkspaceStaffRole.STAFF,
                "password": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = WorkspaceStaffAccount.objects.get(
            organization=self.organization,
            username="new.staff",
        )
        self.assertEqual(created.role, WorkspaceStaffRole.STAFF)

    def test_admin_staff_list_excludes_admin_accounts(self):
        response = self.api.get(reverse("workspace-staff-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = {row["username"] for row in response.data}
        self.assertIn("natsumi", usernames)
        self.assertNotIn("jane.admin", usernames)

    def test_admin_can_deactivate_staff(self):
        response = self.api.patch(
            reverse("workspace-staff-detail", args=[self.staff.pk]),
            {"status": WorkspaceStaffStatus.INACTIVE},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.status, WorkspaceStaffStatus.INACTIVE)

    def test_admin_can_reset_staff_password(self):
        response = self.api.post(
            reverse("workspace-staff-reset-password", args=[self.staff.pk]),
            {"password": "brand-new-password-32"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password("brand-new-password-32"))


class WorkspaceAdminForbiddenTests(WorkspaceAdminPermissionBase):
    def setUp(self):
        super().setUp()
        self.api = login_workspace_staff(
            APIClient(),
            self.organization,
            "jane.admin",
            "admin-password",
        )

    def test_admin_cannot_create_admin_account(self):
        response = self.api.post(
            reverse("workspace-staff-list"),
            {
                "username": "another.admin",
                "email": "another.admin@example.com",
                "role": WorkspaceStaffRole.ADMIN,
                "password": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("role", response.data)
        self.assertFalse(
            WorkspaceStaffAccount.objects.filter(
                organization=self.organization,
                username="another.admin",
            ).exists()
        )

    def test_admin_cannot_modify_admin_account(self):
        response = self.api.patch(
            reverse("workspace-staff-detail", args=[self.admin.pk]),
            {"status": WorkspaceStaffStatus.INACTIVE},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_promote_staff_to_admin(self):
        response = self.api.patch(
            reverse("workspace-staff-detail", args=[self.staff.pk]),
            {"role": WorkspaceStaffRole.ADMIN},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("role", response.data)
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.role, WorkspaceStaffRole.STAFF)

    def test_admin_cannot_reset_admin_password(self):
        response = self.api.post(
            reverse("workspace-staff-reset-password", args=[self.admin.pk]),
            {"password": "brand-new-password-32"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_access_owner_account(self):
        response = self.api.get("/api/auth/account/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_change_owner_primary_email(self):
        response = self.api.post(
            "/api/auth/account/primary-email/",
            {
                "email": "newowner@example.com",
                "current_password": "admin-password",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_change_owner_backup_email(self):
        response = self.api.post(
            "/api/auth/account/backup-email/",
            {
                "email": "backup@example.com",
                "current_password": "admin-password",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_change_owner_password(self):
        response = self.api.post(
            "/api/auth/change-password/",
            {
                "current_password": "admin-password",
                "new_password": "brand-new-password-32",
                "new_password_confirm": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_delete_owner_account(self):
        response = self.api.post(
            "/api/auth/account/delete/",
            {"current_password": "admin-password", "confirmation": "DELETE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())

    def test_admin_cannot_access_django_admin(self):
        client = Client()
        logged_in = client.login(username="jane.admin", password="admin-password")
        self.assertFalse(logged_in)
        response = client.get(reverse("admin:index"))
        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertIn("/admin/login/", response.url)

    def test_admin_cannot_access_other_workspace_staff(self):
        response = self.api.patch(
            reverse("workspace-staff-detail", args=[self.other_admin.pk]),
            {"status": WorkspaceStaffStatus.INACTIVE},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.other_admin.refresh_from_db()
        self.assertEqual(self.other_admin.status, WorkspaceStaffStatus.ACTIVE)


class WorkspaceStaffReadOnlyRegressionTests(WorkspaceAdminPermissionBase):
    def setUp(self):
        super().setUp()
        self.api = login_workspace_staff(
            APIClient(),
            self.organization,
            "natsumi",
            "staff-password",
        )

    def test_staff_cannot_create_member(self):
        response = self.api.post(
            "/api/members/",
            {"name": "Blocked Member"},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_cannot_manage_staff_accounts(self):
        response = self.api.get(reverse("workspace-staff-list"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class WorkspaceOwnerStaffManagementRegressionTests(WorkspaceAdminPermissionBase):
    def setUp(self):
        super().setUp()
        self.api = login_owner(APIClient())

    def test_owner_can_still_create_admin_account(self):
        response = self.api.post(
            reverse("workspace-staff-list"),
            {
                "username": "owner.admin",
                "email": "owner.admin@example.com",
                "role": WorkspaceStaffRole.ADMIN,
                "password": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = WorkspaceStaffAccount.objects.get(
            organization=self.organization,
            username="owner.admin",
        )
        self.assertEqual(created.role, WorkspaceStaffRole.ADMIN)

    def test_owner_staff_list_includes_admin_accounts(self):
        response = self.api.get(reverse("workspace-staff-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = {row["username"] for row in response.data}
        self.assertIn("jane.admin", usernames)
        self.assertIn("natsumi", usernames)


class PlatformAdminIsolationRegressionTests(WorkspaceAdminPermissionBase):
    def test_platform_operator_is_not_workspace_admin(self):
        platform_admin = User.objects.create_superuser(
            email="platform@example.com",
            password="secure-password",
        )
        client = Client()
        force_platform_admin_login(client, platform_admin)
        response = client.get(reverse("admin:index"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        workspace_staff = WorkspaceStaffAccount.objects.get(username="jane.admin")
        self.assertNotIsInstance(workspace_staff, User)
        self.assertFalse(User.objects.filter(email="jane.admin").exists())
