"""Native iOS Google Sign-In tests (mocked token verify; no real Google network)."""

from __future__ import annotations

import time
from unittest.mock import patch

import pyotp
from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.customer_two_factor_models import OwnerTOTPDevice
from accounts.google_oauth import GoogleOAuthResultCode
from accounts.google_oauth_client import GoogleOAuthClientError, verify_google_native_id_token
from accounts.owner_auth_provider_models import OwnerAuthProvider, OwnerAuthProviderLink
from accounts.owner_two_factor import decrypt_owner_totp_secret
from accounts.two_factor import TOTP_INTERVAL
from organizations.models import Organization

User = get_user_model()

IOS_CLIENT_ID = "1234567890-nativeios.apps.googleusercontent.com"
WEB_AUDIENCE = "1234567890-browserweb.apps.googleusercontent.com"
OTHER_AUDIENCE = "9999999999-other.apps.googleusercontent.com"

NATIVE_TEST_SETTINGS = {
    "GOOGLE_NATIVE_IOS_CLIENT_ID": IOS_CLIENT_ID,
    "GOOGLE_OAUTH_CLIENT_ID": WEB_AUDIENCE,
    "GOOGLE_OAUTH_CLIENT_SECRET": "browser-secret",
    "FRONTEND_BASE_URL": "http://localhost:5173",
}


def create_owner(email="owner@example.com", *, password="secure-password", verified=True):
    user = User.objects.create_user(email=email, password=password)
    if verified:
        user.mark_email_verified()
    organization = Organization.objects.create_with_owner(owner=user)
    return user, organization


@override_settings(**NATIVE_TEST_SETTINGS)
class VerifyGoogleNativeIdTokenTests(TestCase):
    def _base_claims(self, *, aud=WEB_AUDIENCE, **extra):
        now = int(time.time())
        claims = {
            "sub": "google-native-sub",
            "email": "native@example.com",
            "email_verified": True,
            "iss": "https://accounts.google.com",
            "aud": aud,
            "iat": now,
            "exp": now + 3600,
            # AppAuth may embed an opaque nonce; native path must ignore it.
            "nonce": "opaque-appauth-nonce",
        }
        claims.update(extra)
        return claims

    def test_valid_token_with_web_audience_accepted(self):
        claims = self._base_claims()
        with patch(
            "google.oauth2.id_token.verify_oauth2_token",
            return_value=claims,
        ) as verify:
            result = verify_google_native_id_token("fake-jwt")
        verify.assert_called_once()
        self.assertEqual(verify.call_args.args[2], WEB_AUDIENCE)
        self.assertEqual(result["sub"], "google-native-sub")
        self.assertEqual(result["aud"], WEB_AUDIENCE)

    def test_ios_audience_rejected(self):
        with patch(
            "google.oauth2.id_token.verify_oauth2_token",
            side_effect=ValueError("Token has wrong audience"),
        ):
            with self.assertRaises(GoogleOAuthClientError) as ctx:
                verify_google_native_id_token("fake-jwt")
        self.assertEqual(str(ctx.exception), "invalid_audience")

    def test_claims_with_ios_audience_rejected_after_verify(self):
        claims = self._base_claims(aud=IOS_CLIENT_ID)
        with patch(
            "google.oauth2.id_token.verify_oauth2_token",
            return_value=claims,
        ):
            with self.assertRaises(GoogleOAuthClientError) as ctx:
                verify_google_native_id_token("fake-jwt")
        self.assertEqual(str(ctx.exception), "invalid_audience")

    def test_wrong_arbitrary_audience_rejected(self):
        claims = self._base_claims(aud=OTHER_AUDIENCE)
        with patch(
            "google.oauth2.id_token.verify_oauth2_token",
            return_value=claims,
        ):
            with self.assertRaises(GoogleOAuthClientError) as ctx:
                verify_google_native_id_token("fake-jwt")
        self.assertEqual(str(ctx.exception), "invalid_audience")

    def test_expired_token_rejected(self):
        with patch(
            "google.oauth2.id_token.verify_oauth2_token",
            side_effect=ValueError("Token expired"),
        ):
            with self.assertRaises(GoogleOAuthClientError) as ctx:
                verify_google_native_id_token("fake-jwt")
        self.assertEqual(str(ctx.exception), "expired_id_token")

    def test_invalid_token_rejected(self):
        with patch(
            "google.oauth2.id_token.verify_oauth2_token",
            side_effect=ValueError("Bad signature"),
        ):
            with self.assertRaises(GoogleOAuthClientError) as ctx:
                verify_google_native_id_token("fake-jwt")
        self.assertEqual(str(ctx.exception), "invalid_id_token")

    def test_opaque_appauth_nonce_claim_ignored(self):
        claims = self._base_claims(nonce="unmatchable-sdk-nonce")
        with patch(
            "google.oauth2.id_token.verify_oauth2_token",
            return_value=claims,
        ):
            result = verify_google_native_id_token("fake-jwt")
        self.assertEqual(result["sub"], "google-native-sub")

    def test_missing_nonce_claim_accepted(self):
        claims = self._base_claims()
        claims.pop("nonce")
        with patch(
            "google.oauth2.id_token.verify_oauth2_token",
            return_value=claims,
        ):
            result = verify_google_native_id_token("fake-jwt")
        self.assertEqual(result["sub"], "google-native-sub")

    def test_native_verifier_uses_web_client_id_as_audience(self):
        claims = self._base_claims()
        with patch(
            "google.oauth2.id_token.verify_oauth2_token",
            return_value=claims,
        ) as verify:
            verify_google_native_id_token("fake-jwt")
        self.assertEqual(verify.call_args.args[2], WEB_AUDIENCE)
        self.assertNotEqual(verify.call_args.args[2], IOS_CLIENT_ID)

    def test_missing_web_client_id_rejects(self):
        with override_settings(GOOGLE_OAUTH_CLIENT_ID=""):
            with self.assertRaises(GoogleOAuthClientError) as ctx:
                verify_google_native_id_token("fake-jwt")
        self.assertEqual(str(ctx.exception), "native_audience_not_configured")


