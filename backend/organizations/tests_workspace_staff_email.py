from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from organizations.models import (
    Organization,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
    WorkspaceStaffStatus,
)
from organizations.staff_email import (
    STAFF_ADMIN_EMAIL_REQUIRED_MESSAGE,
    STAFF_EMAIL_DUPLICATE_MESSAGE,
    normalize_staff_email,
    validate_staff_account_email,
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


class WorkspaceStaffEmailModelTests(TestCase):
    def setUp(self):
        self.owner = create_user("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)

    def test_admin_without_email_rejected(self):
        with self.assertRaises(ValidationError) as ctx:
            WorkspaceStaffAccount.objects.create_account(
                organization=self.organization,
                username="admin.noemail",
                password="staff-password",
                role=WorkspaceStaffRole.ADMIN,
            )
        self.assertIn("email", ctx.exception.message_dict)

    def test_admin_with_email_succeeds(self):
        admin = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="admin.withemail",
            password="staff-password",
            role=WorkspaceStaffRole.ADMIN,
            email="Admin@Example.com",
        )
        self.assertEqual(admin.email, "admin@example.com")

    def test_staff_without_email_succeeds(self):
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="staff.noemail",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        self.assertEqual(staff.email, "")

    def test_staff_with_email_succeeds(self):
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="staff.withemail",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
            email="staff@example.com",
        )
        self.assertEqual(staff.email, "staff@example.com")

    def test_admin_admin_duplicate_same_workspace_rejected(self):
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="admin.one",
            password="staff-password",
            role=WorkspaceStaffRole.ADMIN,
            email="dup@example.com",
        )
        with self.assertRaises(ValidationError) as ctx:
            WorkspaceStaffAccount.objects.create_account(
                organization=self.organization,
                username="admin.two",
                password="staff-password",
                role=WorkspaceStaffRole.ADMIN,
                email="dup@example.com",
            )
        self.assertEqual(
            ctx.exception.message_dict["email"][0],
            STAFF_EMAIL_DUPLICATE_MESSAGE,
        )

    def test_admin_staff_duplicate_same_workspace_rejected(self):
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="admin.dup",
            password="staff-password",
            role=WorkspaceStaffRole.ADMIN,
            email="shared@example.com",
        )
        with self.assertRaises(ValidationError) as ctx:
            WorkspaceStaffAccount.objects.create_account(
                organization=self.organization,
                username="staff.dup",
                password="staff-password",
                role=WorkspaceStaffRole.STAFF,
                email="shared@example.com",
            )
        self.assertEqual(
            ctx.exception.message_dict["email"][0],
            STAFF_EMAIL_DUPLICATE_MESSAGE,
        )

    def test_staff_staff_duplicate_same_workspace_rejected(self):
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="staff.one",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
            email="staff.dup@example.com",
        )
        with self.assertRaises(ValidationError) as ctx:
            WorkspaceStaffAccount.objects.create_account(
                organization=self.organization,
                username="staff.two",
                password="staff-password",
                role=WorkspaceStaffRole.STAFF,
                email="Staff.Dup@Example.com",
            )
        self.assertEqual(
            ctx.exception.message_dict["email"][0],
            STAFF_EMAIL_DUPLICATE_MESSAGE,
        )

    def test_case_insensitive_duplicate_rejected(self):
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="case.one",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
            email="Test@Example.com",
        )
        with self.assertRaises(ValidationError) as ctx:
            WorkspaceStaffAccount.objects.create_account(
                organization=self.organization,
                username="case.two",
                password="staff-password",
                role=WorkspaceStaffRole.STAFF,
                email="test@example.com",
            )
        self.assertEqual(
            ctx.exception.message_dict["email"][0],
            STAFF_EMAIL_DUPLICATE_MESSAGE,
        )

    def test_same_email_in_different_workspaces_allowed(self):
        other = Organization.objects.create_with_owner(
            owner=create_user("other-owner@example.com")
        )
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="local.admin",
            password="staff-password",
            role=WorkspaceStaffRole.ADMIN,
            email="shared@example.com",
        )
        other_admin = WorkspaceStaffAccount.objects.create_account(
            organization=other,
            username="remote.admin",
            password="staff-password",
            role=WorkspaceStaffRole.ADMIN,
            email="shared@example.com",
        )
        self.assertEqual(other_admin.email, "shared@example.com")

    def test_staff_email_may_equal_owner_user_email(self):
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="same.as.owner",
            password="staff-password",
            role=WorkspaceStaffRole.ADMIN,
            email="owner@example.com",
        )
        self.assertTrue(User.objects.filter(email="owner@example.com").exists())

    def test_editing_account_does_not_collide_with_itself(self):
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="self.edit",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
            email="self@example.com",
        )
        staff.email = "Self@Example.com"
        staff.save()
        staff.refresh_from_db()
        self.assertEqual(staff.email, "self@example.com")

    def test_normalize_staff_email(self):
        self.assertEqual(normalize_staff_email("  Test@Example.com  "), "test@example.com")
        self.assertEqual(normalize_staff_email(None), "")
        self.assertEqual(normalize_staff_email(""), "")


