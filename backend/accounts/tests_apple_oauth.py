"""Apple OAuth tests for owner sign-in (mocked; no real Apple network calls)."""

from __future__ import annotations

from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import pyotp
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.apple_oauth import AppleOAuthResultCode
from accounts.apple_oauth_state import OWNER_APPLE_OAUTH_SESSION_KEY, load_apple_oauth_state
from accounts.customer_two_factor_models import OwnerTOTPDevice
from accounts.owner_auth_provider_models import OwnerAuthProvider, OwnerAuthProviderLink
from accounts.owner_two_factor import decrypt_owner_totp_secret
from accounts.two_factor import TOTP_INTERVAL
from billing.models import WorkspaceBuiltinTrial
from organizations.models import Organization

User = get_user_model()

_TEST_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
TEST_APPLE_PRIVATE_KEY_PEM = _TEST_PRIVATE_KEY.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption(),
).decode("utf-8")

APPLE_TEST_SETTINGS = {
    "APPLE_OAUTH_CLIENT_ID": "com.checkstation.test",
    "APPLE_OAUTH_TEAM_ID": "TEAM123456",
    "APPLE_OAUTH_KEY_ID": "KEY123456",
    "APPLE_OAUTH_PRIVATE_KEY": TEST_APPLE_PRIVATE_KEY_PEM,
    "FRONTEND_BASE_URL": "http://localhost:5173",
}


def create_owner(email="owner@example.com", *, password="secure-password", verified=True):
    user = User.objects.create_user(email=email, password=password)
    if verified:
        user.mark_email_verified()
    organization = Organization.objects.create_with_owner(owner=user)
    return user, organization


def apple_claims(*, sub="apple-sub-123", email="owner@example.com", email_verified=True, nonce=""):
    return {
        "sub": sub,
        "email": email,
        "email_verified": email_verified,
        "iss": "https://appleid.apple.com",
        "aud": APPLE_TEST_SETTINGS["APPLE_OAUTH_CLIENT_ID"],
        "nonce": nonce,
        "exp": int(timezone.now().timestamp()) + 3600,
    }


def result_code_from_redirect(url: str) -> str:
    query = parse_qs(urlparse(url).query)
    if "result" in query:
        return query["result"][0]
    return query["code"][0]


@override_settings(**APPLE_TEST_SETTINGS)
class AppleOAuthStartViewTests(TestCase):
    def test_start_without_configuration_returns_503(self):
        with override_settings(APPLE_OAUTH_PRIVATE_KEY=""):
            response = self.client.get("/api/auth/apple/start/?intent=login")
        self.assertEqual(response.status_code, 503)

    def test_register_start_requires_legal_acknowledgement(self):
        response = self.client.get("/api/auth/apple/start/?intent=register")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["code"],
            AppleOAuthResultCode.LEGAL_ACKNOWLEDGEMENT_REQUIRED,
        )

    def test_register_start_with_legal_acknowledgement_redirects_to_apple(self):
        response = self.client.get(
            "/api/auth/apple/start/?intent=register&legal_acknowledgement=true"
        )
        self.assertEqual(response.status_code, 302)
        self.assertIn("appleid.apple.com", response["Location"])
        self.assertIn("response_mode=form_post", response["Location"])
        pending = load_apple_oauth_state(response.wsgi_request)
        self.assertEqual(pending.intent, "register")
        self.assertTrue(pending.legal_acknowledgement)

    def test_link_start_requires_authenticated_owner(self):
        response = self.client.get("/api/auth/apple/start/?intent=link")
        self.assertEqual(response.status_code, 401)


