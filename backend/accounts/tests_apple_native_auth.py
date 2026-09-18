"""Native iOS Sign in with Apple tests (mocked JWKS; no real Apple network)."""

from __future__ import annotations

import hashlib
import time
from unittest.mock import MagicMock, patch

import jwt
import pyotp
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.apple_oauth import AppleOAuthResultCode
from accounts.apple_oauth_client import AppleOAuthClientError, verify_apple_native_id_token
from accounts.customer_two_factor_models import OwnerTOTPDevice
from accounts.owner_auth_provider_models import OwnerAuthProvider, OwnerAuthProviderLink
from accounts.owner_two_factor import decrypt_owner_totp_secret
from accounts.two_factor import TOTP_INTERVAL
from organizations.models import Organization

User = get_user_model()

NATIVE_AUDIENCE = "app.checkstation.client"
BROWSER_AUDIENCE = "com.checkstation.services.test"

NATIVE_TEST_SETTINGS = {
    "APPLE_NATIVE_IOS_CLIENT_ID": NATIVE_AUDIENCE,
    "APPLE_OAUTH_CLIENT_ID": BROWSER_AUDIENCE,
    "APPLE_OAUTH_TEAM_ID": "TEAM123456",
    "APPLE_OAUTH_KEY_ID": "KEY123456",
    "APPLE_OAUTH_PRIVATE_KEY": "unused-for-native",
    "FRONTEND_BASE_URL": "http://localhost:5173",
}

_RSA_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_RSA_PEM = _RSA_KEY.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption(),
)


def create_owner(email="owner@example.com", *, password="secure-password", verified=True):
    user = User.objects.create_user(email=email, password=password)
    if verified:
        user.mark_email_verified()
    organization = Organization.objects.create_with_owner(owner=user)
    return user, organization


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def mint_native_id_token(
    *,
    sub="apple-native-sub",
    email="native@example.com",
    email_verified=True,
    raw_nonce="raw-nonce-value",
    audience=NATIVE_AUDIENCE,
    exp_offset=3600,
    issuer="https://appleid.apple.com",
    include_nonce=True,
):
    now = int(time.time())
    claims = {
        "sub": sub,
        "email": email,
        "email_verified": email_verified,
        "iss": issuer,
        "aud": audience,
        "iat": now,
        "exp": now + exp_offset,
    }
    if include_nonce:
        claims["nonce"] = sha256_hex(raw_nonce)
    return jwt.encode(claims, _RSA_PEM, algorithm="RS256", headers={"kid": "test-kid"})


def _mock_jwks_signing_key():
    signing_key = MagicMock()
    signing_key.key = _RSA_KEY.public_key()
    client = MagicMock()
    client.get_signing_key_from_jwt.return_value = signing_key
    return client


