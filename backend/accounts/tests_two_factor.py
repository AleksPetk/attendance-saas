from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.testing import (
    admin_session_store,
    extract_recovery_codes,
    extract_totp_setup_key,
    login_platform_admin_through_2fa,
    login_platform_admin_with_recovery_code,
    post_totp,
    totp_code,
)
from accounts.two_factor import (
    RECOVERY_AUTH_AT_KEY,
    RECOVERY_AUTH_USER_KEY,
    decrypt_totp_secret,
    hash_recovery_code,
    has_confirmed_platform_totp,
    provisioning_uri,
    unused_recovery_count,
    verify_totp_code,
)
from accounts.two_factor_models import PlatformRecoveryCode, PlatformTOTPDevice
from organizations.models import (
    Organization,
    OrganizationPlan,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
)

User = get_user_model()


class PlatformAdminTwoFactorTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.superuser = User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        self.staff_operator = User.objects.create_user(
            email="platform-staff@example.com",
            password="secure-password",
            is_staff=True,
        )
        self.owner = User.objects.create_user(
            email="owner@example.com",
            password="secure-password",
        )
        self.owner.mark_email_verified()
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        # Basic has zero Staff seats; Plus keeps staff-login regression coverage valid.
        self.organization.plan = OrganizationPlan.PLUS
        self.organization.save(update_fields=["plan", "updated_at"])
        self.workspace_staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )

    def _password_login(self, email, password="secure-password"):
        return self.client.post(
            "/admin/login/",
            {"username": email, "password": password, "next": "/admin/"},
        )

    def test_password_alone_does_not_grant_admin_to_superuser(self):
        response = self._password_login(self.superuser.email)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/admin/two-factor/setup/")
        blocked = self.client.get("/admin/")
        self.assertEqual(blocked.status_code, 302)
        self.assertIn("/admin/two-factor/", blocked.url)
        changelist = self.client.get("/admin/accounts/user/")
        self.assertEqual(changelist.status_code, 302)
        self.assertFalse(
            PlatformTOTPDevice.objects.filter(
                user=self.superuser, confirmed=True
            ).exists()
        )

    def test_password_alone_does_not_grant_admin_to_staff_operator(self):
        response = self._password_login(self.staff_operator.email)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/admin/two-factor/setup/")
        self.assertEqual(self.client.get("/admin/").status_code, 302)

    def test_customer_owner_is_not_forced_into_platform_2fa(self):
        response = self._password_login(self.owner.email)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Please enter the correct")
        self.assertFalse(PlatformTOTPDevice.objects.filter(user=self.owner).exists())
        api = APIClient()
        login = api.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "secure-password"},
            content_type="application/json",
        )
        self.assertEqual(login.status_code, 200)
        me = api.get("/api/auth/account/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["two_factor_status"], "not_enabled")

    def test_workspace_staff_login_does_not_use_platform_2fa(self):
        api = APIClient()
        login = api.post(
            "/api/auth/staff-login/",
            {
                "workspace_id": self.organization.workspace_id,
                "username": "natsumi",
                "password": "staff-password",
            },
            content_type="application/json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertFalse(
            PlatformTOTPDevice.objects.filter(user=self.superuser).exists()
        )
        self.assertEqual(self.client.get("/admin/").status_code, 302)

    def test_setup_rejects_wrong_code_and_activates_on_correct_code(self):
        self._password_login(self.superuser.email)
        setup = self.client.get("/admin/two-factor/setup/")
        self.assertEqual(setup.status_code, 200)
        self.assertContains(setup, "Secure your Check Station admin account")
        self.assertContains(setup, "Check Station:")
        self.assertContains(setup, "admin/img/logo.png")
        self.assertContains(setup, "admin/img/logo-text.png")
        self.assertContains(setup, "admin/img/favicon.ico")
        self.assertContains(setup, "admin/img/favicon-32.png")
        secret = extract_totp_setup_key(setup)
        self.assertIn("data:image/png;base64,", setup.content.decode())

        wrong = self.client.post("/admin/two-factor/setup/", {"code": "000000"})
        self.assertEqual(wrong.status_code, 200)
        self.assertContains(wrong, "That authentication code was not valid.")
        self.assertFalse(
            PlatformTOTPDevice.objects.filter(
                user=self.superuser, confirmed=True
            ).exists()
        )

        ok = self.client.post("/admin/two-factor/setup/", {"code": totp_code(secret)})
        self.assertEqual(ok.status_code, 302)
        self.assertEqual(ok.url, "/admin/two-factor/recovery-codes/")
        device = PlatformTOTPDevice.objects.get(user=self.superuser)
        self.assertTrue(device.confirmed)
        self.assertNotEqual(device.secret_encrypted, secret)

        codes_page = self.client.get("/admin/two-factor/recovery-codes/")
        codes = extract_recovery_codes(codes_page)
        self.assertEqual(len(codes), 10)
        for code in codes:
            self.assertFalse(
                PlatformRecoveryCode.objects.filter(code_hash=code).exists()
            )
            self.assertTrue(
                PlatformRecoveryCode.objects.filter(
                    user=self.superuser, code_hash=hash_recovery_code(code)
                ).exists()
            )
        self.assertNotIn(secret, codes_page.content.decode())

        skipped = self.client.post("/admin/two-factor/recovery-codes/", {})
        self.assertEqual(skipped.status_code, 200)
        self.assertEqual(self.client.get("/admin/").status_code, 302)

        done = self.client.post(
            "/admin/two-factor/recovery-codes/",
            {"acknowledged": "on"},
        )
        self.assertEqual(done.status_code, 302)
        self.assertEqual(self.client.get("/admin/").status_code, 200)

    def test_configured_operator_needs_totp_not_password_alone(self):
        secret, _codes = login_platform_admin_through_2fa(
            self.client, self.superuser.email, "secure-password"
        )
        self.client.post("/admin/logout/")
        login = self._password_login(self.superuser.email)
        self.assertEqual(login.url, "/admin/two-factor/challenge/")
        self.assertEqual(self.client.get("/admin/").status_code, 302)
        self.assertEqual(self.client.get("/admin/accounts/user/").status_code, 302)

        rejected = self.client.post(
            "/admin/two-factor/challenge/", {"code": "111111"}
        )
        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(self.client.get("/admin/").status_code, 302)

        accepted = post_totp(
            self.client, "/admin/two-factor/challenge/", secret, self.superuser
        )
        self.assertEqual(accepted.status_code, 302)
        self.assertEqual(self.client.get("/admin/").status_code, 200)

    def test_recovery_code_grants_access_once(self):
        _secret, codes = login_platform_admin_through_2fa(
            self.client, self.staff_operator.email, "secure-password"
        )
        self.client.post("/admin/logout/")
        self._password_login(self.staff_operator.email)
        first = self.client.post(
            "/admin/two-factor/recovery/",
            {"recovery_code": codes[0]},
        )
        self.assertEqual(first.status_code, 302)
        self.assertEqual(self.client.get("/admin/").status_code, 200)
        remaining = unused_recovery_count(self.staff_operator)
        self.assertEqual(remaining, 9)

        self.client.post("/admin/logout/")
        self._password_login(self.staff_operator.email)
        reused = self.client.post(
            "/admin/two-factor/recovery/",
            {"recovery_code": codes[0]},
        )
        self.assertEqual(reused.status_code, 200)
        self.assertContains(reused, "That recovery code was not valid.")
        self.assertEqual(self.client.get("/admin/").status_code, 302)

        invalid = self.client.post(
            "/admin/two-factor/recovery/",
            {"recovery_code": "ZZZZ-ZZZZ"},
        )
        self.assertEqual(invalid.status_code, 200)
        self.assertEqual(self.client.get("/admin/").status_code, 302)

    def test_regenerate_invalidates_old_codes(self):
        secret, codes = login_platform_admin_through_2fa(
            self.client, self.superuser.email, "secure-password"
        )
        regen = post_totp(
            self.client, "/admin/two-factor/regenerate/", secret, self.superuser
        )
        self.assertEqual(regen.status_code, 302)
        new_page = self.client.get("/admin/two-factor/recovery-codes/")
        new_codes = extract_recovery_codes(new_page)
        self.assertTrue(set(new_codes).isdisjoint(codes))
        self.client.post(
            "/admin/two-factor/recovery-codes/",
            {"acknowledged": "on"},
        )
        self.assertFalse(
            PlatformRecoveryCode.objects.filter(
                user=self.superuser, code_hash=hash_recovery_code(codes[0])
            ).exists()
        )

    def test_repeated_invalid_attempts_temporarily_lock(self):
        secret, _codes = login_platform_admin_through_2fa(
            self.client, self.superuser.email, "secure-password"
        )
        self.client.post("/admin/logout/")
        self._password_login(self.superuser.email)
        for _ in range(5):
            self.client.post("/admin/two-factor/challenge/", {"code": "000000"})
        locked = self.client.post(
            "/admin/two-factor/challenge/", {"code": totp_code(secret)}
        )
        self.assertEqual(locked.status_code, 200)
        self.assertContains(locked, "Too many attempts")
        self.assertEqual(self.client.get("/admin/").status_code, 302)

    def test_totp_replay_in_same_window_is_rejected(self):
        secret, _codes = login_platform_admin_through_2fa(
            self.client, self.superuser.email, "secure-password"
        )
        self.client.post("/admin/logout/")
        self._password_login(self.superuser.email)
        first = post_totp(
            self.client, "/admin/two-factor/challenge/", secret, self.superuser
        )
        self.assertEqual(first.status_code, 302)
        self.client.post("/admin/logout/")
        self._password_login(self.superuser.email)
        device = PlatformTOTPDevice.objects.get(user=self.superuser)
        replay_step = device.last_verified_timestep
        replay_code = totp_code(secret, replay_step)
        with patch(
            "accounts.two_factor.current_timestep",
            return_value=replay_step,
        ):
            replay = self.client.post(
                "/admin/two-factor/challenge/", {"code": replay_code}
            )
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(self.client.get("/admin/").status_code, 302)

    def test_emergency_reset_command(self):
        login_platform_admin_through_2fa(
            self.client, self.superuser.email, "secure-password"
        )
        self.assertTrue(has_confirmed_platform_totp(self.superuser))
        with self.assertRaises(CommandError):
            call_command("reset_platform_2fa", self.superuser.email)
        with self.assertRaises(CommandError):
            call_command("reset_platform_2fa", self.owner.email, yes=True)
        stdout = StringIO()
        call_command(
            "reset_platform_2fa",
            self.superuser.email,
            yes=True,
            stdout=stdout,
        )
        self.assertIn("Reset platform 2FA", stdout.getvalue())
        self.assertFalse(
            PlatformTOTPDevice.objects.filter(user=self.superuser).exists()
        )
        self.assertFalse(
            PlatformRecoveryCode.objects.filter(user=self.superuser).exists()
        )
        self.client = Client()
        again = self._password_login(self.superuser.email)
        self.assertEqual(again.url, "/admin/two-factor/setup/")

    def test_admin_2fa_does_not_replace_customer_session(self):
        api = APIClient()
        owner_login = api.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "secure-password"},
            content_type="application/json",
        )
        self.assertEqual(owner_login.status_code, 200)
        login_platform_admin_through_2fa(
            api, self.superuser.email, "secure-password"
        )
        workspace = api.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.assertEqual(workspace.json()["account_kind"], "owner")
        self.assertEqual(api.get("/admin/").status_code, 200)
        api.post("/api/auth/logout/", {}, content_type="application/json")
        self.assertEqual(api.get("/admin/").status_code, 200)

    def test_setup_page_does_not_include_plaintext_in_logs_path(self):
        self._password_login(self.superuser.email)
        setup = self.client.get("/admin/two-factor/setup/")
        secret = extract_totp_setup_key(setup)
        with self.assertLogs("accounts.two_factor", level="INFO") as logs:
            self.client.post("/admin/two-factor/setup/", {"code": totp_code(secret)})
        joined = "\n".join(logs.output)
        self.assertNotIn(secret, joined)
        self.assertNotIn(totp_code(secret), joined)

    def test_provisioning_uri_uses_check_station_issuer(self):
        uri = provisioning_uri("admin@example.com", "JBSWY3DPEHPK3PXP")
        self.assertTrue(uri.startswith("otpauth://totp/"))
        self.assertIn("Check%20Station", uri)
        self.assertIn("admin%40example.com", uri)


