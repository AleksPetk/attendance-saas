import base64
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from rest_framework.test import APIClient

from accounts.testing import login_platform_admin_through_2fa
from attendance.kiosk_lock import SESSION_KIOSK_GROUP_ID, SESSION_KIOSK_LOCKED
from attendance.models import ActionRecord, ActionType
from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupStatus,
    KioskIdentifierField,
    KioskMode,
)
from kiosk_builder.kiosk_settings_constants import KioskInputSecondField, KioskType
from kiosk_builder.testing import configure_group_kiosk_for_launch
from members.models import Member
from organizations.models import Organization, WorkspaceStaffAccount, WorkspaceStaffRole

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True, **extra_fields):
    user = User.objects.create_user(email=email, password=password, **extra_fields)
    if verified:
        user.mark_email_verified()
    return user


def basic_auth_header(identity, password):
    token = base64.b64encode(f"{identity}:{password}".encode()).decode()
    return f"Basic {token}"


class GroupKioskLockTests(TestCase):
    def setUp(self):
        self.password = "secure-password"
        self.owner = create_user("kiosk-owner@example.com", password=self.password)
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.other_owner = create_user("other-kiosk-owner@example.com", password=self.password)
        self.other_org = Organization.objects.create_with_owner(owner=self.other_owner)
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.org,
            username="kioskstaff",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Lobby",
            check_in_enabled=True,
            check_out_enabled=True,
            breaks_enabled=True,
            max_breaks=1,
            require_pin=True,
            kiosk_mode=KioskMode.INPUT,
            kiosk_input_field_1=KioskIdentifierField.NAME,
            kiosk_input_field_2=KioskIdentifierField.PIN,
        )
        self.member = Member.objects.create_member(
            organization=self.org,
            name="Natsumi",
            pin="1234",
        )
        self.membership = GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=self.member,
            status=GroupMembershipStatus.ACTIVE,
        )
        self.membership.set_participation_pin("1234")
        self.membership.save()
        configure_group_kiosk_for_launch(
            self.group,
            mode=KioskType.INPUT,
            input_field_count=2,
            input_second_field=KioskInputSecondField.PIN,
        )
        self.session = APIClient()
        self.other_session = APIClient()

    def _login(self, client, email, password=None):
        response = client.post(
            "/api/auth/login/",
            {"email": email, "password": password or self.password},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        return response

    def _login_staff(self, client):
        response = client.post(
            "/api/auth/staff-login/",
            {
                "workspace_id": self.org.workspace_id,
                "username": "kioskstaff",
                "password": "staff-password",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        return response

    def _start_kiosk(self, client, group=None):
        group = group or self.group
        lock = client.post(f"/api/groups/{group.pk}/kiosk/")
        self.assertEqual(lock.status_code, 200)
        response = client.get(f"/api/groups/{group.pk}/kiosk/")
        self.assertEqual(response.status_code, 200)
        return response

    def test_kiosk_config_get_does_not_lock_until_enter(self):
        self._login(self.session, self.owner.email)
        config = self.session.get(f"/api/groups/{self.group.pk}/kiosk/")
        self.assertEqual(config.status_code, 200)
        self.assertFalse(config.data["kiosk_locked"])
        workspace = self.session.get("/api/workspace/")
        self.assertFalse(workspace.data["kiosk_locked"])
        dashboard = self.session.get("/api/dashboard/")
        self.assertEqual(dashboard.status_code, 200)

    def test_starting_kiosk_marks_app_session_locked(self):
        self._login(self.session, self.owner.email)
        start = self._start_kiosk(self.session)
        self.assertTrue(start.data["kiosk_locked"])
        self.assertEqual(start.data["kiosk_group_id"], self.group.pk)
        self.assertTrue(start.data["kiosk_available"])
        self.assertTrue(self.session.session[SESSION_KIOSK_LOCKED])
        self.assertEqual(self.session.session[SESSION_KIOSK_GROUP_ID], self.group.pk)

        workspace = self.session.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.assertTrue(workspace.data["kiosk_locked"])
        self.assertEqual(workspace.data["kiosk_group_id"], self.group.pk)

    def test_refresh_preserves_kiosk_lock(self):
        self._login(self.session, self.owner.email)
        self._start_kiosk(self.session)
        again = self.session.get(f"/api/groups/{self.group.pk}/kiosk/")
        self.assertEqual(again.status_code, 200)
        self.assertTrue(again.data["kiosk_locked"])
        self.assertEqual(again.data["kiosk_group_id"], self.group.pk)

    def test_workspace_apis_denied_while_locked(self):
        self._login(self.session, self.owner.email)
        self._start_kiosk(self.session)

        denied = [
            self.session.get("/api/dashboard/"),
            self.session.get("/api/members/"),
            self.session.get("/api/groups/"),
            self.session.get("/api/history/"),
            self.session.get("/api/auth/account/"),
            self.session.post("/api/auth/reauth/", {"password": self.password}, format="json"),
            self.session.post(
                "/api/auth/login/",
                {"email": self.owner.email, "password": self.password},
                format="json",
            ),
        ]
        for response in denied:
            self.assertEqual(response.status_code, 403, response.content)
            self.assertEqual(response.json()["code"], "kiosk_locked")
            self.assertEqual(response.json()["kiosk_group_id"], self.group.pk)

        identify = self.session.post(
            f"/api/groups/{self.group.pk}/kiosk/identify/",
            {
                "participant_code": self.membership.group_participant_code,
                "pin": "1234",
            },
            format="json",
        )
        self.assertEqual(identify.status_code, 200)
        self.assertEqual(identify.data["code"], "ok")

    def test_kiosk_media_urls_not_blocked_while_locked(self):
        """
        Live kiosk <img> requests send the locked session cookie to /media/.
        Middleware must not turn those into JSON 403 (broken Header/Footer logos).
        """
        from django.core.files.uploadedfile import SimpleUploadedFile
        from io import BytesIO
        from PIL import Image

        from kiosk_builder.models import ensure_group_kiosk_design

        buffer = BytesIO()
        Image.new("RGB", (32, 32), (200, 40, 40)).save(buffer, format="PNG")
        uploaded = SimpleUploadedFile(
            "lock-logo.png", buffer.getvalue(), content_type="image/png"
        )
        design = ensure_group_kiosk_design(self.group)
        design.header_logo.save("lock-logo.png", uploaded, save=True)
        media_path = design.header_logo.url
        self.assertTrue(media_path.startswith("/media/"))

        self._login(self.session, self.owner.email)
        start = self._start_kiosk(self.session)
        self.assertTrue(start.data["kiosk_locked"])
        logo_url = start.data["visual_design"]["header_logo_url"]
        self.assertTrue(logo_url)
        self.assertIn("/media/", logo_url)

        locked_media = self.session.get(media_path)
        # Regression: locked sessions used to get JSON 403 for /media/ (broken <img>).
        # Without DEBUG media routes the handler may 404 HTML — that still means
        # the lock middleware allowed the request through.
        if locked_media.status_code == 403:
            self.assertNotEqual(
                locked_media.json().get("code"),
                "kiosk_locked",
                locked_media.content[:300],
            )
        else:
            self.assertIn(locked_media.status_code, (200, 404), locked_media.content[:200])
            if locked_media.status_code == 200:
                self.assertTrue(
                    locked_media["Content-Type"].startswith("image/"),
                    locked_media["Content-Type"],
                )
        # Workspace APIs remain locked.
        denied = self.session.get("/api/dashboard/")
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(denied.json()["code"], "kiosk_locked")

    def test_closing_and_reopening_is_represented_by_persistent_session(self):
        self._login(self.session, self.owner.email)
        self._start_kiosk(self.session)
        cookie = self.session.cookies.get(settings.SESSION_COOKIE_NAME)
        self.assertIsNotNone(cookie)

        reopened = APIClient()
        reopened.cookies[settings.SESSION_COOKIE_NAME] = cookie.value
        workspace = reopened.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.assertTrue(workspace.data["kiosk_locked"])
        self.assertEqual(workspace.data["kiosk_group_id"], self.group.pk)
        dashboard = reopened.get("/api/dashboard/")
        self.assertEqual(dashboard.status_code, 403)
        self.assertEqual(dashboard.json()["code"], "kiosk_locked")

    def test_correct_exit_code_exits_kiosk_and_clears_lock(self):
        self._login(self.session, self.owner.email)
        self._start_kiosk(self.session)
        exit_resp = self.session.post(
            "/api/kiosk/exit/",
            {"exit_code": "1111"},
            format="json",
        )
        self.assertEqual(exit_resp.status_code, 200)
        self.assertTrue(exit_resp.data["ok"])
        self.assertFalse(exit_resp.data["kiosk_locked"])
        self.assertIsNone(exit_resp.data["kiosk_group_id"])

        workspace = self.session.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.assertFalse(workspace.data["kiosk_locked"])
        dashboard = self.session.get("/api/dashboard/")
        self.assertEqual(dashboard.status_code, 200)

    def test_wrong_exit_code_does_not_clear_lock(self):
        self._login(self.session, self.owner.email)
        self._start_kiosk(self.session)
        exit_resp = self.session.post(
            "/api/kiosk/exit/",
            {"exit_code": "wrong1"},
            format="json",
        )
        self.assertEqual(exit_resp.status_code, 403)
        self.assertTrue(self.session.session[SESSION_KIOSK_LOCKED])
        dashboard = self.session.get("/api/dashboard/")
        self.assertEqual(dashboard.status_code, 403)

    def test_workspace_staff_kiosk_lock_and_exit(self):
        self._login_staff(self.session)
        self._start_kiosk(self.session)
        members = self.session.get("/api/members/")
        self.assertEqual(members.status_code, 403)
        wrong = self.session.post(
            "/api/kiosk/exit/",
            {"exit_code": "wrong1"},
            format="json",
        )
        self.assertEqual(wrong.status_code, 403)
        ok = self.session.post(
            "/api/kiosk/exit/",
            {"exit_code": "1111"},
            format="json",
        )
        self.assertEqual(ok.status_code, 200)
        self.assertFalse(ok.data["kiosk_locked"])
        history = self.session.get("/api/history/")
        self.assertEqual(history.status_code, 200)

    def test_django_admin_session_unaffected(self):
        admin = User.objects.create_superuser(
            email="kiosk-platform-admin@example.com",
            password=self.password,
        )
        admin_client = Client()
        login_platform_admin_through_2fa(
            admin_client,
            "kiosk-platform-admin@example.com",
            self.password,
        )
        self._login(self.session, self.owner.email)
        self._start_kiosk(self.session)

        admin_home = admin_client.get("/admin/")
        self.assertEqual(admin_home.status_code, 200)
        self.assertNotIn(SESSION_KIOSK_LOCKED, admin_client.session)
        dashboard = self.session.get("/api/dashboard/")
        self.assertEqual(dashboard.status_code, 403)

    def test_second_independent_customer_session_unaffected(self):
        self._login(self.session, self.owner.email)
        self._start_kiosk(self.session)
        self._login(self.other_session, self.owner.email)
        workspace = self.other_session.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.assertFalse(workspace.data["kiosk_locked"])
        dashboard = self.other_session.get("/api/dashboard/")
        self.assertEqual(dashboard.status_code, 200)
        locked_dashboard = self.session.get("/api/dashboard/")
        self.assertEqual(locked_dashboard.status_code, 403)

    def test_other_owner_session_never_inherits_lock(self):
        self._login(self.session, self.owner.email)
        self._start_kiosk(self.session)
        self._login(self.other_session, self.other_owner.email)
        workspace = self.other_session.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.assertFalse(workspace.data["kiosk_locked"])
        other_members = self.other_session.get("/api/members/")
        self.assertEqual(other_members.status_code, 200)

    def test_basic_auth_kiosk_start_does_not_lock_session(self):
        basic = APIClient()
        basic.credentials(HTTP_AUTHORIZATION=basic_auth_header(self.owner.email, self.password))
        lock = basic.post(f"/api/groups/{self.group.pk}/kiosk/")
        self.assertEqual(lock.status_code, 200)
        self.assertFalse(lock.data.get("kiosk_locked"))
        start = basic.get(f"/api/groups/{self.group.pk}/kiosk/")
        self.assertEqual(start.status_code, 200)
        self.assertFalse(start.data.get("kiosk_locked"))
        members = basic.get("/api/members/")
        self.assertEqual(members.status_code, 200)

    def test_unavailable_kiosk_keeps_lock_and_allows_exit(self):
        self._login(self.session, self.owner.email)
        self._start_kiosk(self.session)
        self.group.archive()

        start = self.session.get(f"/api/groups/{self.group.pk}/kiosk/")
        self.assertEqual(start.status_code, 404)
        workspace = self.session.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.assertTrue(workspace.data["kiosk_locked"])
        self.assertFalse(workspace.data["kiosk_available"])
        dashboard = self.session.get("/api/dashboard/")
        self.assertEqual(dashboard.status_code, 403)
        exit_resp = self.session.post(
            "/api/kiosk/exit/",
            {"exit_code": "1111"},
            format="json",
        )
        self.assertEqual(exit_resp.status_code, 200)
        dashboard_after = self.session.get("/api/dashboard/")
        self.assertEqual(dashboard_after.status_code, 200)

    def test_archived_kiosk_group_does_not_infinite_loop(self):
        self._login(self.session, self.owner.email)
        self._start_kiosk(self.session)
        self.group.status = GroupStatus.ARCHIVED
        self.group.save(update_fields=["status"])
        start = self.session.get(f"/api/groups/{self.group.pk}/kiosk/")
        self.assertEqual(start.status_code, 404)
        workspace = self.session.get("/api/workspace/")
        self.assertTrue(workspace.data["kiosk_locked"])
        self.assertFalse(workspace.data["kiosk_available"])

    def test_cannot_switch_to_another_group_kiosk_while_locked(self):
        other_group = Group.objects.create_group(
            organization=self.org,
            name="Other lobby",
            check_in_enabled=True,
            check_out_enabled=False,
            breaks_enabled=False,
            kiosk_mode=KioskMode.INPUT,
            kiosk_input_field_1=KioskIdentifierField.NAME,
            kiosk_input_field_2="",
            require_pin=False,
        )
        configure_group_kiosk_for_launch(other_group)
        self._login(self.session, self.owner.email)
        self._start_kiosk(self.session)
        other = self.session.post(f"/api/groups/{other_group.pk}/kiosk/")
        self.assertEqual(other.status_code, 403)
        self.assertEqual(other.json()["kiosk_group_id"], self.group.pk)


class GroupKioskIdentifyBehaviorTests(TestCase):
    def setUp(self):
        self.owner = create_user("identify-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header(self.owner.email, "secure-password")
        )
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Desk",
            check_in_enabled=True,
            check_out_enabled=True,
            breaks_enabled=False,
            require_pin=True,
            kiosk_mode=KioskMode.INPUT,
            kiosk_input_field_1=KioskIdentifierField.NAME,
            kiosk_input_field_2=KioskIdentifierField.PIN,
        )
        self.member = Member.objects.create_member(
            organization=self.org,
            name="Natsumi",
            pin="1234",
        )
        self.membership = GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=self.member,
            status=GroupMembershipStatus.ACTIVE,
        )
        self.membership.set_participation_pin("1234")
        self.membership.save()
        configure_group_kiosk_for_launch(
            self.group,
            mode=KioskType.INPUT,
            input_field_count=2,
            input_second_field=KioskInputSecondField.PIN,
        )

    def test_no_match_wrong_pin_and_success(self):
        missing = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/identify/",
            {"participant_code": "G9-9999", "pin": "1234"},
            format="json",
        )
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.data["code"], "not_found")

        wrong = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/identify/",
            {
                "participant_code": self.membership.group_participant_code,
                "pin": "0000",
            },
            format="json",
        )
        self.assertEqual(wrong.status_code, 400)
        self.assertEqual(wrong.data["code"], "invalid_pin")

        other = Member.objects.create_member(
            organization=self.org,
            name="Natsumi",
            pin="1234",
        )
        other_membership = GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=other,
            status=GroupMembershipStatus.ACTIVE,
        )
        other_membership.set_participation_pin("1234")
        other_membership.save()
        duplicate_name_ok = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/identify/",
            {
                "participant_code": self.membership.group_participant_code,
                "pin": "1234",
            },
            format="json",
        )
        self.assertEqual(duplicate_name_ok.status_code, 200)
        self.assertEqual(duplicate_name_ok.data["code"], "ok")

        other_membership = GroupMembership.objects.get(member=other, group=self.group)
        other_membership.status = GroupMembershipStatus.INACTIVE
        other_membership.save(update_fields=["status"])

        ok = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/identify/",
            {
                "participant_code": self.membership.group_participant_code,
                "pin": "1234",
            },
            format="json",
        )
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data["code"], "ok")
        perform = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/perform/",
            {
                "participant_kind": "member",
                "membership_id": self.membership.id,
                "action": ActionType.CHECK_IN,
                "pin": "1234",
            },
            format="json",
        )
        self.assertEqual(perform.status_code, 200)
        self.assertTrue(
            ActionRecord.objects.filter(
                group=self.group,
                action_type=ActionType.CHECK_IN,
                participant_kind="member",
            ).exists()
        )


class KioskFrontendSemanticsTests(TestCase):
    def _frontend_source(self, *parts):
        candidates = [
            settings.REPO_ROOT.joinpath("frontend", "src", *parts),
            Path(__file__).resolve().parents[2].joinpath("frontend", "src", *parts),
        ]
        for path in candidates:
            if path.exists():
                return path.read_text()
        self.skipTest("Frontend sources are not mounted in this test environment.")
        return ""

    def test_kiosk_pin_is_not_an_account_password_field(self):
        source = self._frontend_source("GroupKioskScreen.jsx")
        source += self._frontend_source("kiosk", "kioskUi.jsx")
        self.assertIn("kiosk-pin-input", source)
        self.assertIn('autoComplete="one-time-code"', source)
        self.assertIn('autoComplete="off"', source)
        self.assertIn("data-lpignore", source)
        self.assertIn('name="kiosk-exit-code"', source)
        self.assertNotIn('autoComplete="current-password"', source)
        self.assertIn("PasswordInput", source)
        self.assertIn("kiosk-inline-error", source)
        self.assertIn("kiosk-action-choice", source)
        self.assertIn("kiosk-submit", source)