@override_settings(**NATIVE_TEST_SETTINGS)
class GoogleNativeCompleteEndpointTests(TestCase):
    def setUp(self):
        self.client = Client()

    def _post(self, payload):
        return self.client.post(
            "/api/auth/google/native/",
            data=payload,
            content_type="application/json",
        )

    def _claims(
        self,
        *,
        sub="google-native-sub",
        email="native@example.com",
        email_verified=True,
        aud=WEB_AUDIENCE,
    ):
        return {
            "sub": sub,
            "email": email,
            "email_verified": email_verified,
            "iss": "https://accounts.google.com",
            "aud": aud,
            "exp": int(timezone.now().timestamp()) + 3600,
        }

    def test_not_configured_returns_503(self):
        with override_settings(GOOGLE_NATIVE_IOS_CLIENT_ID=""):
            response = self._post(
                {
                    "identity_token": "x",
                    "intent": "login",
                }
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], GoogleOAuthResultCode.OAUTH_NOT_CONFIGURED)

    def test_missing_web_client_returns_503(self):
        with override_settings(GOOGLE_OAUTH_CLIENT_ID=""):
            response = self._post(
                {
                    "identity_token": "x",
                    "intent": "login",
                }
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], GoogleOAuthResultCode.OAUTH_NOT_CONFIGURED)

    def test_malformed_request_rejected(self):
        response = self._post({"intent": "login"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], GoogleOAuthResultCode.AUTHENTICATION_FAILED)

        response = self._post({"identity_token": "tok", "intent": "link"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], GoogleOAuthResultCode.INVALID_INTENT)

    def test_linked_owner_logs_in(self):
        owner, _org = create_owner(email="linked-native@example.com")
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-native-sub",
            provider_email="linked-native@example.com",
            provider_email_verified=True,
        )
        with patch(
            "accounts.google_native_auth.verify_google_native_id_token",
            return_value=self._claims(email=""),
        ) as verify:
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "intent": "login",
                }
            )
        verify.assert_called_once()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["role"], "owner")
        self.assertEqual(self.client.get("/api/workspace/").status_code, 200)

    def test_existing_email_without_google_link_requires_connect(self):
        create_owner(email="existing@example.com")
        with patch(
            "accounts.google_native_auth.verify_google_native_id_token",
            return_value=self._claims(sub="new-google-sub", email="existing@example.com"),
        ):
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "intent": "login",
                }
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["code"],
            GoogleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
        )
        self.assertNotEqual(self.client.get("/api/workspace/").status_code, 200)

    def test_register_creates_owner_with_google_link(self):
        with patch(
            "accounts.google_native_auth.verify_google_native_id_token",
            return_value=self._claims(
                sub="google-reg-sub",
                email="new-google@example.com",
            ),
        ):
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "intent": "register",
                    "legal_acknowledgement": True,
                }
            )
        self.assertEqual(response.status_code, 200)
        user = User.objects.get(email="new-google@example.com")
        self.assertTrue(user.email_verified)
        link = OwnerAuthProviderLink.objects.get(
            user=user,
            provider=OwnerAuthProvider.GOOGLE,
        )
        self.assertEqual(link.provider_subject, "google-reg-sub")
        self.assertEqual(self.client.get("/api/workspace/").status_code, 200)

    def test_register_collision_when_google_already_linked(self):
        owner, _org = create_owner(email="already@example.com")
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-taken-sub",
        )
        with patch(
            "accounts.google_native_auth.verify_google_native_id_token",
            return_value=self._claims(
                sub="google-taken-sub",
                email="other@example.com",
            ),
        ):
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "intent": "register",
                    "legal_acknowledgement": True,
                }
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], GoogleOAuthResultCode.GOOGLE_ALREADY_LINKED)

    def test_register_existing_email_requires_connect(self):
        create_owner(email="taken@example.com")
        with patch(
            "accounts.google_native_auth.verify_google_native_id_token",
            return_value=self._claims(sub="google-new-sub", email="taken@example.com"),
        ):
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "intent": "register",
                    "legal_acknowledgement": True,
                }
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["code"],
            GoogleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
        )

    def test_register_requires_legal_acknowledgement(self):
        with patch(
            "accounts.google_native_auth.verify_google_native_id_token",
            return_value=self._claims(sub="google-legal-sub", email="legal@example.com"),
        ):
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "intent": "register",
                    "legal_acknowledgement": False,
                }
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["code"],
            GoogleOAuthResultCode.LEGAL_ACKNOWLEDGEMENT_REQUIRED,
        )

    def test_2fa_owner_returns_two_factor_required(self):
        owner, _org = create_owner(email="2fa-native@example.com")
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-2fa-sub",
        )
        api = APIClient()
        api.force_authenticate(owner)
        start = api.post(
            "/api/auth/owner-2fa/setup/",
            {"current_password": "secure-password"},
            format="json",
        )
        secret = start.data["setup_key"]
        code = pyotp.TOTP(secret, digits=6, interval=TOTP_INTERVAL).now()
        api.post("/api/auth/owner-2fa/setup/verify/", {"code": code}, format="json")

        with patch(
            "accounts.google_native_auth.verify_google_native_id_token",
            return_value=self._claims(sub="google-2fa-sub", email=""),
        ):
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "intent": "login",
                }
            )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "two_factor_required")
        self.assertNotEqual(self.client.get("/api/workspace/").status_code, 200)

        device = OwnerTOTPDevice.objects.get(user=owner)
        totp_secret = decrypt_owner_totp_secret(device.secret_encrypted)
        from accounts.two_factor import current_timestep

        step = current_timestep()
        if device.last_verified_timestep is not None and device.last_verified_timestep >= step - 1:
            step = int(device.last_verified_timestep) + 1
        challenge_code = pyotp.TOTP(totp_secret, digits=6, interval=TOTP_INTERVAL).at(
            step * TOTP_INTERVAL
        )
        challenge = self.client.post(
            "/api/auth/owner-2fa/challenge/",
            data='{"code":"%s"}' % challenge_code,
            content_type="application/json",
        )
        self.assertEqual(challenge.status_code, 200)
        self.assertEqual(self.client.get("/api/workspace/").status_code, 200)

    def test_verify_failure_maps_to_auth_failed(self):
        with patch(
            "accounts.google_native_auth.verify_google_native_id_token",
            side_effect=GoogleOAuthClientError("invalid_audience"),
        ):
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "intent": "login",
                }
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], GoogleOAuthResultCode.AUTHENTICATION_FAILED)
        self.assertIn("app", response.json()["detail"].lower())