@override_settings(**APPLE_TEST_SETTINGS)
class AppleOAuthLoginFlowTests(TestCase):
    def setUp(self):
        self.client = Client()

    def _start_login(self):
        response = self.client.get("/api/auth/apple/start/?intent=login")
        self.assertEqual(response.status_code, 302)
        return load_apple_oauth_state(response.wsgi_request)

    def _callback(self, pending, *, sub="apple-sub-login", email="linked@example.com", post=True):
        claims = apple_claims(sub=sub, email=email, nonce=pending.nonce)
        with patch(
            "accounts.apple_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.apple_oauth.verify_apple_id_token",
            return_value=claims,
        ):
            payload = {"code": "auth-code", "state": pending.state}
            if post:
                return self.client.post("/api/auth/apple/callback/", payload)
            return self.client.get("/api/auth/apple/callback/", payload)

    def test_returning_linked_owner_logs_in_without_email(self):
        owner, organization = create_owner(email="linked@example.com")
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-sub-login",
            provider_email="old@privaterelay.appleid.com",
            provider_email_verified=True,
        )
        pending = self._start_login()
        response = self._callback(pending, email="")
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.SUCCESS,
        )
        owner.refresh_from_db()
        self.assertEqual(owner.email, "linked@example.com")
        link = OwnerAuthProviderLink.objects.get(user=owner)
        self.assertEqual(link.provider_email, "old@privaterelay.appleid.com")
        self.assertEqual(self.client.get("/api/workspace/").status_code, 200)

    def test_returning_login_updates_email_snapshot_without_changing_user_email(self):
        owner, _organization = create_owner(email="owner@example.com")
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-sub-login",
            provider_email="old@privaterelay.appleid.com",
        )
        pending = self._start_login()
        response = self._callback(
            pending,
            email="new-relay@privaterelay.appleid.com",
        )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.SUCCESS,
        )
        owner.refresh_from_db()
        self.assertEqual(owner.email, "owner@example.com")
        link = OwnerAuthProviderLink.objects.get(user=owner)
        self.assertEqual(link.provider_email, "new-relay@privaterelay.appleid.com")

    def test_apple_login_with_owner_2fa_reaches_two_factor_required(self):
        owner, _organization = create_owner(email="2fa@example.com")
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-sub-2fa",
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

        pending = self._start_login()
        with patch(
            "accounts.apple_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.apple_oauth.verify_apple_id_token",
            return_value=apple_claims(sub="apple-sub-2fa", email="", nonce=pending.nonce),
        ):
            response = self.client.post(
                "/api/auth/apple/callback/",
                {"code": "auth-code", "state": pending.state},
            )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.TWO_FACTOR_REQUIRED,
        )
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

    def test_unknown_apple_sub_with_existing_email_collides(self):
        create_owner(email="owner@example.com")
        pending = self._start_login()
        response = self._callback(
            pending,
            sub="brand-new-apple-sub",
            email="owner@example.com",
        )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
        )
        self.assertEqual(User.objects.filter(email="owner@example.com").count(), 1)