class PlatformAdminLostAuthenticatorRecoveryTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.superuser = User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        self.owner = User.objects.create_user(
            email="owner@example.com",
            password="secure-password",
        )
        self.owner.mark_email_verified()
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        # Basic has zero Staff seats; Plus keeps staff-login regression coverage valid.
        self.organization.plan = OrganizationPlan.PLUS
        self.organization.save(update_fields=["plan", "updated_at"])
        self.workspace_staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )

    def _password_login(self, email, password="secure-password"):
        return self.client.post(
            "/admin/login/",
            {"username": email, "password": password, "next": "/admin/"},
        )

    def _setup_operator(self):
        secret, codes = login_platform_admin_through_2fa(
            self.client, self.superuser.email, "secure-password"
        )
        self.client.post("/admin/logout/")
        return secret, codes

    def test_recovery_code_login_creates_recent_recovery_auth_state(self):
        _secret, codes = self._setup_operator()
        login_platform_admin_with_recovery_code(
            self.client, self.superuser.email, "secure-password", codes[0]
        )
        session = admin_session_store(self.client)
        self.assertEqual(
            str(session.get(RECOVERY_AUTH_USER_KEY)), str(self.superuser.pk)
        )
        self.assertTrue(session.get(RECOVERY_AUTH_AT_KEY))
        session_blob = " ".join(str(value) for value in session.values())
        self.assertNotIn(codes[0], session_blob)
        self.assertNotIn(codes[0].replace("-", ""), session_blob)
        page = self.client.get("/admin/two-factor/replace/")
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, "You signed in with a recovery code")
        self.assertNotContains(page, "Current 6-digit authenticator code")
        home = self.client.get("/admin/")
        self.assertContains(home, "Manage security")
        self.assertContains(home, "cs-security-card")
        self.assertContains(home, "Platform security")
        html = home.content.decode()
        start = html.find("cs-security-card")
        end = html.find("</section>", start)
        self.assertGreater(start, -1)
        card = html[start:end]
        self.assertNotIn("<table", card)
        self.assertIn("TOTP: Enabled", card)
        self.assertIn("Recovery codes:", card)
        self.assertIn("Recovery authorization active", card)

    def test_recovery_auth_state_expires(self):
        _secret, codes = self._setup_operator()
        login_platform_admin_with_recovery_code(
            self.client, self.superuser.email, "secure-password", codes[0]
        )
        session = admin_session_store(self.client)
        session[RECOVERY_AUTH_AT_KEY] = (
            timezone.now() - timedelta(minutes=11)
        ).isoformat()
        session.save()
        page = self.client.get("/admin/two-factor/replace/")
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, "An ordinary admin session is not enough")
        refused = self.client.post("/admin/two-factor/replace/", {})
        self.assertEqual(refused.status_code, 200)
        self.assertTrue(
            PlatformTOTPDevice.objects.filter(
                user=self.superuser, confirmed=True
            ).exists()
        )

    def test_recovery_auth_allows_replacing_authenticator_without_old_totp(self):
        old_secret, codes = self._setup_operator()
        login_platform_admin_with_recovery_code(
            self.client, self.superuser.email, "secure-password", codes[0]
        )
        started = self.client.post("/admin/two-factor/replace/", {})
        self.assertEqual(started.status_code, 302)
        enroll = self.client.get("/admin/two-factor/replace/")
        self.assertContains(enroll, "New 6-digit authenticator code")
        new_secret = extract_totp_setup_key(enroll)
        self.assertNotEqual(new_secret, old_secret)
        device = PlatformTOTPDevice.objects.get(user=self.superuser)
        self.assertFalse(device.confirmed)
        old_ok, _ = verify_totp_code(decrypt_totp_secret(device.secret_encrypted), totp_code(old_secret))
        self.assertFalse(old_ok)

        verified = self.client.post(
            "/admin/two-factor/replace/", {"code": totp_code(new_secret)}
        )
        self.assertEqual(verified.status_code, 302)
        codes_page = self.client.get("/admin/two-factor/recovery-codes/")
        new_codes = extract_recovery_codes(codes_page)
        self.assertTrue(set(new_codes).isdisjoint(codes))
        self.client.post(
            "/admin/two-factor/recovery-codes/",
            {"acknowledged": "on"},
        )
        device.refresh_from_db()
        self.assertTrue(device.confirmed)

        self.client.post("/admin/logout/")
        self._password_login(self.superuser.email)
        old_challenge = self.client.post(
            "/admin/two-factor/challenge/", {"code": totp_code(old_secret)}
        )
        self.assertEqual(old_challenge.status_code, 200)
        accepted = post_totp(
            self.client, "/admin/two-factor/challenge/", new_secret, self.superuser
        )
        self.assertEqual(accepted.status_code, 302)

        self.client.post("/admin/logout/")
        self._password_login(self.superuser.email)
        old_recovery = self.client.post(
            "/admin/two-factor/recovery/",
            {"recovery_code": codes[1]},
        )
        self.assertEqual(old_recovery.status_code, 200)
        new_recovery = self.client.post(
            "/admin/two-factor/recovery/",
            {"recovery_code": new_codes[0]},
        )
        self.assertEqual(new_recovery.status_code, 302)
        self.client.post("/admin/logout/")
        self._password_login(self.superuser.email)
        reused = self.client.post(
            "/admin/two-factor/recovery/",
            {"recovery_code": new_codes[0]},
        )
        self.assertEqual(reused.status_code, 200)

    def test_ordinary_admin_session_cannot_replace_without_totp(self):
        old_secret, codes = self._setup_operator()
        login_platform_admin_through_2fa(
            self.client, self.superuser.email, "secure-password"
        )
        page = self.client.get("/admin/two-factor/replace/")
        self.assertContains(page, "An ordinary admin session is not enough")
        device = PlatformTOTPDevice.objects.get(user=self.superuser)
        secret_before = device.secret_encrypted
        refused = self.client.post("/admin/two-factor/replace/", {})
        self.assertEqual(refused.status_code, 200)
        self.assertContains(refused, "current authenticator code")
        device.refresh_from_db()
        self.assertTrue(device.confirmed)
        self.assertEqual(device.secret_encrypted, secret_before)
        self.assertTrue(
            PlatformRecoveryCode.objects.filter(
                user=self.superuser, code_hash=hash_recovery_code(codes[0])
            ).exists()
        )
        session = admin_session_store(self.client)
        self.assertFalse(session.get(RECOVERY_AUTH_USER_KEY))

    def test_ordinary_session_can_replace_with_current_totp(self):
        old_secret, codes = self._setup_operator()
        login_platform_admin_through_2fa(
            self.client, self.superuser.email, "secure-password"
        )
        started = post_totp(
            self.client, "/admin/two-factor/replace/", old_secret, self.superuser
        )
        self.assertEqual(started.status_code, 302)
        enroll = self.client.get("/admin/two-factor/replace/")
        new_secret = extract_totp_setup_key(enroll)
        self.assertNotEqual(new_secret, old_secret)

    def test_customer_and_workspace_accounts_unaffected(self):
        _secret, codes = self._setup_operator()
        login_platform_admin_with_recovery_code(
            self.client, self.superuser.email, "secure-password", codes[0]
        )
        owner_login = self.client.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "secure-password"},
            content_type="application/json",
        )
        self.assertEqual(owner_login.status_code, 200)
        staff_login = self.client.post(
            "/api/auth/staff-login/",
            {
                "workspace_id": self.organization.workspace_id,
                "username": "natsumi",
                "password": "staff-password",
            },
            content_type="application/json",
        )
        self.assertEqual(staff_login.status_code, 200)
        self.assertEqual(self.client.get("/admin/").status_code, 200)
        workspace = self.client.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.assertEqual(workspace.json()["account_kind"], "workspace_staff")
        self.assertFalse(PlatformTOTPDevice.objects.filter(user=self.owner).exists())
