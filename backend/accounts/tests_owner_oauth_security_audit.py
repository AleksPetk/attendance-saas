"""
Phase 7 security/regression audit tests for owner Google/Apple OAuth.

Consolidates cross-cutting checks: 2FA gate integrity, deletion cascade,
sensitive-action password guidance, and provider-sub reuse after deletion.
"""

from __future__ import annotations

from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from rest_framework.test import APIClient

from accounts.apple_oauth import (
    AppleOAuthResultCode,
    handle_apple_oauth_login,
    parse_apple_identity,
)
from accounts.deletion import permanently_delete_customer_account
from accounts.google_oauth import (
    GoogleOAuthResultCode,
    handle_google_oauth_login,
    parse_google_identity,
)
from accounts.google_oauth_state import OWNER_GOOGLE_OAUTH_SESSION_KEY
from accounts.customer_two_factor_models import OwnerTOTPDevice
from accounts.owner_auth_provider_models import OwnerAuthProvider, OwnerAuthProviderLink
from accounts.owner_sensitive_auth import PASSWORD_NOT_AVAILABLE_MESSAGE
from accounts.two_factor import encrypt_totp_secret, generate_totp_secret
from organizations.models import Organization

User = get_user_model()

GOOGLE_SETTINGS = {
    "GOOGLE_OAUTH_CLIENT_ID": "audit-google-client",
    "GOOGLE_OAUTH_CLIENT_SECRET": "audit-google-secret",
    "FRONTEND_BASE_URL": "http://localhost:5173",
}


def create_owner(email="audit-owner@example.com", *, password="secure-password"):
    user = User.objects.create_user(email=email, password=password)
    user.mark_email_verified()
    organization = Organization.objects.create_with_owner(owner=user)
    return user, organization


def oauth_only_owner(email="oauth-audit@example.com"):
    user, organization = create_owner(email=email)
    user.set_unusable_password()
    user.save(update_fields=["password"])
    return user, organization


def _wsgi_request(client):
    response = client.get("/api/health/")
    return response.wsgi_request


def result_code_from_redirect(url: str) -> str:
    return parse_qs(urlparse(url).query).get("code", [""])[0]


@override_settings(**GOOGLE_SETTINGS)
class OwnerOAuthTwoFactorGateAuditTests(TestCase):
    """OAuth first-factor must not establish a session before CheckStation 2FA."""

    def setUp(self):
        self.client = Client()

    def test_google_login_with_2fa_does_not_establish_owner_session(self):
        owner, _organization = create_owner(email="google-2fa-audit@example.com")
        OwnerTOTPDevice.objects.create(
            user=owner,
            secret_encrypted=encrypt_totp_secret(generate_totp_secret()),
            confirmed=True,
        )
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-2fa-audit",
        )
        identity = parse_google_identity(
            {
                "sub": "google-sub-2fa-audit",
                "email": "google-2fa-audit@example.com",
                "email_verified": True,
            }
        )
        request = _wsgi_request(self.client)
        with patch("accounts.owner_authentication.establish_owner_session") as establish_mock:
            response = handle_google_oauth_login(request, identity)
        establish_mock.assert_not_called()
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.TWO_FACTOR_REQUIRED,
        )

    def test_apple_login_with_2fa_does_not_establish_owner_session(self):
        owner, _organization = create_owner(email="apple-2fa-audit@example.com")
        OwnerTOTPDevice.objects.create(
            user=owner,
            secret_encrypted=encrypt_totp_secret(generate_totp_secret()),
            confirmed=True,
        )
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-sub-2fa-audit",
        )
        identity = parse_apple_identity(
            {
                "sub": "apple-sub-2fa-audit",
                "email": "apple-2fa-audit@example.com",
                "email_verified": True,
            }
        )
        request = _wsgi_request(self.client)
        with patch("accounts.owner_authentication.establish_owner_session") as establish_mock:
            response = handle_apple_oauth_login(request, identity)
        establish_mock.assert_not_called()
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.TWO_FACTOR_REQUIRED,
        )


class OwnerOAuthDeletionCascadeAuditTests(TestCase):
    def test_permanent_deletion_removes_google_and_apple_provider_links(self):
        owner, _organization = create_owner(email="delete-oauth@example.com")
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-delete-audit",
        )
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-sub-delete-audit",
        )
        permanently_delete_customer_account(owner)
        self.assertFalse(
            OwnerAuthProviderLink.objects.filter(provider_subject="google-sub-delete-audit").exists()
        )
        self.assertFalse(
            OwnerAuthProviderLink.objects.filter(provider_subject="apple-sub-delete-audit").exists()
        )
        self.assertFalse(User.objects.filter(email="delete-oauth@example.com").exists())

    def test_deleted_provider_sub_allows_future_registration(self):
        owner, _organization = oauth_only_owner(email="reuse-sub@example.com")
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-reuse",
        )
        permanently_delete_customer_account(owner)
        new_owner, _org = oauth_only_owner(email="new-reuse-sub@example.com")
        link = OwnerAuthProviderLink.objects.create(
            user=new_owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-reuse",
        )
        self.assertEqual(link.user_id, new_owner.pk)


class OAuthOnlySensitiveActionAuditTests(TestCase):
    SENSITIVE_PATHS = (
        ("/api/auth/account/primary-email/", {"email": "new@example.com", "current_password": "x"}),
        ("/api/auth/account/backup-email/", {"email": "backup@example.com", "current_password": "x"}),
        ("/api/auth/account/backup-email/remove/", {"current_password": "x"}),
        ("/api/auth/owner-2fa/setup/", {"current_password": "x"}),
        ("/api/auth/account/delete/", {"current_password": "x", "confirmation": "DELETE"}),
        (
            "/api/auth/change-password/",
            {"current_password": "x", "new_password": "x", "new_password_confirm": "x"},
        ),
    )

    def setUp(self):
        self.owner, _organization = oauth_only_owner()
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sensitive-audit",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_oauth_only_owner_gets_password_not_available_on_sensitive_endpoints(self):
        for path, payload in self.SENSITIVE_PATHS:
            with self.subTest(path=path):
                response = self.client.post(path, payload, format="json")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(response.data.get("code"), "password_not_available")
                self.assertIn(PASSWORD_NOT_AVAILABLE_MESSAGE, response.data.get("detail", ""))


@override_settings(**GOOGLE_SETTINGS)
class OwnerOAuthStateIsolationAuditTests(TestCase):
    def test_oauth_state_is_single_use(self):
        owner, _organization = create_owner(email="once@gmail.com")
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-once",
        )
        client = Client()
        response = client.get("/api/auth/google/start/?intent=login")
        pending_state = client.session.get(OWNER_GOOGLE_OAUTH_SESSION_KEY)
        with patch(
            "accounts.google_oauth.exchange_authorization_code",
            return_value={"id_token": "fake"},
        ), patch(
            "accounts.google_oauth.verify_google_id_token",
            return_value={
                "sub": "google-sub-once",
                "email": "once@gmail.com",
                "email_verified": True,
                "iss": "accounts.google.com",
                "aud": GOOGLE_SETTINGS["GOOGLE_OAUTH_CLIENT_ID"],
                "nonce": pending_state["nonce"],
            },
        ):
            first = client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending_state["state"]},
            )
            second = client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending_state["state"]},
            )
        self.assertEqual(
            result_code_from_redirect(first["Location"]),
            GoogleOAuthResultCode.SUCCESS,
        )
        self.assertEqual(
            result_code_from_redirect(second["Location"]),
            GoogleOAuthResultCode.INVALID_STATE,
        )
