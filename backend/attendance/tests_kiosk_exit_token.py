"""Scoped kiosk-exit token security tests (cache-backed, no migration)."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from attendance.kiosk_exit_token import (
    issue_kiosk_exit_token,
    lookup_kiosk_exit_token,
    revoke_kiosk_exit_token,
)
from groups.models import Group, GroupType
from kiosk_builder.testing import configure_group_kiosk_for_launch
from organizations.models import Organization, OrganizationPlan

User = get_user_model()


def _create_user(email):
    user = User.objects.create_user(email=email, password="secure-password")
    user.mark_email_verified()
    return user


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "kiosk-exit-token-tests",
        }
    }
)
class KioskExitTokenSecurityTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = _create_user("kiosk-exit-token-owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.organization.plan = OrganizationPlan.BUSINESS
        self.organization.save(update_fields=["plan", "updated_at"])
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Exit Token Desk",
            group_type=GroupType.STANDARD,
            check_in_enabled=True,
            check_out_enabled=True,
        )
        configure_group_kiosk_for_launch(self.group, exit_code="1111")
        self.other_owner = _create_user("kiosk-exit-token-other@example.com")
        self.other_org = Organization.objects.create_with_owner(owner=self.other_owner)
        self.other_org.plan = OrganizationPlan.BUSINESS
        self.other_org.save(update_fields=["plan", "updated_at"])
        self.other_group = Group.objects.create_group(
            organization=self.other_org,
            name="Other Desk",
            group_type=GroupType.STANDARD,
            check_in_enabled=True,
            check_out_enabled=True,
        )
        configure_group_kiosk_for_launch(self.other_group, exit_code="2222")
        self.client = APIClient()

    def _login(self, client=None, user=None, password="secure-password"):
        client = client or self.client
        user = user or self.owner
        response = client.post(
            "/api/auth/login/",
            {"email": user.email, "password": password},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        return response

    def _start_kiosk(self, client=None, group=None):
        client = client or self.client
        group = group or self.group
        response = client.post(f"/api/groups/{group.pk}/kiosk/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        return response

    def test_no_auth_and_no_token_exit_rejected(self):
        response = self.client.post(
            "/api/kiosk/exit/",
            {"exit_code": "1111", "group_id": self.group.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data.get("code"), "not_authenticated")

    def test_authenticated_session_correct_pin_exits(self):
        self._login()
        start = self._start_kiosk()
        self.assertTrue(start.data.get("kiosk_exit_token"))
        exit_resp = self.client.post(
            "/api/kiosk/exit/",
            {"exit_code": "1111"},
            format="json",
        )
        self.assertEqual(exit_resp.status_code, 200)
        self.assertTrue(exit_resp.data.get("ok"))
        self.assertFalse(exit_resp.data.get("kiosk_locked"))

    def test_token_path_correct_pin_exits_without_session(self):
        self._login()
        start = self._start_kiosk()
        token = start.data["kiosk_exit_token"]
        self.client.logout()
        exit_resp = APIClient().post(
            "/api/kiosk/exit/",
            {
                "exit_code": "1111",
                "group_id": self.group.pk,
                "kiosk_exit_token": token,
            },
            format="json",
        )
        self.assertEqual(exit_resp.status_code, 200)
        self.assertTrue(exit_resp.data.get("ok"))
        self.assertEqual(exit_resp.data.get("session_recovery"), "sign_in")
        self.assertIsNone(lookup_kiosk_exit_token(token))

    def test_token_path_wrong_pin_rejected(self):
        self._login()
        start = self._start_kiosk()
        token = start.data["kiosk_exit_token"]
        self.client.logout()
        exit_resp = APIClient().post(
            "/api/kiosk/exit/",
            {
                "exit_code": "9999",
                "group_id": self.group.pk,
                "kiosk_exit_token": token,
            },
            format="json",
        )
        self.assertEqual(exit_resp.status_code, 403)
        self.assertIsNotNone(lookup_kiosk_exit_token(token))

    def test_token_for_group_a_cannot_exit_group_b(self):
        self._login()
        group_b = Group.objects.create_group(
            organization=self.organization,
            name="Second Desk",
            group_type=GroupType.STANDARD,
            check_in_enabled=True,
            check_out_enabled=True,
        )
        configure_group_kiosk_for_launch(group_b, exit_code="3333")
        start_a = self._start_kiosk(group=self.group)
        token_a = start_a.data["kiosk_exit_token"]
        self.client.logout()
        exit_resp = APIClient().post(
            "/api/kiosk/exit/",
            {
                "exit_code": "3333",
                "group_id": group_b.pk,
                "kiosk_exit_token": token_a,
            },
            format="json",
        )
        self.assertEqual(exit_resp.status_code, 403)

    def test_token_for_org_a_cannot_exit_org_b(self):
        self._login()
        start = self._start_kiosk()
        token = start.data["kiosk_exit_token"]
        self.client.logout()
        exit_resp = APIClient().post(
            "/api/kiosk/exit/",
            {
                "exit_code": "2222",
                "group_id": self.other_group.pk,
                "kiosk_exit_token": token,
            },
            format="json",
        )
        self.assertEqual(exit_resp.status_code, 403)

    def test_revoked_token_rejected(self):
        self._login()
        start = self._start_kiosk()
        token = start.data["kiosk_exit_token"]
        revoke_kiosk_exit_token(token)
        self.client.logout()
        exit_resp = APIClient().post(
            "/api/kiosk/exit/",
            {
                "exit_code": "1111",
                "group_id": self.group.pk,
                "kiosk_exit_token": token,
            },
            format="json",
        )
        self.assertEqual(exit_resp.status_code, 401)

    def test_replaced_token_invalidates_previous(self):
        self._login()
        first = self._start_kiosk().data["kiosk_exit_token"]
        second = self._start_kiosk().data["kiosk_exit_token"]
        self.assertNotEqual(first, second)
        self.assertIsNone(lookup_kiosk_exit_token(first))
        self.assertIsNotNone(lookup_kiosk_exit_token(second))

    def test_malformed_and_random_token_rejected(self):
        for bad in ("", "not-a-real-token", "a" * 300):
            response = APIClient().post(
                "/api/kiosk/exit/",
                {
                    "exit_code": "1111",
                    "group_id": self.group.pk,
                    "kiosk_exit_token": bad,
                },
                format="json",
            )
            self.assertIn(response.status_code, (401, 400))

    def test_token_does_not_bypass_pin(self):
        self._login()
        token = self._start_kiosk().data["kiosk_exit_token"]
        self.client.logout()
        response = APIClient().post(
            "/api/kiosk/exit/",
            {
                "group_id": self.group.pk,
                "kiosk_exit_token": token,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_token_cannot_access_members_api(self):
        self._login()
        token = self._start_kiosk().data["kiosk_exit_token"]
        self.client.logout()
        anon = APIClient()
        denied = anon.get("/api/members/")
        self.assertIn(denied.status_code, (401, 403))
        # Presenting the token as a header/body must not unlock members.
        denied_with_token = anon.get(
            "/api/members/",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        self.assertIn(denied_with_token.status_code, (401, 403))
        denied_groups = anon.get("/api/groups/")
        self.assertIn(denied_groups.status_code, (401, 403))
        denied_workspace = anon.get("/api/workspace/")
        self.assertIn(denied_workspace.status_code, (401, 403))

    def test_token_cannot_perform_attendance(self):
        self._login()
        token = self._start_kiosk().data["kiosk_exit_token"]
        self.client.logout()
        response = APIClient().post(
            f"/api/groups/{self.group.pk}/kiosk/perform/",
            {
                "action": "check_in",
                "kiosk_exit_token": token,
            },
            format="json",
        )
        self.assertIn(response.status_code, (401, 403))

    def test_issue_helper_round_trip(self):
        raw = issue_kiosk_exit_token(
            organization_id=self.organization.pk,
            group_id=self.group.pk,
        )
        record = lookup_kiosk_exit_token(raw)
        self.assertIsNotNone(record)
        self.assertEqual(record.group_id, self.group.pk)
        self.assertEqual(record.organization_id, self.organization.pk)