class WorkspaceStaffEmailAPITests(TestCase):
    def setUp(self):
        self.owner = create_user("owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.api = login_owner(APIClient())

    def test_api_rejects_admin_without_email(self):
        response = self.api.post(
            reverse("workspace-staff-list"),
            {
                "username": "new.admin",
                "role": WorkspaceStaffRole.ADMIN,
                "password": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
        self.assertEqual(
            response.data["email"][0],
            STAFF_ADMIN_EMAIL_REQUIRED_MESSAGE,
        )

    def test_api_allows_staff_without_email(self):
        response = self.api.post(
            reverse("workspace-staff-list"),
            {
                "username": "new.staff",
                "role": WorkspaceStaffRole.STAFF,
                "password": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = WorkspaceStaffAccount.objects.get(username="new.staff")
        self.assertEqual(created.email, "")

    def test_api_rejects_duplicate_email_with_workspace_message(self):
        WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="existing",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
            email="dup@example.com",
        )
        response = self.api.post(
            reverse("workspace-staff-list"),
            {
                "username": "another",
                "email": "Dup@Example.com",
                "role": WorkspaceStaffRole.STAFF,
                "password": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["email"][0],
            STAFF_EMAIL_DUPLICATE_MESSAGE,
        )

    def test_staff_without_email_cannot_be_promoted_to_admin(self):
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="promote.me",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        response = self.api.patch(
            reverse("workspace-staff-detail", args=[staff.pk]),
            {"role": WorkspaceStaffRole.ADMIN},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
        staff.refresh_from_db()
        self.assertEqual(staff.role, WorkspaceStaffRole.STAFF)

    def test_staff_with_email_can_be_promoted_to_admin(self):
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="promote.ok",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
            email="promote.ok@example.com",
        )
        response = self.api.patch(
            reverse("workspace-staff-detail", args=[staff.pk]),
            {"role": WorkspaceStaffRole.ADMIN},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        staff.refresh_from_db()
        self.assertEqual(staff.role, WorkspaceStaffRole.ADMIN)
        self.assertEqual(staff.email, "promote.ok@example.com")

    def test_admin_to_staff_may_keep_email(self):
        admin = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="demote.admin",
            password="staff-password",
            role=WorkspaceStaffRole.ADMIN,
            email="demote.admin@example.com",
        )
        response = self.api.patch(
            reverse("workspace-staff-detail", args=[admin.pk]),
            {"role": WorkspaceStaffRole.STAFF},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        admin.refresh_from_db()
        self.assertEqual(admin.role, WorkspaceStaffRole.STAFF)
        self.assertEqual(admin.email, "demote.admin@example.com")