@override_settings(**NATIVE_TEST_SETTINGS)
class VerifyAppleNativeIdTokenTests(TestCase):
    def test_valid_native_token_accepted(self):
        raw_nonce = "secure-raw-nonce"
        token = mint_native_id_token(raw_nonce=raw_nonce)
        with patch(
            "accounts.apple_oauth_client._get_jwks_client",
            return_value=_mock_jwks_signing_key(),
        ):
            claims = verify_apple_native_id_token(token, expected_raw_nonce=raw_nonce)
        self.assertEqual(claims["sub"], "apple-native-sub")
        self.assertEqual(claims["aud"], NATIVE_AUDIENCE)

    def test_wrong_audience_rejected(self):
        raw_nonce = "secure-raw-nonce"
        token = mint_native_id_token(raw_nonce=raw_nonce, audience="wrong.bundle.id")
        with patch(
            "accounts.apple_oauth_client._get_jwks_client",
            return_value=_mock_jwks_signing_key(),
        ):
            with self.assertRaises(AppleOAuthClientError) as ctx:
                verify_apple_native_id_token(token, expected_raw_nonce=raw_nonce)
        self.assertEqual(str(ctx.exception), "invalid_id_token")

    def test_browser_services_id_audience_rejected(self):
        raw_nonce = "secure-raw-nonce"
        token = mint_native_id_token(raw_nonce=raw_nonce, audience=BROWSER_AUDIENCE)
        with patch(
            "accounts.apple_oauth_client._get_jwks_client",
            return_value=_mock_jwks_signing_key(),
        ):
            with self.assertRaises(AppleOAuthClientError) as ctx:
                verify_apple_native_id_token(token, expected_raw_nonce=raw_nonce)
        self.assertEqual(str(ctx.exception), "invalid_id_token")

    def test_expired_token_rejected(self):
        raw_nonce = "secure-raw-nonce"
        token = mint_native_id_token(raw_nonce=raw_nonce, exp_offset=-120)
        with patch(
            "accounts.apple_oauth_client._get_jwks_client",
            return_value=_mock_jwks_signing_key(),
        ):
            with self.assertRaises(AppleOAuthClientError) as ctx:
                verify_apple_native_id_token(token, expected_raw_nonce=raw_nonce)
        self.assertEqual(str(ctx.exception), "expired_id_token")

    def test_invalid_signature_rejected(self):
        other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        other_pem = other_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        raw_nonce = "secure-raw-nonce"
        now = int(time.time())
        token = jwt.encode(
            {
                "sub": "x",
                "email": "x@example.com",
                "iss": "https://appleid.apple.com",
                "aud": NATIVE_AUDIENCE,
                "iat": now,
                "exp": now + 3600,
                "nonce": sha256_hex(raw_nonce),
            },
            other_pem,
            algorithm="RS256",
            headers={"kid": "test-kid"},
        )
        with patch(
            "accounts.apple_oauth_client._get_jwks_client",
            return_value=_mock_jwks_signing_key(),
        ):
            with self.assertRaises(AppleOAuthClientError) as ctx:
                verify_apple_native_id_token(token, expected_raw_nonce=raw_nonce)
        self.assertEqual(str(ctx.exception), "invalid_id_token")

    def test_nonce_mismatch_rejected(self):
        token = mint_native_id_token(raw_nonce="correct-nonce")
        with patch(
            "accounts.apple_oauth_client._get_jwks_client",
            return_value=_mock_jwks_signing_key(),
        ):
            with self.assertRaises(AppleOAuthClientError) as ctx:
                verify_apple_native_id_token(token, expected_raw_nonce="wrong-nonce")
        self.assertEqual(str(ctx.exception), "invalid_nonce")

    def test_raw_nonce_in_token_claim_is_rejected_as_invalid_nonce(self):
        """
        Production failure mode (build 8): Mobile sent the raw nonce to Apple,
        so the JWT claim equaled the raw value instead of SHA-256(hex). Backend
        must keep requiring the hash and reject that mis-wire.
        """
        raw_nonce = "raw-nonce-sent-to-apple-by-mistake"
        now = int(time.time())
        token = jwt.encode(
            {
                "sub": "apple-native-sub",
                "email": "native@example.com",
                "email_verified": True,
                "iss": "https://appleid.apple.com",
                "aud": NATIVE_AUDIENCE,
                "iat": now,
                "exp": now + 3600,
                # Claim is the raw value — wrong for native Apple semantics.
                "nonce": raw_nonce,
            },
            _RSA_PEM,
            algorithm="RS256",
            headers={"kid": "test-kid"},
        )
        with patch(
            "accounts.apple_oauth_client._get_jwks_client",
            return_value=_mock_jwks_signing_key(),
        ):
            with self.assertRaises(AppleOAuthClientError) as ctx:
                verify_apple_native_id_token(token, expected_raw_nonce=raw_nonce)
        self.assertEqual(str(ctx.exception), "invalid_nonce")

    def test_sha256_hex_claim_matches_raw_nonce_accepted(self):
        """Correct native wire: Apple claim is SHA-256(hex) of the raw nonce."""
        raw_nonce = "secure-raw-nonce-correct-wire"
        token = mint_native_id_token(raw_nonce=raw_nonce)
        with patch(
            "accounts.apple_oauth_client._get_jwks_client",
            return_value=_mock_jwks_signing_key(),
        ):
            claims = verify_apple_native_id_token(token, expected_raw_nonce=raw_nonce)
        self.assertEqual(claims["nonce"], sha256_hex(raw_nonce))
        self.assertNotEqual(claims["nonce"], raw_nonce)