@override_settings(**APPLE_TEST_SETTINGS)
class AppleOAuthRegisterFlowTests(TestCase):
    def setUp(self):
        self.client = Client()

    def _start_register(self):
        response = self.client.get(
            "/api/auth/apple/start/?intent=register&legal_acknowledgement=true"
        )
        self.assertEqual(response.status_code, 302)
        return load_apple_oauth_state(response.wsgi_request)

    def _callback(self, pending, *, sub="apple-sub-register", email="newowner@example.com", verified=True):
        claims = apple_claims(
            sub=sub,
            email=email,
            email_verified=verified,
            nonce=pending.nonce,
        )
        with patch(
            "accounts.apple_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.apple_oauth.verify_apple_id_token",
            return_value=claims,
        ):
            return self.client.post(
                "/api/auth/apple/callback/",
                {"code": "auth-code", "state": pending.state},
            )

    def test_new_apple_identity_registers_owner_with_private_relay_email(self):
        pending = self._start_register()
        response = self._callback(
            pending,
            email="abc123@privaterelay.appleid.com",
        )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.SUCCESS,
        )
        user = User.objects.get(email="abc123@privaterelay.appleid.com")
        self.assertFalse(user.has_usable_password())
        self.assertTrue(user.email_verified)
        self.assertEqual(Organization.objects.filter(owner=user).count(), 1)
        self.assertEqual(WorkspaceBuiltinTrial.objects.count(), 1)

    def test_missing_email_on_new_registration_rejected(self):
        pending = self._start_register()
        response = self._callback(pending, email="")
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.EMAIL_MISSING,
        )
        self.assertEqual(User.objects.count(), 0)

    def test_legal_acknowledgement_cannot_be_bypassed(self):
        pending = self._start_register()
        session = self.client.session
        raw = session[OWNER_APPLE_OAUTH_SESSION_KEY]
        raw["legal_acknowledgement"] = False
        session[OWNER_APPLE_OAUTH_SESSION_KEY] = raw
        session.save()
        response = self._callback(pending)
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.LEGAL_ACKNOWLEDGEMENT_REQUIRED,
        )

    def test_register_collision_with_existing_checkstation_email(self):
        create_owner(email="existing@example.com")
        pending = self._start_register()
        response = self._callback(pending, sub="new-sub", email="existing@example.com")
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
        )

    def test_verified_apple_register_claims_unverified_password_signup(self):
        attacker = User.objects.create_user(
            email="victim@example.com",
            password="attacker-password-12",
            email_verified=False,
        )
        pending = self._start_register()
        response = self._callback(
            pending,
            sub="victim-apple-sub",
            email="victim@example.com",
            verified=True,
        )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.SUCCESS,
        )
        self.assertEqual(User.objects.filter(email="victim@example.com").count(), 1)
        owner = User.objects.get(email="victim@example.com")
        self.assertEqual(owner.pk, attacker.pk)
        self.assertTrue(owner.email_verified)
        self.assertFalse(owner.has_usable_password())
        self.assertFalse(owner.check_password("attacker-password-12"))
        self.assertEqual(Organization.objects.filter(owner=owner).count(), 1)
        self.assertEqual(
            OwnerAuthProviderLink.objects.filter(
                user=owner,
                provider=OwnerAuthProvider.APPLE,
                provider_subject="victim-apple-sub",
            ).count(),
            1,
        )
        login_response = APIClient().post(
            "/api/auth/login/",
            {"email": "victim@example.com", "password": "attacker-password-12"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 401)

    def test_login_with_provisional_unverified_email_returns_no_account(self):
        User.objects.create_user(
            email="pending-only@example.com",
            password="attacker-password-12",
            email_verified=False,
        )
        response = self.client.get("/api/auth/apple/start/?intent=login")
        pending = load_apple_oauth_state(response.wsgi_request)
        claims = apple_claims(
            sub="pending-apple-sub",
            email="pending-only@example.com",
            email_verified=True,
            nonce=pending.nonce,
        )
        with patch(
            "accounts.apple_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.apple_oauth.verify_apple_id_token",
            return_value=claims,
        ):
            callback = self.client.post(
                "/api/auth/apple/callback/",
                {"code": "auth-code", "state": pending.state},
            )
        self.assertEqual(
            result_code_from_redirect(callback["Location"]),
            AppleOAuthResultCode.NO_ACCOUNT,
        )


@override_settings(**APPLE_TEST_SETTINGS)
class AppleOAuthSecurityTests(TestCase):
    def setUp(self):
        self.client = Client()

    def _start_login(self):
        response = self.client.get("/api/auth/apple/start/?intent=login")
        return load_apple_oauth_state(response.wsgi_request)

    def test_reused_state_rejected(self):
        pending = self._start_login()
        claims = apple_claims(sub="apple-sub-reuse", email="reuse@example.com", nonce=pending.nonce)
        with patch(
            "accounts.apple_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.apple_oauth.verify_apple_id_token",
            return_value=claims,
        ):
            first = self.client.post(
                "/api/auth/apple/callback/",
                {"code": "auth-code", "state": pending.state},
            )
            second = self.client.post(
                "/api/auth/apple/callback/",
                {"code": "auth-code", "state": pending.state},
            )
        self.assertEqual(first.status_code, 302)
        self.assertEqual(
            result_code_from_redirect(second["Location"]),
            AppleOAuthResultCode.INVALID_STATE,
        )

    def test_invalid_nonce_rejected(self):
        pending = self._start_login()
        with patch(
            "accounts.apple_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.apple_oauth.verify_apple_id_token",
            side_effect=__import__(
                "accounts.apple_oauth_client", fromlist=["AppleOAuthClientError"]
            ).AppleOAuthClientError("invalid_nonce"),
        ):
            response = self.client.post(
                "/api/auth/apple/callback/",
                {"code": "auth-code", "state": pending.state},
            )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.AUTHENTICATION_FAILED,
        )

    def test_expired_id_token_rejected(self):
        pending = self._start_login()
        with patch(
            "accounts.apple_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.apple_oauth.verify_apple_id_token",
            side_effect=__import__(
                "accounts.apple_oauth_client", fromlist=["AppleOAuthClientError"]
            ).AppleOAuthClientError("expired_id_token"),
        ):
            response = self.client.post(
                "/api/auth/apple/callback/",
                {"code": "auth-code", "state": pending.state},
            )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.AUTHENTICATION_FAILED,
        )

    def test_login_intent_cannot_complete_as_link(self):
        owner, _organization = create_owner(email="linker@example.com")
        pending = self._start_login()
        session = self.client.session
        raw = session[OWNER_APPLE_OAUTH_SESSION_KEY]
        raw["intent"] = "link"
        raw["owner_user_id"] = owner.pk
        session[OWNER_APPLE_OAUTH_SESSION_KEY] = raw
        session.save()
        claims = apple_claims(sub="apple-sub-link", email="linker@example.com", nonce=pending.nonce)
        with patch(
            "accounts.apple_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.apple_oauth.verify_apple_id_token",
            return_value=claims,
        ):
            response = self.client.post(
                "/api/auth/apple/callback/",
                {"code": "auth-code", "state": pending.state},
            )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.AUTHENTICATION_REQUIRED,
        )


