from unittest.mock import patch

import base64

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import Client, TestCase
from django.urls import NoReverseMatch, reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.testing import force_platform_admin_login
from organizations.models import (
    WORKSPACE_ID_PATTERN,
    Organization,
    OrganizationStatus,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
    WorkspaceStaffStatus,
    generate_workspace_id,
)
from organizations.authentication import WorkspaceStaffSessionAuthenticationBackend

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True, **extra_fields):
    user = User.objects.create_user(email=email, password=password, **extra_fields)
    if verified:
        user.mark_email_verified()
    return user


def basic_auth_header(username, password):
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return f"Basic {token}"


class OrganizationModelTests(TestCase):
    def test_create_with_owner_generates_workspace_id(self):
        owner = create_user("owner@example.com")
        organization = Organization.objects.create_with_owner(owner=owner)

        organization.refresh_from_db()
        self.assertRegex(organization.workspace_id, WORKSPACE_ID_PATTERN)
        self.assertEqual(organization.internal_label, "")
        self.assertEqual(organization.owner, owner)
        self.assertEqual(organization.status, OrganizationStatus.ACTIVE)
        self.assertEqual(owner.owned_organization, organization)
        self.assertFalse(owner.is_staff)
        self.assertFalse(WorkspaceStaffAccount.objects.exists())

    def test_workspace_ids_are_globally_unique(self):
        first = Organization.objects.create_with_owner(
            owner=create_user("a@example.com")
        )
        second = Organization.objects.create_with_owner(
            owner=create_user("b@example.com")
        )

        self.assertNotEqual(first.workspace_id, second.workspace_id)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Organization.objects.create(
                    owner=create_user("c@example.com"),
                    workspace_id=first.workspace_id,
                )

    def test_workspace_id_cannot_be_changed_after_creation(self):
        organization = Organization.objects.create_with_owner(
            owner=create_user("owner@example.com")
        )
        original = organization.workspace_id
        organization.workspace_id = "AAAAAA" if original != "AAAAAA" else "BBBBBB"

        with self.assertRaises(ValidationError):
            organization.save()

        organization.refresh_from_db()
        self.assertEqual(organization.workspace_id, original)

    def test_workspace_id_collision_retries_until_unique(self):
        existing = Organization.objects.create_with_owner(
            owner=create_user("a@example.com")
        )
        unique_id = "ZZZZZZ" if existing.workspace_id != "ZZZZZZ" else "YYYYYY"

        with patch(
            "organizations.models.generate_workspace_id",
            side_effect=[existing.workspace_id, existing.workspace_id, unique_id],
        ):
            other = Organization.objects.create_with_owner(
                owner=create_user("b@example.com")
            )

        self.assertEqual(other.workspace_id, unique_id)

    def test_generated_workspace_id_matches_chosen_format(self):
        workspace_id = generate_workspace_id()

        self.assertRegex(workspace_id, WORKSPACE_ID_PATTERN)
        self.assertEqual(len(workspace_id), 6)

    def test_paying_user_cannot_own_two_organizations(self):
        owner = create_user("owner@example.com")
        Organization.objects.create_with_owner(owner=owner)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Organization.objects.create_with_owner(owner=owner)

    def test_internal_label_is_optional_and_not_unique(self):
        Organization.objects.create_with_owner(
            owner=create_user("a@example.com"),
            internal_label="Support note",
        )
        Organization.objects.create_with_owner(
            owner=create_user("b@example.com"),
            internal_label="Support note",
        )

        self.assertEqual(
            Organization.objects.filter(internal_label="Support note").count(),
            2,
        )

    def test_customer_user_without_workspace_does_not_gain_one(self):
        stranger = create_user("stranger@example.com")

        self.assertFalse(Organization.objects.filter(owner=stranger).exists())
        with self.assertRaises(Organization.DoesNotExist):
            stranger.owned_organization

    def test_delete_archives_instead_of_removing_row(self):
        owner = create_user("owner@example.com")
        organization = Organization.objects.create_with_owner(owner=owner)
        workspace_id = organization.workspace_id

        organization.delete()
        organization.refresh_from_db()

        self.assertEqual(organization.status, OrganizationStatus.ARCHIVED)
        self.assertIsNotNone(organization.archived_at)
        self.assertEqual(organization.owner, owner)
        self.assertEqual(organization.workspace_id, workspace_id)

    def test_owner_user_delete_is_protected(self):
        owner = create_user("owner@example.com")
        Organization.objects.create_with_owner(owner=owner)

        with self.assertRaises(ProtectedError):
            owner.delete()