@override_settings(**NATIVE_TEST_SETTINGS)
class AppleNativeCompleteEndpointTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.raw_nonce = "mobile-raw-nonce-abc"

    def _post(self, payload):
        return self.client.post(
            "/api/auth/apple/native/",
            data=payload,
            content_type="application/json",
        )

    def _claims(
        self,
        *,
        sub="apple-native-sub",
        email="native@example.com",
        email_verified=True,
        aud=NATIVE_AUDIENCE,
        nonce_hash=None,
    ):
        return {
            "sub": sub,
            "email": email,
            "email_verified": email_verified,
            "iss": "https://appleid.apple.com",
            "aud": aud,
            "nonce": nonce_hash or sha256_hex(self.raw_nonce),
            "exp": int(timezone.now().timestamp()) + 3600,
        }

    def test_not_configured_returns_503(self):
        with override_settings(APPLE_NATIVE_IOS_CLIENT_ID=""):
            response = self._post(
                {
                    "identity_token": "x",
                    "nonce": self.raw_nonce,
                    "intent": "login",
                }
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], AppleOAuthResultCode.OAUTH_NOT_CONFIGURED)

    def test_malformed_request_rejected(self):
        response = self._post({"intent": "login"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], AppleOAuthResultCode.AUTHENTICATION_FAILED)

        response = self._post(
            {"identity_token": "tok", "nonce": self.raw_nonce, "intent": "bogus"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], AppleOAuthResultCode.INVALID_INTENT)

    def test_linked_owner_logs_in(self):
        owner, _org = create_owner(email="linked-native@example.com")
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-native-sub",
            provider_email="linked-native@example.com",
            provider_email_verified=True,
        )
        with patch(
            "accounts.apple_native_auth.verify_apple_native_id_token",
            return_value=self._claims(email=""),
        ) as verify:
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "nonce": self.raw_nonce,
                    "intent": "login",
                }
            )
        verify.assert_called_once()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["role"], "owner")
        self.assertEqual(self.client.get("/api/workspace/").status_code, 200)

    def test_existing_email_without_apple_link_requires_connect(self):
        create_owner(email="existing@example.com")
        with patch(
            "accounts.apple_native_auth.verify_apple_native_id_token",
            return_value=self._claims(sub="new-apple-sub", email="existing@example.com"),
        ):
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "nonce": self.raw_nonce,
                    "intent": "login",
                }
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["code"],
            AppleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
        )
        self.assertNotEqual(self.client.get("/api/workspace/").status_code, 200)

    def test_register_creates_owner_with_apple_link(self):
        with patch(
            "accounts.apple_native_auth.verify_apple_native_id_token",
            return_value=self._claims(
                sub="apple-reg-sub",
                email="new-apple@example.com",
            ),
        ):
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "nonce": self.raw_nonce,
                    "intent": "register",
                    "legal_acknowledgement": True,
                    "full_name": {"givenName": "Ada", "familyName": "Lovelace"},
                }
            )
        self.assertEqual(response.status_code, 200)
        user = User.objects.get(email="new-apple@example.com")
        self.assertTrue(user.email_verified)
        self.assertEqual(user.first_name, "Ada")
        self.assertEqual(user.last_name, "Lovelace")
        link = OwnerAuthProviderLink.objects.get(
            user=user,
            provider=OwnerAuthProvider.APPLE,
        )
        self.assertEqual(link.provider_subject, "apple-reg-sub")
        self.assertEqual(self.client.get("/api/workspace/").status_code, 200)

    def test_register_collision_when_apple_already_linked(self):
        owner, _org = create_owner(email="already@example.com")
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-taken-sub",
        )
        with patch(
            "accounts.apple_native_auth.verify_apple_native_id_token",
            return_value=self._claims(
                sub="apple-taken-sub",
                email="other@example.com",
            ),
        ):
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "nonce": self.raw_nonce,
                    "intent": "register",
                    "legal_acknowledgement": True,
                }
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], AppleOAuthResultCode.APPLE_ALREADY_LINKED)

    def test_register_existing_email_requires_connect(self):
        create_owner(email="taken@example.com")
        with patch(
            "accounts.apple_native_auth.verify_apple_native_id_token",
            return_value=self._claims(sub="apple-new-sub", email="taken@example.com"),
        ):
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "nonce": self.raw_nonce,
                    "intent": "register",
                    "legal_acknowledgement": True,
                }
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["code"],
            AppleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
        )

    def test_register_requires_legal_acknowledgement(self):
        with patch(
            "accounts.apple_native_auth.verify_apple_native_id_token",
            return_value=self._claims(sub="apple-legal-sub", email="legal@example.com"),
        ):
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "nonce": self.raw_nonce,
                    "intent": "register",
                    "legal_acknowledgement": False,
                }
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["code"],
            AppleOAuthResultCode.LEGAL_ACKNOWLEDGEMENT_REQUIRED,
        )

    def test_2fa_owner_returns_two_factor_required(self):
        owner, _org = create_owner(email="2fa-native@example.com")
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-2fa-sub",
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
            "accounts.apple_native_auth.verify_apple_native_id_token",
            return_value=self._claims(sub="apple-2fa-sub", email=""),
        ):
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "nonce": self.raw_nonce,
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
            "accounts.apple_native_auth.verify_apple_native_id_token",
            side_effect=AppleOAuthClientError("invalid_audience"),
        ):
            response = self._post(
                {
                    "identity_token": "fake-token",
                    "nonce": self.raw_nonce,
                    "intent": "login",
                }
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], AppleOAuthResultCode.AUTHENTICATION_FAILED)
        self.assertIn("app", response.json()["detail"].lower())