@override_settings(**NATIVE_TEST_SETTINGS)
class GoogleNativeVerifyEndpointTests(TestCase):
    def setUp(self):
        self.owner, self.org = create_owner(email="verify-native@example.com")
        self.owner.set_unusable_password()
        self.owner.save(update_fields=["password"])
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-native-verify-sub",
            provider_email="verify-native@example.com",
            provider_email_verified=True,
        )
        self.client = Client()
        self.client.force_login(self.owner)
        self.session_key = self.client.session.session_key

    def _claims(self, *, sub="google-native-verify-sub", email="verify-native@example.com"):
        return {
            "sub": sub,
            "email": email,
            "email_verified": True,
            "iss": "https://accounts.google.com",
            "aud": WEB_AUDIENCE,
            "exp": int(timezone.now().timestamp()) + 3600,
        }

    def _post_verify(self, *, sub="google-native-verify-sub"):
        with patch(
            "accounts.google_native_auth.verify_google_native_id_token",
            return_value=self._claims(sub=sub),
        ):
            return self.client.post(
                "/api/auth/google/native/",
                data={
                    "identity_token": "fake-token",
                    "intent": "verify",
                },
                content_type="application/json",
            )

    def test_authenticated_google_owner_can_native_reverify(self):
        from accounts.owner_sensitive_auth import (
            OWNER_OAUTH_REAUTH_SESSION_KEY,
            owner_oauth_reauth_is_fresh,
        )

        response = self._post_verify()
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["code"], GoogleOAuthResultCode.VERIFIED)
        self.assertEqual(self.client.session.session_key, self.session_key)
        self.assertEqual(self.client.get("/api/workspace/").status_code, 200)
        self.assertIn(OWNER_OAUTH_REAUTH_SESSION_KEY, self.client.session)
        self.assertEqual(
            self.client.session[OWNER_OAUTH_REAUTH_SESSION_KEY]["provider"],
            OwnerAuthProvider.GOOGLE,
        )
        self.assertTrue(
            owner_oauth_reauth_is_fresh(
                type("R", (), {"session": self.client.session})(),
                self.owner,
                provider=OwnerAuthProvider.GOOGLE,
            )
        )
        self.assertEqual(
            OwnerAuthProviderLink.objects.filter(
                provider=OwnerAuthProvider.GOOGLE,
                provider_subject="google-native-verify-sub",
            ).count(),
            1,
        )
        self.assertEqual(
            OwnerAuthProviderLink.objects.get(
                provider=OwnerAuthProvider.GOOGLE,
                provider_subject="google-native-verify-sub",
            ).user_id,
            self.owner.pk,
        )

    def test_wrong_google_subject_rejected_without_changing_session(self):
        response = self._post_verify(sub="someone-else-google-sub")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], GoogleOAuthResultCode.AUTHENTICATION_FAILED)
        self.assertEqual(self.client.session.session_key, self.session_key)
        self.assertEqual(self.client.get("/api/workspace/").status_code, 200)
        self.assertNotIn("_owner_oauth_reauth", self.client.session)
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())

    def test_unauthenticated_verify_rejected(self):
        anon = Client()
        with patch(
            "accounts.google_native_auth.verify_google_native_id_token",
            return_value=self._claims(),
        ):
            response = anon.post(
                "/api/auth/google/native/",
                data={
                    "identity_token": "fake-token",
                    "intent": "verify",
                },
                content_type="application/json",
            )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], GoogleOAuthResultCode.AUTHENTICATION_REQUIRED)

    def test_native_reverify_then_delete_succeeds(self):
        response = self._post_verify()
        self.assertEqual(response.status_code, 200)
        delete = self.client.post(
            "/api/auth/account/delete/",
            data={"confirmation": "DELETE"},
            content_type="application/json",
        )
        self.assertEqual(delete.status_code, 200, delete.content)
        self.assertFalse(User.objects.filter(pk=self.owner.pk).exists())
        self.assertFalse(Organization.objects.filter(pk=self.org.pk).exists())

    def test_native_reverify_allows_primary_and_backup_email_actions(self):
        response = self._post_verify()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.session.session_key, self.session_key)

        with patch("accounts.email_management.send_primary_email_change_verification"):
            primary = self.client.post(
                "/api/auth/account/primary-email/",
                data={"email": "new-login@example.com"},
                content_type="application/json",
            )
        self.assertEqual(primary.status_code, 200, primary.content)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.pending_primary_email, "new-login@example.com")

        with patch("accounts.email_management.send_backup_email_verification"):
            backup = self.client.post(
                "/api/auth/account/backup-email/",
                data={"email": "backup-google@example.com"},
                content_type="application/json",
            )
        self.assertEqual(backup.status_code, 200, backup.content)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.pending_backup_email, "backup-google@example.com")
