"""Batch 1 security regressions: Basic removal, reauth limits, staff reset sessions."""

from __future__ import annotations

import base64

from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.customer_two_factor_models import OwnerTOTPDevice
from accounts.owner_two_factor import encrypt_owner_totp_secret
from accounts.two_factor import generate_totp_secret
from organizations.models import (
    Organization,
    OrganizationPlan,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
)
from organizations.staff_deletion import STAFF_SESSION_BACKEND

User = get_user_model()


def _basic(identity: str, password: str) -> str:
    token = base64.b64encode(f"{identity}:{password}".encode()).decode()
    return f"Basic {token}"


def _create_owner(email: str, password: str = "secure-password"):
    user = User.objects.create_user(email=email, password=password)
    user.mark_email_verified()
    return user


def _login_owner(api: APIClient, email: str, password: str = "secure-password"):
    response = api.post(
        "/api/auth/login/",
        {"email": email, "password": password},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK, response.content
    return api


def _login_staff(api: APIClient, organization, username: str, password: str):
    response = api.post(
        "/api/auth/staff-login/",
        {
            "workspace_id": organization.workspace_id,
            "username": username,
            "password": password,
        },
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK, response.content
    return api


def _staff_session_count(staff_id: int) -> int:
    expected = str(staff_id)
    count = 0
    for session in Session.objects.filter(expire_date__gte=timezone.now()):
        data = session.get_decoded()
        if str(data.get("_auth_user_id") or "") != expected:
            continue
        if data.get("_auth_user_backend") != STAFF_SESSION_BACKEND:
            continue
        count += 1
    return count


class BasicAuthenticationRemovedTests(TestCase):
    def setUp(self):
        self.owner = _create_owner("basic-owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="basicstaff",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )

    def test_owner_basic_is_rejected_on_protected_endpoint(self):
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=_basic(self.owner.email, "secure-password")
        )
        response = client.get(reverse("current-workspace"))
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
        self.assertIsNone(response.get("WWW-Authenticate"))

    def test_staff_basic_is_rejected_on_protected_endpoint(self):
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=_basic("basicstaff", "staff-password"),
            HTTP_X_WORKSPACE_ID=self.organization.workspace_id,
        )
        response = client.get(reverse("current-workspace"))
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_session_auth_still_works_for_owner_and_staff(self):
        owner_client = _login_owner(APIClient(), self.owner.email)
        owner_resp = owner_client.get(reverse("current-workspace"))
        self.assertEqual(owner_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(owner_resp.data["account_kind"], "owner")

        staff_client = _login_staff(
            APIClient(), self.organization, "basicstaff", "staff-password"
        )
        staff_resp = staff_client.get(reverse("current-workspace"))
        self.assertEqual(staff_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(staff_resp.data["account_kind"], "workspace_staff")

    def test_owner_basic_cannot_bypass_2fa_enabled_account(self):
        """With confirmed 2FA, Basic must still fail to authenticate entirely."""
        OwnerTOTPDevice.objects.create(
            user=self.owner,
            secret_encrypted=encrypt_owner_totp_secret(generate_totp_secret()),
            confirmed=True,
        )
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=_basic(self.owner.email, "secure-password")
        )
        response = client.get(reverse("current-workspace"))
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


@override_settings(
    REAUTH_ACCOUNT_LIMIT=3,
    REAUTH_ACCOUNT_WINDOW=900,
    REAUTH_IP_LIMIT=50,
    REAUTH_IP_WINDOW=900,
)
class ReauthRateLimitTests(TestCase):
    def setUp(self):
        self.owner = _create_owner("reauth-owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.other = _create_owner("reauth-other@example.com")
        Organization.objects.create_with_owner(owner=self.other)
        self.api = _login_owner(APIClient(), self.owner.email)
        self.other_api = _login_owner(APIClient(), self.other.email)

    def test_correct_password_succeeds(self):
        response = self.api.post(
            "/api/auth/reauth/",
            {"password": "secure-password"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"ok": True})

    def test_wrong_password_fails_then_throttles(self):
        for _ in range(3):
            response = self.api.post(
                "/api/auth/reauth/",
                {"password": "wrong-password"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        blocked = self.api.post(
            "/api/auth/reauth/",
            {"password": "wrong-password"},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(blocked.data.get("code"), "rate_limited")

        # Correct password is also blocked while throttled.
        still_blocked = self.api.post(
            "/api/auth/reauth/",
            {"password": "secure-password"},
            format="json",
        )
        self.assertEqual(still_blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_one_actor_cannot_poison_another_reauth_counter(self):
        for _ in range(3):
            self.api.post(
                "/api/auth/reauth/",
                {"password": "wrong-password"},
                format="json",
            )
        other_ok = self.other_api.post(
            "/api/auth/reauth/",
            {"password": "secure-password"},
            format="json",
        )
        self.assertEqual(other_ok.status_code, status.HTTP_200_OK)

    def test_success_clears_failures_for_future_attempts(self):
        self.api.post(
            "/api/auth/reauth/",
            {"password": "wrong-password"},
            format="json",
        )
        ok = self.api.post(
            "/api/auth/reauth/",
            {"password": "secure-password"},
            format="json",
        )
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        # After clear, actor still has full allowance.
        for _ in range(3):
            bad = self.api.post(
                "/api/auth/reauth/",
                {"password": "wrong-password"},
                format="json",
            )
            self.assertEqual(bad.status_code, status.HTTP_403_FORBIDDEN)


class StaffPasswordResetInvalidatesSessionsTests(TestCase):
    def setUp(self):
        self.owner = _create_owner("reset-owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.organization.plan = OrganizationPlan.PLUS
        self.organization.save(update_fields=["plan"])
        self.admin = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="reset.admin",
            password="admin-password",
            role=WorkspaceStaffRole.ADMIN,
            email="reset.admin@example.com",
        )
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="reset.staff",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        self.owner_api = _login_owner(APIClient(), self.owner.email)

    def test_owner_reset_invalidates_staff_sessions_keeps_owner(self):
        staff_api = _login_staff(
            APIClient(), self.organization, "reset.staff", "staff-password"
        )
        self.assertEqual(_staff_session_count(self.staff.pk), 1)
        before = staff_api.get(reverse("current-workspace"))
        self.assertEqual(before.status_code, status.HTTP_200_OK)

        reset = self.owner_api.post(
            reverse("workspace-staff-reset-password", args=[self.staff.pk]),
            {"password": "brand-new-password-32"},
            format="json",
        )
        self.assertEqual(reset.status_code, status.HTTP_200_OK)
        self.assertEqual(_staff_session_count(self.staff.pk), 0)

        after = staff_api.get(reverse("current-workspace"))
        self.assertIn(
            after.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

        owner_still = self.owner_api.get(reverse("current-workspace"))
        self.assertEqual(owner_still.status_code, status.HTTP_200_OK)

        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password("brand-new-password-32"))
        self.assertFalse(self.staff.check_password("staff-password"))

        new_login = _login_staff(
            APIClient(), self.organization, "reset.staff", "brand-new-password-32"
        )
        self.assertEqual(
            new_login.get(reverse("current-workspace")).status_code,
            status.HTTP_200_OK,
        )

    def test_owner_reset_invalidates_admin_sessions(self):
        admin_api = _login_staff(
            APIClient(), self.organization, "reset.admin", "admin-password"
        )
        self.assertEqual(_staff_session_count(self.admin.pk), 1)
        reset = self.owner_api.post(
            reverse("workspace-staff-reset-password", args=[self.admin.pk]),
            {"password": "brand-new-admin-password-32"},
            format="json",
        )
        self.assertEqual(reset.status_code, status.HTTP_200_OK)
        self.assertEqual(_staff_session_count(self.admin.pk), 0)
        after = admin_api.get(reverse("current-workspace"))
        self.assertIn(
            after.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_admin_reset_invalidates_staff_sessions_only(self):
        admin_api = _login_staff(
            APIClient(), self.organization, "reset.admin", "admin-password"
        )
        staff_api = _login_staff(
            APIClient(), self.organization, "reset.staff", "staff-password"
        )
        reset = admin_api.post(
            reverse("workspace-staff-reset-password", args=[self.staff.pk]),
            {"password": "admin-set-staff-password-32"},
            format="json",
        )
        self.assertEqual(reset.status_code, status.HTTP_200_OK)
        self.assertEqual(_staff_session_count(self.staff.pk), 0)
        self.assertEqual(_staff_session_count(self.admin.pk), 1)
        self.assertIn(
            staff_api.get(reverse("current-workspace")).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
        self.assertEqual(
            admin_api.get(reverse("current-workspace")).status_code,
            status.HTTP_200_OK,
        )

    def test_admin_cannot_reset_admin_password(self):
        admin_api = _login_staff(
            APIClient(), self.organization, "reset.admin", "admin-password"
        )
        response = admin_api.post(
            reverse("workspace-staff-reset-password", args=[self.admin.pk]),
            {"password": "should-not-work-password-32"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(_staff_session_count(self.admin.pk), 1)