@override_settings(**NATIVE_TEST_SETTINGS)
class AppleNativeVerifyEndpointTests(TestCase):
    def setUp(self):
        self.raw_nonce = "mobile-verify-nonce"
        self.owner, self.org = create_owner(email="verify-native@example.com")
        self.owner.set_unusable_password()
        self.owner.save(update_fields=["password"])
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-native-verify-sub",
            provider_email="verify-native@example.com",
            provider_email_verified=True,
        )
        self.client = Client()
        self.client.force_login(self.owner)
        self.session_key = self.client.session.session_key

    def _claims(self, *, sub="apple-native-verify-sub", email="verify-native@example.com"):
        return {
            "sub": sub,
            "email": email,
            "email_verified": True,
            "iss": "https://appleid.apple.com",
            "aud": NATIVE_AUDIENCE,
            "nonce": sha256_hex(self.raw_nonce),
            "exp": int(timezone.now().timestamp()) + 3600,
        }

    def _post_verify(self, *, sub="apple-native-verify-sub"):
        with patch(
            "accounts.apple_native_auth.verify_apple_native_id_token",
            return_value=self._claims(sub=sub),
        ):
            return self.client.post(
                "/api/auth/apple/native/",
                data={
                    "identity_token": "fake-token",
                    "nonce": self.raw_nonce,
                    "intent": "verify",
                },
                content_type="application/json",
            )

    def test_authenticated_apple_owner_can_native_reverify(self):
        from accounts.owner_sensitive_auth import (
            OWNER_OAUTH_REAUTH_SESSION_KEY,
            owner_oauth_reauth_is_fresh,
        )

        response = self._post_verify()
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["code"], AppleOAuthResultCode.VERIFIED)
        self.assertEqual(self.client.session.session_key, self.session_key)
        self.assertEqual(self.client.get("/api/workspace/").status_code, 200)
        self.assertIn(OWNER_OAUTH_REAUTH_SESSION_KEY, self.client.session)
        self.assertEqual(
            self.client.session[OWNER_OAUTH_REAUTH_SESSION_KEY]["provider"],
            OwnerAuthProvider.APPLE,
        )
        self.assertTrue(
            owner_oauth_reauth_is_fresh(
                type("R", (), {"session": self.client.session})(),
                self.owner,
                provider=OwnerAuthProvider.APPLE,
            )
        )
        # Verify must not create a second Apple link or switch owners.
        self.assertEqual(
            OwnerAuthProviderLink.objects.filter(
                provider=OwnerAuthProvider.APPLE,
                provider_subject="apple-native-verify-sub",
            ).count(),
            1,
        )
        self.assertEqual(
            OwnerAuthProviderLink.objects.get(
                provider=OwnerAuthProvider.APPLE,
                provider_subject="apple-native-verify-sub",
            ).user_id,
            self.owner.pk,
        )

    def test_wrong_apple_subject_rejected_without_changing_session(self):
        response = self._post_verify(sub="someone-else-apple-sub")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], AppleOAuthResultCode.AUTHENTICATION_FAILED)
        self.assertEqual(self.client.session.session_key, self.session_key)
        self.assertEqual(self.client.get("/api/workspace/").status_code, 200)
        self.assertNotIn("_owner_oauth_reauth", self.client.session)
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())

    def test_unauthenticated_verify_rejected(self):
        anon = Client()
        with patch(
            "accounts.apple_native_auth.verify_apple_native_id_token",
            return_value=self._claims(),
        ):
            response = anon.post(
                "/api/auth/apple/native/",
                data={
                    "identity_token": "fake-token",
                    "nonce": self.raw_nonce,
                    "intent": "verify",
                },
                content_type="application/json",
            )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], AppleOAuthResultCode.AUTHENTICATION_REQUIRED)

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

    def test_login_intent_still_works_after_verify_support(self):
        other, _org = create_owner(email="login-still@example.com")
        OwnerAuthProviderLink.objects.create(
            user=other,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-login-still-sub",
            provider_email="login-still@example.com",
            provider_email_verified=True,
        )
        anon = Client()
        with patch(
            "accounts.apple_native_auth.verify_apple_native_id_token",
            return_value=self._claims(sub="apple-login-still-sub", email="login-still@example.com"),
        ):
            response = anon.post(
                "/api/auth/apple/native/",
                data={
                    "identity_token": "fake-token",
                    "nonce": self.raw_nonce,
                    "intent": "login",
                },
                content_type="application/json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["role"], "owner")

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
                data={"email": "backup-apple@example.com"},
                content_type="application/json",
            )
        self.assertEqual(backup.status_code, 200, backup.content)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.pending_backup_email, "backup-apple@example.com")

    def test_expired_reverify_blocks_email_actions(self):
        from datetime import timedelta

        from accounts.owner_sensitive_auth import OWNER_OAUTH_REAUTH_SESSION_KEY

        session = self.client.session
        session[OWNER_OAUTH_REAUTH_SESSION_KEY] = {
            "user_id": self.owner.pk,
            "provider": OwnerAuthProvider.APPLE,
            "verified_at": (timezone.now() - timedelta(seconds=601)).isoformat(),
        }
        session.save()

        primary = self.client.post(
            "/api/auth/account/primary-email/",
            data={"email": "too-late@example.com"},
            content_type="application/json",
        )
        self.assertEqual(primary.status_code, 400)
        self.assertEqual(primary.json()["code"], "oauth_reauth_required")
        backup = self.client.post(
            "/api/auth/account/backup-email/",
            data={"email": "too-late-backup@example.com"},
            content_type="application/json",
        )
        self.assertEqual(backup.status_code, 400)
        self.assertEqual(backup.json()["code"], "oauth_reauth_required")


