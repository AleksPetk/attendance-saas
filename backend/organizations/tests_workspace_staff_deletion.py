from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.test import TestCase

from attendance.models import ActionRecord, ActionSource, ActionType
from content.models import Announcement, AnnouncementAcknowledgement
from groups.models import Group, GroupType
from members.models import Member
from organizations.models import (
    Organization,
    OrganizationPlan,
    WorkspaceStaffAccount,
    WorkspaceStaffGroupAccess,
    WorkspaceStaffRole,
    WorkspaceStaffStatus,
)


User = get_user_model()


def create_owner(email):
    owner = User.objects.create_user(email=email, password="secure-password")
    owner.mark_email_verified()
    return owner


def login_owner(owner):
    client = APIClient()
    response = client.post(
        "/api/auth/login/",
        {"email": owner.email, "password": "secure-password"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    return client


def login_staff(organization, username, password):
    client = APIClient()
    response = client.post(
        "/api/auth/staff-login/",
        {
            "workspace_id": organization.workspace_id,
            "username": username,
            "password": password,
        },
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    return client


class WorkspaceStaffPermanentDeletionTests(TestCase):
    def setUp(self):
        self.owner = create_owner("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.organization.plan = OrganizationPlan.PLUS
        self.organization.save(update_fields=["plan"])
        self.admin = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="workspace.admin",
            email="workspace.admin@example.com",
            password="admin-password",
            role=WorkspaceStaffRole.ADMIN,
        )
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="workspace.staff",
            email="workspace.staff@example.com",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        self.other_owner = create_owner("other-owner@example.com")
        self.other_organization = Organization.objects.create_with_owner(
            owner=self.other_owner
        )
        self.other_organization.plan = OrganizationPlan.PLUS
        self.other_organization.save(update_fields=["plan"])
        self.other_staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.other_organization,
            username="other.staff",
            password="other-password",
            role=WorkspaceStaffRole.STAFF,
        )
        self.owner_client = login_owner(self.owner)

    def _detail_url(self, account):
        return reverse("workspace-staff-detail", args=[account.pk])

    def test_owner_permanently_deletes_inactive_staff_and_private_dependents(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="Front desk",
            group_type=GroupType.STANDARD,
        )
        access = WorkspaceStaffGroupAccess.objects.create(
            staff_account=self.staff,
            group=group,
        )
        announcement = Announcement.objects.create(
            title="Workspace notice",
            message="A notice",
        )
        acknowledgement = AnnouncementAcknowledgement.objects.create(
            announcement=announcement,
            workspace_staff_account=self.staff,
        )
        member = Member.objects.create(
            organization=self.organization,
            name="Historical participant",
        )
        action = ActionRecord.objects.create(
            organization=self.organization,
            group=group,
            participant_kind="member",
            member=member,
            action_type=ActionType.CHECK_IN,
            source=ActionSource.KIOSK,
            participant_name_snapshot=member.name,
            group_name_snapshot=group.name,
        )
        old_id = self.staff.pk
        old_username = self.staff.username
        self.staff.deactivate()

        response = self.owner_client.delete(self._detail_url(self.staff))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(WorkspaceStaffAccount.objects.filter(pk=old_id).exists())
        self.assertFalse(WorkspaceStaffGroupAccess.objects.filter(pk=access.pk).exists())
        self.assertFalse(
            AnnouncementAcknowledgement.objects.filter(pk=acknowledgement.pk).exists()
        )
        self.assertTrue(ActionRecord.objects.filter(pk=action.pk).exists())
        self.assertTrue(Group.objects.filter(pk=group.pk).exists())
        self.assertTrue(Member.objects.filter(pk=member.pk).exists())
        failed_login = APIClient().post(
            "/api/auth/staff-login/",
            {
                "workspace_id": self.organization.workspace_id,
                "username": old_username,
                "password": "staff-password",
            },
            format="json",
        )
        self.assertEqual(failed_login.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())

    def test_workspace_admin_can_permanently_delete_inactive_staff(self):
        admin_client = login_staff(
            self.organization,
            self.admin.username,
            "admin-password",
        )
        self.staff.deactivate()

        response = admin_client.delete(self._detail_url(self.staff))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(WorkspaceStaffAccount.objects.filter(pk=self.staff.pk).exists())

    def test_owner_can_permanently_delete_inactive_admin(self):
        self.admin.deactivate()

        response = self.owner_client.delete(self._detail_url(self.admin))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(WorkspaceStaffAccount.objects.filter(pk=self.admin.pk).exists())

    def test_active_account_cannot_be_deleted(self):
        response = self.owner_client.delete(self._detail_url(self.staff))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "account_active")
        self.assertTrue(WorkspaceStaffAccount.objects.filter(pk=self.staff.pk).exists())

    def test_workspace_admin_cannot_delete_admin(self):
        admin_client = login_staff(
            self.organization,
            self.admin.username,
            "admin-password",
        )
        target_admin = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="target.admin",
            email="target.admin@example.com",
            password="target-password",
            role=WorkspaceStaffRole.ADMIN,
        )
        target_admin.deactivate()

        response = admin_client.delete(self._detail_url(target_admin))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(WorkspaceStaffAccount.objects.filter(pk=target_admin.pk).exists())

    def test_cross_workspace_delete_returns_not_found(self):
        self.other_staff.deactivate()

        response = self.owner_client.delete(self._detail_url(self.other_staff))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(
            WorkspaceStaffAccount.objects.filter(pk=self.other_staff.pk).exists()
        )

    def test_staff_role_cannot_delete_workspace_accounts(self):
        another_staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="another.staff",
            password="another-password",
            role=WorkspaceStaffRole.STAFF,
        )
        another_staff.deactivate()
        staff_client = login_staff(
            self.organization,
            self.staff.username,
            "staff-password",
        )

        response = staff_client.delete(self._detail_url(another_staff))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(
            WorkspaceStaffAccount.objects.filter(pk=another_staff.pk).exists()
        )

    def test_feature_never_deletes_owner_or_platform_admin_users(self):
        platform_admin = User.objects.create_superuser(
            email="platform@example.com",
            password="platform-password",
        )
        self.staff.deactivate()

        response = self.owner_client.delete(self._detail_url(self.staff))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())
        self.assertTrue(User.objects.filter(pk=platform_admin.pk).exists())

    def test_deletion_invalidates_existing_staff_session(self):
        staff_client = login_staff(
            self.organization,
            self.staff.username,
            "staff-password",
        )
        self.staff.deactivate()
        response = self.owner_client.delete(self._detail_url(self.staff))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        session_response = staff_client.get(reverse("current-workspace"))
        self.assertIn(
            session_response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