class WorkspaceStaffAccountTests(TestCase):
    def setUp(self):
        self.owner = create_user("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)

    def test_create_admin_and_staff_accounts_scoped_to_organization(self):
        admin = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="Jane.Admin",
            password="staff-password",
            role=WorkspaceStaffRole.ADMIN,
            email="Jane@School.com",
        )
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )

        admin.refresh_from_db()
        self.assertEqual(admin.username, "jane.admin")
        self.assertEqual(admin.email, "jane@school.com")
        self.assertEqual(admin.role, WorkspaceStaffRole.ADMIN)
        self.assertTrue(admin.check_password("staff-password"))
        self.assertEqual(staff.role, WorkspaceStaffRole.STAFF)
        self.assertEqual(User.objects.count(), 1)
        self.assertFalse(User.objects.filter(email="jane@school.com").exists())

    def test_same_username_allowed_in_different_workspaces(self):
        other = Organization.objects.create_with_owner(
            owner=create_user("other-owner@example.com")
        )
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        WorkspaceStaffAccount.objects.create_account(
            organization=other,
            username="natsumi",
            password="other-password",
            role=WorkspaceStaffRole.ADMIN,
            email="natsumi.admin@example.com",
        )

        self.assertEqual(
            WorkspaceStaffAccount.objects.filter(username="natsumi").count(),
            2,
        )

    def test_duplicate_username_in_same_workspace_is_rejected(self):
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                WorkspaceStaffAccount.objects.create_account(
                    organization=self.organization,
                    username="NATSUMI",
                    password="other-password",
                    role=WorkspaceStaffRole.ADMIN,
                    email="duplicate.username.admin@example.com",
                )

    def test_same_staff_email_allowed_in_different_workspaces(self):
        other = Organization.objects.create_with_owner(
            owner=create_user("other-owner@example.com")
        )
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
            email="natsumi@example.com",
        )
        WorkspaceStaffAccount.objects.create_account(
            organization=other,
            username="natsumi",
            password="other-password",
            role=WorkspaceStaffRole.STAFF,
            email="natsumi@example.com",
        )

        self.assertEqual(
            WorkspaceStaffAccount.objects.filter(email="natsumi@example.com").count(),
            2,
        )

    def test_duplicate_email_in_same_workspace_is_rejected(self):
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.ADMIN,
            email="natsumi@example.com",
        )

        with self.assertRaises(ValidationError):
            WorkspaceStaffAccount.objects.create_account(
                organization=self.organization,
                username="other",
                password="staff-password",
                role=WorkspaceStaffRole.STAFF,
                email="Natsumi@Example.com",
            )

    def test_staff_email_may_match_a_global_user_email(self):
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="teacher",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
            email="owner@example.com",
        )

        self.assertEqual(User.objects.filter(email="owner@example.com").count(), 1)
        self.assertTrue(
            WorkspaceStaffAccount.objects.filter(email="owner@example.com").exists()
        )

    def test_staff_account_cannot_move_between_organizations(self):
        other = Organization.objects.create_with_owner(
            owner=create_user("other-owner@example.com")
        )
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        staff.organization = other

        with self.assertRaises(ValidationError):
            staff.save()

    def test_delete_deactivates_instead_of_removing_row(self):
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )

        staff.delete()
        staff.refresh_from_db()

        self.assertEqual(staff.status, WorkspaceStaffStatus.INACTIVE)
        self.assertIsNotNone(staff.deactivated_at)
        self.assertEqual(Organization.objects.filter(pk=self.organization.pk).count(), 1)
        self.assertEqual(User.objects.filter(pk=self.owner.pk).count(), 1)

    def test_owner_role_is_not_a_staff_account_role(self):
        field = WorkspaceStaffAccount._meta.get_field("role")
        role_values = {choice[0] for choice in field.choices}

        self.assertEqual(role_values, {"admin", "staff"})
        self.assertNotIn("owner", role_values)


class CurrentWorkspaceAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = create_user("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(reverse("current-workspace"))

        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_paying_owner_receives_workspace_without_workspace_id(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("owner@example.com", "secure-password")
        )
        response = self.client.get(reverse("current-workspace"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["account_kind"], "owner")
        self.assertEqual(response.data["role"], "owner")
        self.assertEqual(response.data["identity"], "owner@example.com")
        self.assertFalse(response.data["is_platform_operator"])
        self.assertEqual(response.data["workspace_id"], self.organization.workspace_id)
        self.assertNotIn("id", response.data)

    def test_workspace_staff_login_uses_workspace_id_username_and_password(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("natsumi", "staff-password"),
            HTTP_X_WORKSPACE_ID=self.organization.workspace_id,
        )
        response = self.client.get(reverse("current-workspace"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["account_kind"], "workspace_staff")
        self.assertEqual(response.data["role"], WorkspaceStaffRole.STAFF)
        self.assertEqual(response.data["identity"], "natsumi")
        self.assertFalse(response.data["is_platform_operator"])
        self.assertEqual(response.data["workspace_id"], self.organization.workspace_id)
        self.assertFalse(User.objects.filter(email="natsumi").exists())

    def test_same_staff_username_in_two_workspaces_is_isolated(self):
        other = Organization.objects.create_with_owner(
            owner=create_user("other-owner@example.com")
        )
        WorkspaceStaffAccount.objects.create_account(
            organization=other,
            username="natsumi",
            password="other-password",
            role=WorkspaceStaffRole.ADMIN,
            email="natsumi.other@example.com",
        )

        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("natsumi", "staff-password"),
            HTTP_X_WORKSPACE_ID=self.organization.workspace_id,
        )
        first = self.client.get(reverse("current-workspace"))
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("natsumi", "other-password"),
            HTTP_X_WORKSPACE_ID=other.workspace_id,
        )
        second = self.client.get(reverse("current-workspace"))

        self.assertEqual(first.data["workspace_id"], self.organization.workspace_id)
        self.assertEqual(first.data["role"], WorkspaceStaffRole.STAFF)
        self.assertEqual(second.data["workspace_id"], other.workspace_id)
        self.assertEqual(second.data["role"], WorkspaceStaffRole.ADMIN)

    def test_staff_login_with_wrong_workspace_id_fails(self):
        other = Organization.objects.create_with_owner(
            owner=create_user("other-owner@example.com")
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("natsumi", "staff-password"),
            HTTP_X_WORKSPACE_ID=other.workspace_id,
        )
        response = self.client.get(reverse("current-workspace"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inactive_staff_cannot_load_workspace(self):
        self.staff.deactivate()
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("natsumi", "staff-password"),
            HTTP_X_WORKSPACE_ID=self.organization.workspace_id,
        )
        response = self.client.get(reverse("current-workspace"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_raw_numeric_organization_id_is_not_accepted(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("natsumi", "staff-password"),
            HTTP_X_WORKSPACE_ID=str(self.organization.pk),
        )
        response = self.client.get(reverse("current-workspace"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_legacy_organization_id_header_is_not_accepted(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("natsumi", "staff-password"),
            HTTP_X_ORGANIZATION_ID=str(self.organization.pk),
        )
        response = self.client.get(reverse("current-workspace"))

        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_staff_login_without_workspace_id_fails(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("natsumi", "staff-password")
        )
        response = self.client.get(reverse("current-workspace"))

        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_wrong_staff_password_is_unauthorized(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("natsumi", "wrong-password"),
            HTTP_X_WORKSPACE_ID=self.organization.workspace_id,
        )
        response = self.client.get(reverse("current-workspace"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_platform_operator_without_workspace_is_identified(self):
        platform = User.objects.create_superuser(
            email="platform@example.com",
            password="secure-password",
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("platform@example.com", "secure-password")
        )
        response = self.client.get(reverse("current-workspace"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["account_kind"], "platform_operator")
        self.assertIsNone(response.data["role"])
        self.assertTrue(response.data["is_platform_operator"])
        self.assertIsNone(response.data["workspace_id"])
        self.assertEqual(platform.email, "platform@example.com")

    def test_owner_who_is_also_platform_operator_is_flagged(self):
        self.owner.is_staff = True
        self.owner.is_superuser = True
        self.owner.save(update_fields=["is_staff", "is_superuser"])
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(reverse("current-workspace"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["account_kind"], "owner")
        self.assertTrue(response.data["is_platform_operator"])
        self.assertEqual(response.data["workspace_id"], self.organization.workspace_id)

    def test_paying_user_without_workspace_receives_not_found(self):
        stranger = create_user("stranger@example.com")
        self.client.force_authenticate(user=stranger)
        response = self.client.get(reverse("current-workspace"))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(Organization.objects.filter(owner=stranger).exists())

    def test_archived_organization_is_not_a_workspace_for_owner(self):
        self.organization.archive()
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(reverse("current-workspace"))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class OrganizationAdminTests(TestCase):
    def setUp(self):
        self.platform_admin = User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        self.client = Client()
        force_platform_admin_login(self.client, self.platform_admin)
        self.owner = create_user("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)

    def test_organization_changelist_and_add_form_load(self):
        changelist = self.client.get(reverse("admin:organizations_organization_changelist"))
        add_form = self.client.get(reverse("admin:organizations_organization_add"))

        self.assertEqual(changelist.status_code, 200)
        self.assertEqual(add_form.status_code, 200)
        self.assertContains(add_form, "workspace_id")
        self.assertNotContains(add_form, 'name="workspace_id"')

    def test_staff_account_changelist_and_add_form_load(self):
        changelist = self.client.get(
            reverse("admin:organizations_workspacestaffaccount_changelist")
        )
        add_form = self.client.get(
            reverse("admin:organizations_workspacestaffaccount_add")
        )

        self.assertEqual(changelist.status_code, 200)
        self.assertEqual(add_form.status_code, 200)

    def test_old_membership_admin_is_gone(self):
        with self.assertRaises(NoReverseMatch):
            reverse("admin:organizations_organizationmembership_changelist")

    def test_platform_superuser_can_access_django_admin(self):
        response = self.client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, 200)

    def test_normal_customer_user_cannot_access_django_admin(self):
        customer = create_user("customer@example.com")
        client = Client()
        client.force_login(customer)
        response = client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response.url)

    def test_workspace_staff_cannot_access_django_admin(self):
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.ADMIN,
            email="natsumi.admin@example.com",
        )
        client = Client()
        logged_in = client.login(username="natsumi", password="staff-password")

        self.assertFalse(logged_in)
        self.assertFalse(User.objects.filter(email="natsumi").exists())
        response = client.get(reverse("admin:index"))
        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response.url)


class WorkspaceStaffSessionAuthenticationBackendTests(TestCase):
    def setUp(self):
        self.owner = create_user("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        self.backend = WorkspaceStaffSessionAuthenticationBackend()

    def test_authenticate_returns_active_staff(self):
        authenticated = self.backend.authenticate(
            None,
            workspace_id=self.organization.workspace_id,
            username="NATSUMI",
            password="staff-password",
        )
        self.assertIsNotNone(authenticated)
        self.assertEqual(authenticated.pk, self.staff.pk)
        self.assertTrue(authenticated.is_authenticated)
        self.assertTrue(authenticated.is_active)

    def test_authenticate_rejects_wrong_password(self):
        authenticated = self.backend.authenticate(
            None,
            workspace_id=self.organization.workspace_id,
            username="natsumi",
            password="wrong-password",
        )
        self.assertIsNone(authenticated)

    def test_authenticate_rejects_wrong_workspace_id(self):
        other = Organization.objects.create_with_owner(owner=create_user("other@example.com"))
        authenticated = self.backend.authenticate(
            None,
            workspace_id=other.workspace_id,
            username="natsumi",
            password="staff-password",
        )
        self.assertIsNone(authenticated)

    def test_authenticate_rejects_inactive_staff(self):
        self.staff.deactivate()
        authenticated = self.backend.authenticate(
            None,
            workspace_id=self.organization.workspace_id,
            username="natsumi",
            password="staff-password",
        )
        self.assertIsNone(authenticated)


class SessionAuthEndpointsTests(TestCase):
    """
    Focused session-flow tests for the new browser auth endpoints:
    - /api/auth/register/
    - /api/auth/login/
    - /api/auth/logout/
    - /api/auth/staff-login/
    """

    def setUp(self):
        self.api = APIClient()
        self.owner_email = "owner@example.com"
        self.owner_password = "secure-password"
        self.owner = create_user(self.owner_email, password=self.owner_password)
        self.organization = Organization.objects.create_with_owner(owner=self.owner)

        self.staff_username = "natsumi"
        self.staff_password = "staff-password"
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username=self.staff_username,
            password=self.staff_password,
            role=WorkspaceStaffRole.STAFF,
        )

    def test_owner_registration_creates_single_workspace(self):
        api2 = APIClient()
        payload = {
            "email": "newowner@example.com",
            "password": "secure-password",
            "password_confirm": "secure-password",
        }
        with patch("organizations.views.send_verification_email_for_user") as send_mail:
            resp = api2.post("/api/auth/register/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["email"], "newowner@example.com")
        self.assertFalse(resp.data["email_verified"])
        self.assertTrue(resp.data["verification_email_sent"])
        self.assertTrue(resp.data["workspace_created"])
        send_mail.assert_called_once()
        user = User.objects.get(email="newowner@example.com")
        self.assertFalse(user.email_verified)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(Organization.objects.filter(owner=user).count(), 1)

        workspace = api2.get("/api/workspace/")
        self.assertEqual(workspace.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(workspace.data["code"], "email_not_verified")

    def test_owner_login_logout_clears_session(self):
        self.api.post(
            "/api/auth/login/",
            {"email": self.owner_email, "password": self.owner_password},
            format="json",
        )

        resp = self.api.get(reverse("current-workspace"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["account_kind"], "owner")

        logout_resp = self.api.post("/api/auth/logout/", {}, format="json")
        self.assertEqual(logout_resp.status_code, status.HTTP_204_NO_CONTENT)

        resp2 = self.api.get(reverse("current-workspace"))
        self.assertIn(resp2.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_staff_login_by_workspace_id_and_username(self):
        resp = self.api.post(
            "/api/auth/staff-login/",
            {
                "workspace_id": self.organization.workspace_id,
                "username": self.staff_username,
                "password": self.staff_password,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["account_kind"], "workspace_staff")

        # Session cookie should allow loading the workspace context.
        ws_resp = self.api.get(reverse("current-workspace"))
        self.assertEqual(ws_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(ws_resp.data["account_kind"], "workspace_staff")
        self.assertEqual(ws_resp.data["workspace_id"], self.organization.workspace_id)

    def test_staff_login_wrong_workspace_id_fails(self):
        other_org = Organization.objects.create_with_owner(owner=create_user("other@example.com"))
        resp = self.api.post(
            "/api/auth/staff-login/",
            {
                "workspace_id": other_org.workspace_id,
                "username": self.staff_username,
                "password": self.staff_password,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
