from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import close_old_connections
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APIClient

from accounts.services import FORGOT_PASSWORD_MESSAGE, RESEND_PUBLIC_MESSAGE
from accounts.testing import force_platform_admin_login
from accounts.tokens import email_verification_token_generator
from billing.builtin_trial import builtin_trial_is_active
from billing.models import WorkspaceBuiltinTrial
from core.mail import EmailSendError
from organizations.models import Organization, OrganizationPlan

User = get_user_model()


def uid_for(user):
    return urlsafe_base64_encode(force_bytes(user.pk))


class OwnerAuthEmailTests(TestCase):
    def setUp(self):
        self.api = APIClient()

    def _register(self, email="newowner@example.com", password="secure-password"):
        with patch("organizations.views.send_verification_email_for_user"):
            return self.api.post(
                "/api/auth/register/",
                {
                    "email": email,
                    "password": password,
                    "password_confirm": password,
                    "legal_acknowledgement": True,
                },
                format="json",
            )

    def test_registration_creates_only_unverified_user(self):
        response = self._register()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data["workspace_created"])
        user = User.objects.get(email="newowner@example.com")
        self.assertFalse(user.email_verified)
        self.assertEqual(Organization.objects.filter(owner=user).count(), 0)
        self.assertEqual(WorkspaceBuiltinTrial.objects.count(), 0)

    def test_registration_calls_verification_email_service(self):
        with patch("organizations.views.send_verification_email_for_user") as send_mail:
            response = self.api.post(
                "/api/auth/register/",
                {
                    "email": "owner@example.com",
                    "password": "secure-password",
                    "password_confirm": "secure-password",
                    "legal_acknowledgement": True,
                },
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["verification_email_sent"])
        send_mail.assert_called_once()

    def test_registration_keeps_account_if_email_send_fails(self):
        with patch(
            "organizations.views.send_verification_email_for_user",
            side_effect=EmailSendError("provider down"),
        ):
            with self.assertLogs("organizations", level="ERROR"):
                response = self.api.post(
                    "/api/auth/register/",
                    {
                        "email": "owner@example.com",
                        "password": "secure-password",
                        "password_confirm": "secure-password",
                        "legal_acknowledgement": True,
                    },
                    format="json",
                )
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data["verification_email_sent"])
        user = User.objects.get(email="owner@example.com")
        self.assertFalse(user.email_verified)
        self.assertFalse(Organization.objects.filter(owner=user).exists())
        self.assertFalse(WorkspaceBuiltinTrial.objects.exists())

    def test_registration_ignores_privilege_flags(self):
        with patch("organizations.views.send_verification_email_for_user"):
            response = self.api.post(
                "/api/auth/register/",
                {
                    "email": "owner@example.com",
                    "password": "secure-password",
                    "password_confirm": "secure-password",
                    "legal_acknowledgement": True,
                    "is_staff": True,
                    "is_superuser": True,
                    "email_verified": True,
                },
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email="owner@example.com")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertFalse(user.email_verified)

    def test_registration_requires_legal_acknowledgement(self):
        payload = {
            "email": "owner@example.com",
            "password": "secure-password",
            "password_confirm": "secure-password",
        }

        missing = self.api.post("/api/auth/register/", payload, format="json")
        declined = self.api.post(
            "/api/auth/register/",
            {**payload, "legal_acknowledgement": False},
            format="json",
        )

        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("legal_acknowledgement", missing.data)
        self.assertEqual(declined.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("legal_acknowledgement", declined.data)
        self.assertFalse(User.objects.filter(email="owner@example.com").exists())

    def test_valid_verification_token_marks_email_verified(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        self.assertFalse(Organization.objects.filter(owner=user).exists())
        self.assertFalse(WorkspaceBuiltinTrial.objects.exists())
        token = email_verification_token_generator.make_token(user)
        response = self.api.post(
            "/api/auth/verify-email/",
            {"uid": uid_for(user), "token": token},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["code"], "verified")
        user.refresh_from_db()
        self.assertTrue(user.email_verified)
        self.assertIsNotNone(user.email_verified_at)
        organization = Organization.objects.get(owner=user)
        organization.refresh_from_db()
        self.assertEqual(organization.plan, OrganizationPlan.BUSINESS)
        self.assertTrue(builtin_trial_is_active(organization))
        self.assertEqual(
            WorkspaceBuiltinTrial.objects.filter(organization=organization).count(),
            1,
        )
        workspace = self.api.get("/api/workspace/")
        self.assertEqual(workspace.status_code, status.HTTP_200_OK)
        self.assertEqual(workspace.data["workspace_id"], organization.workspace_id)

    def test_repeated_verification_is_idempotent(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        token = email_verification_token_generator.make_token(user)
        payload = {"uid": uid_for(user), "token": token}
        first = self.api.post("/api/auth/verify-email/", payload, format="json")
        organization = Organization.objects.get(owner=user)
        trial = WorkspaceBuiltinTrial.objects.get(organization=organization)
        started_at = trial.started_at
        second = self.api.post("/api/auth/verify-email/", payload, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data["code"], "verified")
        self.assertEqual(Organization.objects.filter(owner=user).count(), 1)
        self.assertEqual(
            WorkspaceBuiltinTrial.objects.filter(organization=organization).count(),
            1,
        )
        trial.refresh_from_db()
        self.assertEqual(trial.started_at, started_at)

    def test_verification_preserves_legacy_pending_workspace(self):
        user = User.objects.create_user(
            email="legacy-pending@example.com",
            password="secure-password",
            email_verified=False,
        )
        organization = Organization.objects.create_with_owner(owner=user)
        trial = WorkspaceBuiltinTrial.objects.get(organization=organization)
        started_at = trial.started_at
        token = email_verification_token_generator.make_token(user)

        response = self.api.post(
            "/api/auth/verify-email/",
            {"uid": uid_for(user), "token": token},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Organization.objects.filter(owner=user).count(), 1)
        self.assertEqual(
            WorkspaceBuiltinTrial.objects.filter(organization=organization).count(),
            1,
        )
        trial.refresh_from_db()
        self.assertEqual(trial.started_at, started_at)

    def test_expired_verification_token(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        token = email_verification_token_generator.make_token(user)
        future = email_verification_token_generator._now() + timedelta(hours=25)
        with patch.object(email_verification_token_generator, "_now", return_value=future):
            response = self.api.post(
                "/api/auth/verify-email/",
                {"uid": uid_for(user), "token": token},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "token_expired")
        user.refresh_from_db()
        self.assertFalse(user.email_verified)

    def test_malformed_verification_token(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        response = self.api.post(
            "/api/auth/verify-email/",
            {"uid": uid_for(user), "token": "not-a-valid-token"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "token_invalid")
        self.assertNotIn("email", response.data)

    def test_unverified_customer_cannot_access_workspace(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        self.api.force_authenticate(user=user)
        response = self.api.get("/api/workspace/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "email_not_verified")
        members = self.api.get("/api/members/")
        self.assertEqual(members.status_code, 403)

    def test_unverified_login_is_not_wrong_password(self):
        self._register()
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"email": "newowner@example.com", "password": "secure-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "email_not_verified")
        self.assertEqual(
            response.data["detail"],
            "Please verify your email before continuing.",
        )

    def test_wrong_password_stays_generic(self):
        self._register()
        response = APIClient().post(
            "/api/auth/login/",
            {"email": "newowner@example.com", "password": "wrong-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], "Invalid email or password.")

    def test_inactive_user_login_is_generic(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        user.mark_email_verified()
        user.is_active = False
        user.save(update_fields=["is_active"])
        response = APIClient().post(
            "/api/auth/login/",
            {"email": "newowner@example.com", "password": "secure-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], "Invalid email or password.")

    def test_verified_user_can_login_and_access_workspace(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        token = email_verification_token_generator.make_token(user)
        verified = self.api.post(
            "/api/auth/verify-email/",
            {"uid": uid_for(user), "token": token},
            format="json",
        )
        self.assertEqual(verified.status_code, 200)
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"email": "newowner@example.com", "password": "secure-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["account_kind"], "owner")
        workspace = client.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)

    def test_verified_email_cannot_register_again(self):
        self._register()
        user = User.objects.get(email="newowner@example.com")
        token = email_verification_token_generator.make_token(user)
        self.api.post(
            "/api/auth/verify-email/",
            {"uid": uid_for(user), "token": token},
            format="json",
        )

        response = self._register(password="another-secure-password")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
        self.assertEqual(User.objects.filter(email=user.email).count(), 1)
        self.assertEqual(Organization.objects.filter(owner=user).count(), 1)

    def test_password_registration_rejects_email_owned_as_verified_backup(self):
        owner = User.objects.create_user(
            email="holder@example.com",
            password="secure-password",
        )
        owner.mark_email_verified()
        Organization.objects.create_with_owner(owner=owner)
        owner.backup_email = "victim@example.com"
        owner.backup_email_verified_at = timezone.now()
        owner.save(update_fields=["backup_email", "backup_email_verified_at"])

        before_count = User.objects.count()
        response = self._register(email="victim@example.com", password="attacker-password")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
        self.assertEqual(User.objects.count(), before_count)
        self.assertFalse(User.objects.filter(email="victim@example.com").exists())
        self.assertEqual(Organization.objects.filter(owner=owner).count(), 1)

    def test_password_registration_allows_email_with_only_unverified_pending_primary(self):
        owner = User.objects.create_user(
            email="holder@example.com",
            password="secure-password",
        )
        owner.mark_email_verified()
        Organization.objects.create_with_owner(owner=owner)
        owner.pending_primary_email = "victim-pending@example.com"
        owner.save(update_fields=["pending_primary_email"])

        response = self._register(
            email="victim-pending@example.com",
            password="attacker-password",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(email="victim-pending@example.com").exists())
        self.assertEqual(
            User.objects.filter(email="victim-pending@example.com").count(),
            1,
        )
        owner.refresh_from_db()
        self.assertEqual(owner.pending_primary_email, "victim-pending@example.com")

    def test_password_registration_allows_email_with_only_unverified_pending_backup(self):
        owner = User.objects.create_user(
            email="holder@example.com",
            password="secure-password",
        )
        owner.mark_email_verified()
        Organization.objects.create_with_owner(owner=owner)
        owner.pending_backup_email = "victim-backup-pending@example.com"
        owner.save(update_fields=["pending_backup_email"])

        response = self._register(
            email="victim-backup-pending@example.com",
            password="real-owner-password",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = User.objects.get(email="victim-backup-pending@example.com")
        self.assertFalse(created.email_verified)
        self.assertFalse(Organization.objects.filter(owner=created).exists())

    def test_provisional_restart_blocked_when_email_owned_elsewhere_as_backup(self):
        holder = User.objects.create_user(
            email="holder@example.com",
            password="secure-password",
        )
        holder.mark_email_verified()
        Organization.objects.create_with_owner(owner=holder)
        holder.backup_email = "shared@example.com"
        holder.backup_email_verified_at = timezone.now()
        holder.save(update_fields=["backup_email", "backup_email_verified_at"])

        # Legacy buggy state: provisional primary exists alongside a verified backup.
        provisional = User.objects.create_user(
            email="shared@example.com",
            password="first-secure-password",
            email_verified=False,
        )

        response = self._register(
            email="shared@example.com",
            password="replacement-secure-password",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
        provisional.refresh_from_db()
        self.assertTrue(provisional.check_password("first-secure-password"))
        self.assertFalse(provisional.email_verified)
        self.assertEqual(User.objects.filter(email="shared@example.com").count(), 1)
        self.assertEqual(Organization.objects.filter(owner=holder).count(), 1)
        self.assertFalse(Organization.objects.filter(owner=provisional).exists())

    def test_unverified_email_can_restart_registration_without_duplicates(self):
        self._register(password="first-secure-password")
        original = User.objects.get(email="newowner@example.com")

        response = self._register(password="replacement-secure-password")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        restarted = User.objects.get(email="newowner@example.com")
        self.assertEqual(restarted.pk, original.pk)
        self.assertTrue(restarted.check_password("replacement-secure-password"))
        self.assertFalse(restarted.check_password("first-secure-password"))
        self.assertEqual(User.objects.filter(email=restarted.email).count(), 1)
        self.assertFalse(Organization.objects.filter(owner=restarted).exists())
        self.assertFalse(WorkspaceBuiltinTrial.objects.exists())

    def test_registration_restart_respects_verification_cooldown(self):
        self._register(password="first-secure-password")
        user = User.objects.get(email="newowner@example.com")
        user.email_verification_last_sent_at = timezone.now()
        user.save(update_fields=["email_verification_last_sent_at"])

        response = self._register(password="replacement-secure-password")

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        user.refresh_from_db()
        self.assertTrue(user.check_password("first-secure-password"))
        self.assertFalse(Organization.objects.filter(owner=user).exists())

    def test_mistyped_pending_email_can_be_reclaimed_and_provisioned(self):
        self._register(email="mistyped@example.com")
        pending = User.objects.get(email="mistyped@example.com")
        self.assertFalse(Organization.objects.filter(owner=pending).exists())

        restarted = self._register(
            email="mistyped@example.com",
            password="owner-chosen-password",
        )
        self.assertEqual(restarted.status_code, status.HTTP_201_CREATED)
        pending.refresh_from_db()
        token = email_verification_token_generator.make_token(pending)
        verified = self.api.post(
            "/api/auth/verify-email/",
            {"uid": uid_for(pending), "token": token},
            format="json",
        )

        self.assertEqual(verified.status_code, status.HTTP_200_OK)
        self.assertEqual(User.objects.filter(email=pending.email).count(), 1)
        self.assertEqual(Organization.objects.filter(owner=pending).count(), 1)
        self.assertEqual(WorkspaceBuiltinTrial.objects.count(), 1)

    def test_authenticated_resend_verification(self):
        self._register()
        with patch("accounts.services.send_verification_email") as send_mail:
            response = self.api.post("/api/auth/resend-verification/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["code"], "sent")
        send_mail.assert_called_once()

    def test_authenticated_resend_cooldown(self):
        self._register()
        with patch("accounts.services.send_verification_email"):
            first = self.api.post("/api/auth/resend-verification/", {}, format="json")
            second = self.api.post("/api/auth/resend-verification/", {}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.data["code"], "email_cooldown")

    def test_public_resend_does_not_enumerate(self):
        self._register()
        with patch("accounts.services.send_verification_email"):
            existing = APIClient().post(
                "/api/auth/resend-verification/",
                {"email": "newowner@example.com"},
                format="json",
            )
            missing = APIClient().post(
                "/api/auth/resend-verification/",
                {"email": "nobody@example.com"},
                format="json",
            )
        self.assertEqual(existing.status_code, missing.status_code)
        self.assertEqual(existing.data["detail"], missing.data["detail"])
        self.assertEqual(existing.data["detail"], RESEND_PUBLIC_MESSAGE)

    def test_platform_admin_login_and_admin_site_still_work(self):
        admin = User.objects.create_superuser(
            email="platform@example.com",
            password="secure-password",
        )
        self.assertTrue(admin.email_verified)
        client = APIClient()
        login = client.post(
            "/api/auth/login/",
            {"email": "platform@example.com", "password": "secure-password"},
            format="json",
        )
        self.assertEqual(login.status_code, 404)
        force_platform_admin_login(self.client, admin)
        response = self.client.get("/admin/")
        self.assertEqual(response.status_code, 200)

    def test_unverified_platform_operator_is_exempt_from_customer_gate(self):
        admin = User.objects.create_user(
            email="ops@example.com",
            password="secure-password",
            is_staff=True,
            is_superuser=True,
            email_verified=False,
        )
        force_platform_admin_login(self.client, admin)
        response = self.client.get("/admin/")
        self.assertEqual(response.status_code, 200)


class OwnerVerificationRaceTests(TransactionTestCase):
    reset_sequences = True

    def test_concurrent_verification_creates_one_workspace_and_trial(self):
        user = User.objects.create_user(
            email="race@example.com",
            password="secure-password",
            email_verified=False,
        )
        token = email_verification_token_generator.make_token(user)
        payload = {"uid": uid_for(user), "token": token}
        barrier = Barrier(2)

        def verify_once():
            close_old_connections()
            try:
                barrier.wait(timeout=5)
                response = APIClient().post(
                    "/api/auth/verify-email/",
                    payload,
                    format="json",
                )
                return response.status_code, response.data.get("code")
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _index: verify_once(), range(2)))

        self.assertEqual(sorted(results), [(200, "verified"), (200, "verified")])
        self.assertEqual(Organization.objects.filter(owner=user).count(), 1)
        organization = Organization.objects.get(owner=user)
        self.assertEqual(
            WorkspaceBuiltinTrial.objects.filter(organization=organization).count(),
            1,
        )


class ForgotPasswordTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.user = User.objects.create_user(
            email="owner@example.com",
            password="secure-password",
        )
        self.user.mark_email_verified()
        Organization.objects.create_with_owner(owner=self.user)

    def test_existing_and_missing_email_return_the_same_payload(self):
        with patch("accounts.services.send_password_reset_email"):
            existing = self.api.post(
                "/api/auth/forgot-password/",
                {"email": "owner@example.com"},
                format="json",
            )
            missing = self.api.post(
                "/api/auth/forgot-password/",
                {"email": "missing@example.com"},
                format="json",
            )
        self.assertEqual(existing.status_code, 200)
        self.assertEqual(missing.status_code, 200)
        self.assertEqual(existing.data, missing.data)
        self.assertEqual(existing.data["detail"], FORGOT_PASSWORD_MESSAGE)

    def test_reset_email_only_sent_for_eligible_user(self):
        with patch("accounts.services.send_password_reset_email") as send_mail:
            self.api.post(
                "/api/auth/forgot-password/",
                {"email": "owner@example.com"},
                format="json",
            )
            self.api.post(
                "/api/auth/forgot-password/",
                {"email": "missing@example.com"},
                format="json",
            )
        send_mail.assert_called_once()
        self.assertEqual(send_mail.call_args.args[0].pk, self.user.pk)

    def test_reset_password_success_invalidates_old_password(self):
        from accounts.tokens import password_reset_token_generator

        token = password_reset_token_generator.make_token(self.user)
        response = self.api.post(
            "/api/auth/reset-password/",
            {
                "uid": uid_for(self.user),
                "token": token,
                "password": "brand-new-password-32",
                "password_confirm": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.check_password("secure-password"))
        self.assertTrue(self.user.check_password("brand-new-password-32"))

        reused = self.api.post(
            "/api/auth/reset-password/",
            {
                "uid": uid_for(self.user),
                "token": token,
                "password": "another-new-password-32",
                "password_confirm": "another-new-password-32",
            },
            format="json",
        )
        self.assertEqual(reused.status_code, 400)
        self.assertEqual(reused.data["code"], "token_invalid")

        old_login = APIClient().post(
            "/api/auth/login/",
            {"email": "owner@example.com", "password": "secure-password"},
            format="json",
        )
        new_login = APIClient().post(
            "/api/auth/login/",
            {"email": "owner@example.com", "password": "brand-new-password-32"},
            format="json",
        )
        self.assertEqual(old_login.status_code, 401)
        self.assertEqual(new_login.status_code, 200)

    def test_invalid_and_expired_reset_tokens(self):
        from accounts.tokens import password_reset_token_generator

        token = password_reset_token_generator.make_token(self.user)
        invalid = self.api.post(
            "/api/auth/reset-password/",
            {
                "uid": uid_for(self.user),
                "token": "nope-token",
                "password": "brand-new-password-32",
                "password_confirm": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(invalid.data["code"], "token_invalid")

        future = password_reset_token_generator._now() + timedelta(hours=25)
        with patch.object(password_reset_token_generator, "_now", return_value=future):
            expired = self.api.post(
                "/api/auth/reset-password/",
                {
                    "uid": uid_for(self.user),
                    "token": token,
                    "password": "brand-new-password-32",
                    "password_confirm": "brand-new-password-32",
                },
                format="json",
            )
        self.assertEqual(expired.status_code, 400)
        self.assertEqual(expired.data["code"], "token_expired")

    def test_password_validators_enforced_on_reset(self):
        from accounts.tokens import password_reset_token_generator

        token = password_reset_token_generator.make_token(self.user)
        response = self.api.post(
            "/api/auth/reset-password/",
            {
                "uid": uid_for(self.user),
                "token": token,
                "password": "123",
                "password_confirm": "123",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data)


class ChangePasswordTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="owner@example.com",
            password="secure-password",
        )
        self.user.mark_email_verified()
        Organization.objects.create_with_owner(owner=self.user)
        self.api = APIClient()
        self.api.force_login(self.user)

    def test_current_password_required(self):
        response = self.api.post(
            "/api/auth/change-password/",
            {
                "current_password": "wrong-password",
                "new_password": "brand-new-password-32",
                "new_password_confirm": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("current_password", response.data)

    def test_weak_new_password_rejected(self):
        response = self.api.post(
            "/api/auth/change-password/",
            {
                "current_password": "secure-password",
                "new_password": "123",
                "new_password_confirm": "123",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password", response.data)

    def test_successful_change_keeps_current_session(self):
        response = self.api.post(
            "/api/auth/change-password/",
            {
                "current_password": "secure-password",
                "new_password": "brand-new-password-32",
                "new_password_confirm": "brand-new-password-32",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        workspace = self.api.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("brand-new-password-32"))

    def test_account_endpoint_hides_internal_flags(self):
        response = self.api.get("/api/auth/account/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["email"], "owner@example.com")
        self.assertTrue(response.data["email_verified"])
        self.assertNotIn("is_staff", response.data)
        self.assertNotIn("is_superuser", response.data)
        self.assertNotIn("is_active", response.data)
        self.assertEqual(response.data["two_factor_status"], "not_enabled")