@override_settings(**NATIVE_TEST_SETTINGS)
class AppleNativeLinkEndpointTests(TestCase):
    def setUp(self):
        self.raw_nonce = "mobile-link-nonce"
        self.owner, self.org = create_owner(email="apple-link-native@example.com")
        self.owner.set_unusable_password()
        self.owner.save(update_fields=["password"])
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-already-on-owner",
            provider_email="apple-link-native@example.com",
            provider_email_verified=True,
        )
        self.client = Client()
        self.client.force_login(self.owner)
        self.session_key = self.client.session.session_key

    def _claims(self, *, sub="apple-link-sub", email="apple-link@example.com"):
        return {
            "sub": sub,
            "email": email,
            "email_verified": True,
            "iss": "https://appleid.apple.com",
            "aud": NATIVE_AUDIENCE,
            "nonce": sha256_hex(self.raw_nonce),
            "exp": int(timezone.now().timestamp()) + 3600,
        }

    def _post_link(self, *, claims):
        with patch(
            "accounts.apple_native_auth.verify_apple_native_id_token",
            return_value=claims,
        ):
            return self.client.post(
                "/api/auth/apple/native/",
                data={
                    "identity_token": "fake-token",
                    "nonce": self.raw_nonce,
                    "intent": "link",
                },
                content_type="application/json",
            )

    def test_authenticated_owner_links_apple(self):
        response = self._post_link(claims=self._claims())
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["code"], AppleOAuthResultCode.LINKED)
        self.assertEqual(self.client.session.session_key, self.session_key)
        link = OwnerAuthProviderLink.objects.get(
            user=self.owner,
            provider=OwnerAuthProvider.APPLE,
        )
        self.assertEqual(link.provider_subject, "apple-link-sub")
        self.assertTrue(
            OwnerAuthProviderLink.objects.filter(
                user=self.owner,
                provider=OwnerAuthProvider.GOOGLE,
            ).exists()
        )
        self.assertEqual(self.client.get("/api/workspace/").status_code, 200)

    def test_already_linked_to_current_owner_is_idempotent(self):
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-link-sub",
            provider_email="apple-link@example.com",
            provider_email_verified=True,
        )
        response = self._post_link(claims=self._claims())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["code"], AppleOAuthResultCode.ALREADY_LINKED)

    def test_provider_linked_to_another_owner_rejected(self):
        other, _org = create_owner(email="other-apple@example.com")
        OwnerAuthProviderLink.objects.create(
            user=other,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-taken-sub",
        )
        response = self._post_link(claims=self._claims(sub="apple-taken-sub"))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], AppleOAuthResultCode.APPLE_ALREADY_LINKED)
        self.assertFalse(
            OwnerAuthProviderLink.objects.filter(
                user=self.owner,
                provider=OwnerAuthProvider.APPLE,
            ).exists()
        )
        self.assertEqual(self.client.session.session_key, self.session_key)

    def test_unauthenticated_link_rejected(self):
        anon = Client()
        with patch(
            "accounts.apple_native_auth.verify_apple_native_id_token",
            return_value=self._claims(),
        ):
            response = anon.post(
                "/api/auth/apple/native/",
                data={
                    "identity_token": "fake-token",
                    "nonce": self.raw_nonce,
                    "intent": "link",
                },
                content_type="application/json",
            )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], AppleOAuthResultCode.AUTHENTICATION_REQUIRED)

    def test_email_match_alone_does_not_merge_accounts(self):
        create_owner(email="apple-same-email@example.com")
        response = self._post_link(
            claims=self._claims(sub="apple-new-sub", email="apple-same-email@example.com")
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["code"], AppleOAuthResultCode.LINKED)
        self.assertEqual(
            OwnerAuthProviderLink.objects.get(
                provider=OwnerAuthProvider.APPLE,
                provider_subject="apple-new-sub",
            ).user_id,
            self.owner.pk,
        )
