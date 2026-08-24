from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from groups.models import Group, GroupStatus, GroupType
from members.models import Member, MemberStatus
from organizations.models import (
    Organization,
    WorkspaceStaffAccount,
    WorkspaceStaffGroupAccess,
    WorkspaceStaffRole,
)
from organizations.staff_group_access import set_staff_group_access

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


class WorkspaceStaffGroupAccessBase(TestCase):
    def setUp(self):
        self.owner = create_user("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.group_a = Group.objects.create_group(
            organization=self.organization,
            name="English Class",
            group_type=GroupType.STANDARD,
        )
        self.group_b = Group.objects.create_group(
            organization=self.organization,
            name="Gym Members",
            group_type=GroupType.STANDARD,
        )
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        self.other_owner = create_user("other-owner@example.com")
        self.other_org = Organization.objects.create_with_owner(owner=self.other_owner)
        self.other_group = Group.objects.create_group(
            organization=self.other_org,
            name="Other Group",
            group_type=GroupType.STANDARD,
        )
        set_staff_group_access(
            staff_account=self.staff,
            organization=self.organization,
            group_ids=[self.group_a.pk],
        )


class WorkspaceStaffGroupAccessAllowedTests(WorkspaceStaffGroupAccessBase):
    def setUp(self):
        super().setUp()
        self.api = login_workspace_staff(
            APIClient(),
            self.organization,
            "natsumi",
            "staff-password",
        )

    def test_staff_lists_only_assigned_groups(self):
        response = self.api.get("/api/groups/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = {row["name"] for row in response.data}
        self.assertEqual(names, {"English Class"})

    def test_staff_can_open_assigned_group(self):
        response = self.api.get(f"/api/groups/{self.group_a.pk}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_staff_can_search_members_for_group_participant_add(self):
        Member.objects.create_member(
            organization=self.organization,
            name="Alex Member",
            status=MemberStatus.ACTIVE,
        )
        response = self.api.get(f"/api/groups/{self.group_a.pk}/available-members/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) >= 1)

    def test_staff_can_add_member_to_assigned_group(self):
        member = Member.objects.create_member(
            organization=self.organization,
            name="Alex Member",
            status=MemberStatus.ACTIVE,
        )
        response = self.api.post(
            f"/api/groups/{self.group_a.pk}/memberships/",
            {"member_id": member.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_staff_capabilities_flag_group_scoped(self):
        response = self.api.get(reverse("current-workspace"))
        caps = response.data["capabilities"]
        self.assertFalse(caps["can_view_global_members"])
        self.assertFalse(caps["can_manage_group_configuration"])
        self.assertTrue(caps["is_group_scoped_staff"])


class WorkspaceStaffGroupAccessDeniedTests(WorkspaceStaffGroupAccessBase):
    def setUp(self):
        super().setUp()
        self.api = login_workspace_staff(
            APIClient(),
            self.organization,
            "natsumi",
            "staff-password",
        )

    def test_staff_cannot_access_unassigned_group(self):
        response = self.api.get(f"/api/groups/{self.group_b.pk}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_staff_cannot_create_group(self):
        response = self.api.post(
            "/api/groups/",
            {"name": "New Group", "group_type": "standard"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_cannot_access_global_members(self):
        response = self.api.get("/api/members/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_cannot_create_member(self):
        response = self.api.post(
            "/api/members/",
            {"name": "Blocked Member"},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_cannot_access_kiosk_settings(self):
        response = self.api.get(f"/api/groups/{self.group_a.pk}/kiosk-settings/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_cannot_manage_staff_accounts(self):
        response = self.api.get(reverse("workspace-staff-list"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_with_zero_assignments_sees_empty_groups(self):
        WorkspaceStaffGroupAccess.objects.filter(staff_account=self.staff).delete()
        response = self.api.get("/api/groups/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])


class WorkspaceStaffGroupAccessManagementTests(WorkspaceStaffGroupAccessBase):
    def setUp(self):
        super().setUp()
        self.api = login_owner(APIClient())

    def test_owner_can_set_staff_group_access(self):
        response = self.api.put(
            reverse("workspace-staff-group-access", args=[self.staff.pk]),
            {"group_ids": [self.group_a.pk, self.group_b.pk]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        assigned = {
            row["group_id"]
            for row in response.data["items"]
            if row["assigned"]
        }
        self.assertEqual(assigned, {self.group_a.pk, self.group_b.pk})

    def test_cannot_assign_cross_tenant_group(self):
        response = self.api.put(
            reverse("workspace-staff-group-access", args=[self.staff.pk]),
            {"group_ids": [self.other_group.pk]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            WorkspaceStaffGroupAccess.objects.filter(
                staff_account=self.staff,
                group=self.other_group,
            ).exists()
        )

    def test_new_staff_starts_with_zero_assignments(self):
        created = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="fresh.staff",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        self.assertEqual(
            WorkspaceStaffGroupAccess.objects.filter(staff_account=created).count(),
            0,
        )

    def test_admin_demoted_to_staff_clears_assignments(self):
        admin = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="former.admin",
            password="admin-password",
            role=WorkspaceStaffRole.ADMIN,
            email="former.admin@example.com",
        )
        response = self.api.patch(
            reverse("workspace-staff-detail", args=[admin.pk]),
            {"role": WorkspaceStaffRole.STAFF},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            WorkspaceStaffGroupAccess.objects.filter(staff_account=admin).count(),
            0,
        )

    def test_staff_promoted_to_admin_preserves_dormant_assignments(self):
        set_staff_group_access(
            staff_account=self.staff,
            organization=self.organization,
            group_ids=[self.group_a.pk],
        )
        response = self.api.patch(
            reverse("workspace-staff-detail", args=[self.staff.pk]),
            {"role": WorkspaceStaffRole.ADMIN, "email": "natsumi.admin@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            WorkspaceStaffGroupAccess.objects.filter(staff_account=self.staff).count(),
            1,
        )
