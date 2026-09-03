"""Phase 5 tests for owner sign-in method management (set password, unlink)."""

import json
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import pyotp
from django.contrib.auth import authenticate, get_user_model
from django.test import Client, TestCase, override_settings
from rest_framework.test import APIClient

from accounts.customer_two_factor_models import OwnerTOTPDevice
from accounts.google_oauth import GoogleOAuthResultCode
from accounts.google_oauth_state import load_google_oauth_state
from accounts.owner_auth_provider_models import OwnerAuthProvider, OwnerAuthProviderLink
from accounts.owner_sensitive_auth import OWNER_OAUTH_REAUTH_SESSION_KEY
from accounts.owner_two_factor import decrypt_owner_totp_secret
from accounts.two_factor import TOTP_INTERVAL, current_timestep
from django.utils import timezone
from organizations.models import Organization

User = get_user_model()

GOOGLE_TEST_SETTINGS = {
    "GOOGLE_OAUTH_CLIENT_ID": "test-google-client-id",
    "GOOGLE_OAUTH_CLIENT_SECRET": "test-google-client-secret",
    "FRONTEND_BASE_URL": "http://localhost:5173",
}


def response_data(response):
    if hasattr(response, "data"):
        return response.data
    return response.json()


def post_json(client, path, payload):
    return client.post(path, data=json.dumps(payload), content_type="application/json")


def create_owner(email="owner@example.com", *, password="secure-password", verified=True):
    user = User.objects.create_user(email=email, password=password)
    if verified:
        user.mark_email_verified()
    organization = Organization.objects.create_with_owner(owner=user)
    return user, organization


def oauth_only_owner(email="oauth-only@example.com"):
    user, organization = create_owner(email=email)
    user.set_unusable_password()
    user.save(update_fields=["password"])
    return user, organization


def google_claims(*, sub="google-sub-123", email="owner@gmail.com", email_verified=True, nonce=""):
    from django.utils import timezone

    return {
        "sub": sub,
        "email": email,
        "email_verified": email_verified,
        "iss": "accounts.google.com",
        "aud": GOOGLE_TEST_SETTINGS["GOOGLE_OAUTH_CLIENT_ID"],
        "nonce": nonce,
        "exp": int(timezone.now().timestamp()) + 3600,
    }


def result_code_from_redirect(url: str) -> str:
    query = parse_qs(urlparse(url).query)
    if "result" in query:
        return query["result"][0]
    return query["code"][0]


def _totp_code_for_step(secret, *, step):
    totp = pyotp.TOTP(secret, digits=6, interval=TOTP_INTERVAL)
    return totp.at(step * TOTP_INTERVAL)


def _totp_code_for_device_step(secret, device):
    step = current_timestep()
    if device.last_verified_timestep is not None:
        if device.last_verified_timestep >= step - 1:
            step = int(device.last_verified_timestep) + 1
    return _totp_code_for_step(secret, step=step)


def enable_owner_2fa(user, *, password="secure-password"):
    client = APIClient()
    client.force_authenticate(user)
    start = client.post("/api/auth/owner-2fa/setup/", {"current_password": password})
    assert start.status_code == 200, start.data
    secret = start.data["setup_key"]
    device = OwnerTOTPDevice.objects.get(user=user, confirmed=False)
    code = pyotp.TOTP(secret, interval=TOTP_INTERVAL).now()
    verify = client.post("/api/auth/owner-2fa/setup/verify/", {"code": code})
    return secret, verify.data["recovery_codes"], device