@override_settings(**APPLE_TEST_SETTINGS)
class AppleOAuthLinkFlowTests(TestCase):
    def setUp(self):
        self.owner, _organization = create_owner(email="link-owner@example.com")
        self.client = Client()
        self.client.force_login(self.owner)

    def _start_link(self):
        response = self.client.get("/api/auth/apple/start/?intent=link")
        self.assertEqual(response.status_code, 302)
        return load_apple_oauth_state(response.wsgi_request)

    def _callback(self, pending, *, sub="apple-sub-link-owner", email="link-owner@example.com"):
        claims = apple_claims(sub=sub, email=email, nonce=pending.nonce)
        with patch(
            "accounts.apple_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.apple_oauth.verify_apple_id_token",
            return_value=claims,
        ):
            return self.client.post(
                "/api/auth/apple/callback/",
                {"code": "auth-code", "state": pending.state},
            )

    def test_authenticated_owner_can_link_apple(self):
        pending = self._start_link()
        response = self._callback(pending)
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.LINKED,
        )
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.email, "link-owner@example.com")
        self.assertTrue(self.owner.has_usable_password())

    def test_same_apple_link_is_idempotent(self):
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-sub-link-owner",
            provider_email="old@privaterelay.appleid.com",
        )
        pending = self._start_link()
        response = self._callback(pending, email="updated@privaterelay.appleid.com")
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.ALREADY_LINKED,
        )

    def test_apple_sub_already_linked_to_another_owner_rejected(self):
        other, _org = create_owner(email="other@example.com")
        OwnerAuthProviderLink.objects.create(
            user=other,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-sub-taken",
        )
        pending = self._start_link()
        response = self._callback(pending, sub="apple-sub-taken")
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.APPLE_ALREADY_LINKED,
        )

    def test_different_apple_link_not_replaced(self):
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-sub-existing",
        )
        pending = self._start_link()
        response = self._callback(pending, sub="apple-sub-new")
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            AppleOAuthResultCode.DIFFERENT_APPLE_LINKED,
        )


@override_settings(**APPLE_TEST_SETTINGS)
class AppleOAuthClientSecretTests(TestCase):
    def test_generate_apple_client_secret_is_es256_jwt(self):
        import jwt

        from accounts.apple_oauth_client import generate_apple_client_secret

        token = generate_apple_client_secret()
        header = jwt.get_unverified_header(token)
        self.assertEqual(header["alg"], "ES256")
        self.assertEqual(header["kid"], APPLE_TEST_SETTINGS["APPLE_OAUTH_KEY_ID"])
        claims = jwt.decode(token, options={"verify_signature": False})
        self.assertEqual(claims["iss"], APPLE_TEST_SETTINGS["APPLE_OAUTH_TEAM_ID"])
        self.assertEqual(claims["sub"], APPLE_TEST_SETTINGS["APPLE_OAUTH_CLIENT_ID"])
        self.assertEqual(claims["aud"], "https://appleid.apple.com")

    def test_private_key_supports_escaped_newlines(self):
        import jwt

        from accounts.apple_oauth_client import generate_apple_client_secret

        escaped = TEST_APPLE_PRIVATE_KEY_PEM.replace("\n", "\\n")
        with override_settings(APPLE_OAUTH_PRIVATE_KEY=escaped):
            token = generate_apple_client_secret()
            claims = jwt.decode(token, options={"verify_signature": False})
            self.assertEqual(claims["sub"], APPLE_TEST_SETTINGS["APPLE_OAUTH_CLIENT_ID"])
