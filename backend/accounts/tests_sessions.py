from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from rest_framework.test import APIClient

from accounts.testing import login_platform_admin_through_2fa
from organizations.models import Organization, WorkspaceStaffAccount, WorkspaceStaffRole

User = get_user_model()


def _cookie_value(client, name):
    morsel = client.cookies.get(name)
    return morsel.value if morsel else None


class PlatformAdminSessionIsolationTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin = User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        self.owner = User.objects.create_user(
            email="owner@example.com",
            password="secure-password",
        )
        self.owner.mark_email_verified()
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )

    def _login_admin(self):
        login_platform_admin_through_2fa(
            self.client,
            "platform-admin@example.com",
            "secure-password",
        )
        admin_home = self.client.get("/admin/")
        self.assertEqual(admin_home.status_code, 200)
        return _cookie_value(self.client, settings.ADMIN_SESSION_COOKIE_NAME)

    def _login_owner(self):
        response = self.client.post(
            "/api/auth/login/",
            {"email": "owner@example.com", "password": "secure-password"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        return _cookie_value(self.client, settings.SESSION_COOKIE_NAME)

    def _login_staff(self):
        response = self.client.post(
            "/api/auth/staff-login/",
            {
                "workspace_id": self.organization.workspace_id,
                "username": "natsumi",
                "password": "staff-password",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        return _cookie_value(self.client, settings.SESSION_COOKIE_NAME)

    def test_admin_session_survives_customer_login(self):
        admin_key = self._login_admin()
        self._login_owner()

        self.assertEqual(
            _cookie_value(self.client, settings.ADMIN_SESSION_COOKIE_NAME),
            admin_key,
        )
        self.assertEqual(self.client.get("/admin/").status_code, 200)
        workspace = self.client.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.assertEqual(workspace.json()["account_kind"], "owner")

    def test_admin_session_survives_customer_logout(self):
        admin_key = self._login_admin()
        self._login_owner()
        logout = self.client.post("/api/auth/logout/", {}, content_type="application/json")
        self.assertEqual(logout.status_code, 204)

        self.assertEqual(
            _cookie_value(self.client, settings.ADMIN_SESSION_COOKIE_NAME),
            admin_key,
        )
        self.assertEqual(self.client.get("/admin/").status_code, 200)
        workspace = self.client.get("/api/workspace/")
        self.assertIn(workspace.status_code, (401, 403))

    def test_customer_session_survives_admin_logout(self):
        self._login_admin()
        self._login_owner()
        logout = self.client.post("/admin/logout/")
        self.assertIn(logout.status_code, (200, 302))

        self.assertEqual(self.client.get("/admin/").status_code, 302)
        workspace = self.client.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.assertEqual(workspace.json()["account_kind"], "owner")

    def test_staff_login_and_logout_do_not_affect_admin(self):
        admin_key = self._login_admin()
        self._login_staff()
        self.assertEqual(
            _cookie_value(self.client, settings.ADMIN_SESSION_COOKIE_NAME),
            admin_key,
        )
        self.assertEqual(self.client.get("/admin/").status_code, 200)

        logout = self.client.post("/api/auth/logout/", {}, content_type="application/json")
        self.assertEqual(logout.status_code, 204)
        self.assertEqual(
            _cookie_value(self.client, settings.ADMIN_SESSION_COOKIE_NAME),
            admin_key,
        )
        self.assertEqual(self.client.get("/admin/").status_code, 200)

    def test_app_and_admin_use_different_cookie_names(self):
        self._login_admin()
        self._login_owner()
        self.assertNotEqual(
            settings.SESSION_COOKIE_NAME,
            settings.ADMIN_SESSION_COOKIE_NAME,
        )
        self.assertNotEqual(
            _cookie_value(self.client, settings.SESSION_COOKIE_NAME),
            _cookie_value(self.client, settings.ADMIN_SESSION_COOKIE_NAME),
        )
        self.assertIsNone(_cookie_value(self.client, "sessionid"))
        self.assertIsNone(_cookie_value(self.client, "csrftoken"))


class PlatformAdminSessionIsolationAPIClientTests(TestCase):
    """Same isolation contract through DRF's APIClient cookie jar."""

    def test_admin_cookie_is_ignored_by_workspace_api(self):
        admin = User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        owner = User.objects.create_user(
            email="owner@example.com",
            password="secure-password",
        )
        owner.mark_email_verified()
        Organization.objects.create_with_owner(owner=owner)

        client = APIClient()
        login_platform_admin_through_2fa(
            client,
            admin.email,
            "secure-password",
        )
        self.assertEqual(client.get("/admin/").status_code, 200)
        workspace = client.get("/api/workspace/")
        self.assertIn(workspace.status_code, (401, 403))