@override_settings(**GOOGLE_TEST_SETTINGS)
class SetPasswordViewTests(TestCase):
    def setUp(self):
        self.owner, _organization = oauth_only_owner()
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-setpw",
            provider_email="oauth@gmail.com",
        )
        self.client = Client()
        self.client.force_login(self.owner)

    def _record_google_reauth(self):
        session = self.client.session
        session[OWNER_OAUTH_REAUTH_SESSION_KEY] = {
            "user_id": self.owner.pk,
            "provider": OwnerAuthProvider.GOOGLE,
            "verified_at": timezone.now().isoformat(),
        }
        session.save()

    def test_oauth_only_owner_can_set_first_password_after_oauth_reauth(self):
        self._record_google_reauth()
        response = post_json(
            self.client,
            "/api/auth/set-password/",
            {
                "new_password": "brand-new-password-9",
                "new_password_confirm": "brand-new-password-9",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.has_usable_password())
        data = response_data(response)
        self.assertTrue(data["sign_in_methods"]["password"]["enabled"])
        self.assertTrue(
            OwnerAuthProviderLink.objects.filter(
                user=self.owner,
                provider=OwnerAuthProvider.GOOGLE,
            ).exists()
        )
        auth_user = authenticate(username=self.owner.email, password="brand-new-password-9")
        self.assertEqual(auth_user.pk, self.owner.pk)

    def test_set_password_requires_recent_oauth_reauth_without_2fa(self):
        response = post_json(
            self.client,
            "/api/auth/set-password/",
            {
                "new_password": "brand-new-password-9",
                "new_password_confirm": "brand-new-password-9",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response_data(response)["code"], "oauth_reauth_required")

    def test_password_login_still_requires_2fa_after_set_password(self):
        self._record_google_reauth()
        response = post_json(
            self.client,
            "/api/auth/set-password/",
            {
                "new_password": "brand-new-password-9",
                "new_password_confirm": "brand-new-password-9",
            },
        )
        self.assertEqual(response.status_code, 200)

        self.owner.refresh_from_db()
        enable_owner_2fa(self.owner, password="brand-new-password-9")
        login_client = APIClient()
        login_response = login_client.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "brand-new-password-9"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 403)
        self.assertEqual(login_response.data.get("code"), "two_factor_required")

    def test_password_validators_enforced(self):
        self._record_google_reauth()
        response = post_json(
            self.client,
            "/api/auth/set-password/",
            {"new_password": "short", "new_password_confirm": "short"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password", response_data(response))

    def test_mismatched_confirmation_rejected(self):
        self._record_google_reauth()
        response = post_json(
            self.client,
            "/api/auth/set-password/",
            {
                "new_password": "brand-new-password-9",
                "new_password_confirm": "different-password-9",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password_confirm", response_data(response))

    def test_existing_password_user_cannot_use_set_password(self):
        owner, _organization = create_owner()
        client = APIClient()
        client.force_authenticate(owner)
        response = client.post(
            "/api/auth/set-password/",
            {
                "new_password": "brand-new-password-9",
                "new_password_confirm": "brand-new-password-9",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "password_already_set")


class UnlinkProviderViewTests(TestCase):
    def setUp(self):
        self.owner, _organization = create_owner(email="unlink-owner@example.com")
        self.google_link = OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-unlink",
            provider_email="unlink@gmail.com",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_google_unlink_works_when_password_remains(self):
        response = self.client.post(
            "/api/auth/google/unlink/",
            {"current_password": "secure-password"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(
            OwnerAuthProviderLink.objects.filter(pk=self.google_link.pk).exists()
        )
        self.assertFalse(response.data["sign_in_methods"]["google"]["linked"])
        self.assertTrue(response.data["sign_in_methods"]["password"]["enabled"])

    def test_apple_unlink_works_when_password_remains(self):
        apple_link = OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-sub-unlink",
        )
        response = self.client.post(
            "/api/auth/apple/unlink/",
            {"current_password": "secure-password"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(OwnerAuthProviderLink.objects.filter(pk=apple_link.pk).exists())

    def test_final_google_method_cannot_be_removed_for_oauth_only_owner(self):
        self.owner.set_unusable_password()
        self.owner.save(update_fields=["password"])
        response = self.client.post("/api/auth/google/unlink/", {})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "last_sign_in_method")

    def test_final_apple_method_cannot_be_removed_for_oauth_only_owner(self):
        self.owner.set_unusable_password()
        self.owner.save(update_fields=["password"])
        self.google_link.delete()
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-only-sub",
        )
        response = self.client.post("/api/auth/apple/unlink/", {})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "last_sign_in_method")

    def test_google_and_apple_oauth_only_owner_can_unlink_one_provider(self):
        self.owner.set_unusable_password()
        self.owner.save(update_fields=["password"])
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-sub-pair",
        )
        session_client = Client()
        session_client.force_login(self.owner)
        session = session_client.session
        session[OWNER_OAUTH_REAUTH_SESSION_KEY] = {
            "user_id": self.owner.pk,
            "provider": OwnerAuthProvider.APPLE,
            "verified_at": timezone.now().isoformat(),
        }
        session.save()

        response = session_client.post(
            "/api/auth/google/unlink/",
            {},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(OwnerAuthProviderLink.objects.filter(pk=self.google_link.pk).exists())

    def test_unlink_requires_password_reauth_for_password_owner(self):
        response = self.client.post("/api/auth/google/unlink/", {})
        self.assertEqual(response.status_code, 400)
        self.assertIn("current_password", response.data)

    def test_anonymous_unlink_rejected(self):
        client = APIClient()
        response = client.post("/api/auth/google/unlink/", {"current_password": "secure-password"})
        self.assertEqual(response.status_code, 401)

    def test_unlink_with_2fa_requires_second_factor(self):
        enable_owner_2fa(self.owner)
        response = self.client.post(
            "/api/auth/google/unlink/",
            {"current_password": "secure-password"},
        )
        self.assertEqual(response.status_code, 400)

        device = OwnerTOTPDevice.objects.get(user=self.owner, confirmed=True)
        secret = decrypt_owner_totp_secret(device.secret_encrypted)
        code = _totp_code_for_device_step(secret, device)
        response = self.client.post(
            "/api/auth/google/unlink/",
            {"current_password": "secure-password", "code": code},
        )
        self.assertEqual(response.status_code, 200)


@override_settings(**GOOGLE_TEST_SETTINGS)
class OAuthVerifyIntentTests(TestCase):
    def setUp(self):
        self.owner, _organization = oauth_only_owner()
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-verify",
            provider_email="verify@gmail.com",
        )
        self.client = Client()
        self.client.force_login(self.owner)

    def test_verify_intent_records_reauth_for_linked_google_identity(self):
        response = self.client.get("/api/auth/google/start/?intent=verify")
        self.assertEqual(response.status_code, 302)
        pending = load_google_oauth_state(response.wsgi_request)
        claims = google_claims(sub="google-sub-verify", email="verify@gmail.com", nonce=pending.nonce)
        with patch(
            "accounts.google_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.google_oauth.verify_google_id_token",
            return_value=claims,
        ):
            callback = self.client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending.state},
            )
        self.assertIn("/account/security", callback["Location"])
        self.assertEqual(
            result_code_from_redirect(callback["Location"]),
            GoogleOAuthResultCode.VERIFIED,
        )

        response = self.client.post(
            "/api/auth/set-password/",
            data=json.dumps(
                {
                    "new_password": "brand-new-password-9",
                    "new_password_confirm": "brand-new-password-9",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)

    def test_verify_rejects_unlinked_google_identity(self):
        response = self.client.get("/api/auth/google/start/?intent=verify")
        pending = load_google_oauth_state(response.wsgi_request)
        claims = google_claims(sub="google-sub-other", email="other@gmail.com", nonce=pending.nonce)
        with patch(
            "accounts.google_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.google_oauth.verify_google_id_token",
            return_value=claims,
        ):
            callback = self.client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending.state},
            )
        self.assertEqual(
            result_code_from_redirect(callback["Location"]),
            GoogleOAuthResultCode.AUTHENTICATION_FAILED,
        )


class PasswordNotAvailableApiTests(TestCase):
    def setUp(self):
        self.owner, _organization = oauth_only_owner()
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-guidance",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_primary_email_change_returns_password_not_available(self):
        response = self.client.post(
            "/api/auth/account/primary-email/",
            {"email": "new@example.com", "current_password": "anything"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "password_not_available")

    def test_delete_account_returns_oauth_reauth_required(self):
        response = self.client.post(
            "/api/auth/account/delete/",
            {"current_password": "anything", "confirmation": "DELETE"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "oauth_reauth_required")

    def test_owner_2fa_setup_returns_password_not_available(self):
        response = self.client.post(
            "/api/auth/owner-2fa/setup/",
            {"current_password": "anything"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "password_not_available")
