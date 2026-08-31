"""Google OAuth tests for owner sign-in (mocked; no real Google network calls)."""

from __future__ import annotations

from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import pyotp
from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.customer_two_factor_models import OwnerTOTPDevice
from accounts.google_oauth import GoogleOAuthResultCode
from accounts.google_oauth_state import OWNER_GOOGLE_OAUTH_SESSION_KEY, load_google_oauth_state
from accounts.owner_auth_provider_models import OwnerAuthProvider, OwnerAuthProviderLink
from accounts.two_factor import TOTP_INTERVAL, decrypt_totp_secret
from billing.models import WorkspaceBuiltinTrial
from organizations.models import Organization

User = get_user_model()

GOOGLE_TEST_SETTINGS = {
    "GOOGLE_OAUTH_CLIENT_ID": "test-google-client-id",
    "GOOGLE_OAUTH_CLIENT_SECRET": "test-google-client-secret",
    "FRONTEND_BASE_URL": "http://localhost:5173",
}


def create_owner(email="owner@gmail.com", *, password="secure-password", verified=True):
    user = User.objects.create_user(email=email, password=password)
    if verified:
        user.mark_email_verified()
    organization = Organization.objects.create_with_owner(owner=user)
    return user, organization


def google_claims(*, sub="google-sub-123", email="owner@gmail.com", email_verified=True, nonce=""):
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


@override_settings(**GOOGLE_TEST_SETTINGS)
class GoogleOAuthStartViewTests(TestCase):
    def test_start_without_configuration_returns_503(self):
        with override_settings(GOOGLE_OAUTH_CLIENT_ID="", GOOGLE_OAUTH_CLIENT_SECRET=""):
            response = self.client.get("/api/auth/google/start/?intent=login")
        self.assertEqual(response.status_code, 503)

    def test_register_start_requires_legal_acknowledgement(self):
        response = self.client.get("/api/auth/google/start/?intent=register")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["code"],
            GoogleOAuthResultCode.LEGAL_ACKNOWLEDGEMENT_REQUIRED,
        )

    def test_register_start_with_legal_acknowledgement_redirects_to_google(self):
        response = self.client.get(
            "/api/auth/google/start/?intent=register&legal_acknowledgement=true"
        )
        self.assertEqual(response.status_code, 302)
        self.assertIn("accounts.google.com", response["Location"])
        pending = load_google_oauth_state(response.wsgi_request)
        self.assertEqual(pending.intent, "register")
        self.assertTrue(pending.legal_acknowledgement)

    def test_link_start_requires_authenticated_owner(self):
        response = self.client.get("/api/auth/google/start/?intent=link")
        self.assertEqual(response.status_code, 401)

    def test_link_start_binds_owner_user_id(self):
        owner, _organization = create_owner()
        client = APIClient()
        client.force_authenticate(owner)
        session_client = Client()
        session_client.force_login(owner)
        response = session_client.get("/api/auth/google/start/?intent=link")
        self.assertEqual(response.status_code, 302)
        pending = load_google_oauth_state(response.wsgi_request)
        self.assertEqual(pending.intent, "link")
        self.assertEqual(pending.owner_user_id, owner.pk)


@override_settings(**GOOGLE_TEST_SETTINGS)
class GoogleOAuthLoginFlowTests(TestCase):
    def setUp(self):
        self.client = Client()

    def _start_login(self):
        response = self.client.get("/api/auth/google/start/?intent=login")
        self.assertEqual(response.status_code, 302)
        pending = load_google_oauth_state(response.wsgi_request)
        return pending

    def _callback(self, pending, *, sub="google-sub-login", email="linked@gmail.com"):
        claims = google_claims(sub=sub, email=email, nonce=pending.nonce)
        with patch(
            "accounts.google_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.google_oauth.verify_google_id_token",
            return_value=claims,
        ):
            return self.client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending.state},
            )

    def test_returning_linked_owner_logs_in_without_2fa(self):
        owner, organization = create_owner(email="linked@gmail.com")
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-login",
            provider_email="old@gmail.com",
            provider_email_verified=False,
        )
        pending = self._start_login()
        response = self._callback(pending, email="new-snapshot@gmail.com")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.SUCCESS,
        )
        owner.refresh_from_db()
        self.assertEqual(owner.email, "linked@gmail.com")
        link = OwnerAuthProviderLink.objects.get(user=owner)
        self.assertEqual(link.provider_email, "new-snapshot@gmail.com")
        self.assertTrue(link.provider_email_verified)
        workspace = self.client.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.assertEqual(workspace.json()["workspace_id"], organization.workspace_id)

    def test_google_login_with_owner_2fa_reaches_two_factor_required(self):
        owner, _organization = create_owner(email="2fa@gmail.com")
        OwnerAuthProviderLink.objects.create(
            user=owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-2fa",
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
            "accounts.google_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.google_oauth.verify_google_id_token",
            return_value=google_claims(sub="google-sub-2fa", email="2fa@gmail.com", nonce=pending.nonce),
        ):
            response = self.client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending.state},
            )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.TWO_FACTOR_REQUIRED,
        )
        self.assertNotEqual(self.client.get("/api/workspace/").status_code, 200)

        device = OwnerTOTPDevice.objects.get(user=owner)
        totp_secret = decrypt_totp_secret(device.secret_encrypted)
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
        self.assertEqual(challenge.json()["account_kind"], "owner")

    def test_unknown_google_sub_with_existing_email_collides(self):
        create_owner(email="john@gmail.com")
        pending = self._start_login()
        response = self._callback(
            pending,
            sub="brand-new-google-sub",
            email="john@gmail.com",
        )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
        )
        self.assertEqual(User.objects.filter(email="john@gmail.com").count(), 1)
        self.assertFalse(
            OwnerAuthProviderLink.objects.filter(provider_subject="brand-new-google-sub").exists()
        )

    def test_unknown_google_sub_without_account_returns_no_account(self):
        pending = self._start_login()
        response = self._callback(
            pending,
            sub="orphan-google-sub",
            email="orphan@gmail.com",
        )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.NO_ACCOUNT,
        )


@override_settings(**GOOGLE_TEST_SETTINGS)
class GoogleOAuthRegisterFlowTests(TestCase):
    def setUp(self):
        self.client = Client()

    def _start_register(self):
        response = self.client.get(
            "/api/auth/google/start/?intent=register&legal_acknowledgement=true"
        )
        self.assertEqual(response.status_code, 302)
        return load_google_oauth_state(response.wsgi_request)

    def _callback(self, pending, *, sub="google-sub-register", email="newowner@gmail.com", verified=True):
        claims = google_claims(
            sub=sub,
            email=email,
            email_verified=verified,
            nonce=pending.nonce,
        )
        with patch(
            "accounts.google_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.google_oauth.verify_google_id_token",
            return_value=claims,
        ):
            return self.client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending.state},
            )

    def test_new_verified_google_identity_registers_owner(self):
        pending = self._start_register()
        response = self._callback(pending)
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.SUCCESS,
        )
        user = User.objects.get(email="newowner@gmail.com")
        self.assertTrue(user.email_verified)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(Organization.objects.filter(owner=user).count(), 1)
        self.assertEqual(
            OwnerAuthProviderLink.objects.filter(
                user=user,
                provider=OwnerAuthProvider.GOOGLE,
                provider_subject="google-sub-register",
            ).count(),
            1,
        )
        self.assertEqual(WorkspaceBuiltinTrial.objects.count(), 1)
        self.assertEqual(self.client.get("/api/workspace/").status_code, 200)

    def test_register_without_legal_acknowledgement_in_state_is_rejected(self):
        pending = self._start_register()
        session = self.client.session
        raw = session[OWNER_GOOGLE_OAUTH_SESSION_KEY]
        raw["legal_acknowledgement"] = False
        session[OWNER_GOOGLE_OAUTH_SESSION_KEY] = raw
        session.save()
        response = self._callback(pending)
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.LEGAL_ACKNOWLEDGEMENT_REQUIRED,
        )

    def test_unverified_google_email_cannot_register(self):
        pending = self._start_register()
        response = self._callback(pending, email="unverified@gmail.com", verified=False)
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.EMAIL_NOT_VERIFIED,
        )
        self.assertFalse(User.objects.filter(email="unverified@gmail.com").exists())

    def test_missing_google_email_cannot_register(self):
        pending = self._start_register()
        response = self._callback(pending, email="", verified=True)
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.EMAIL_MISSING,
        )

    def test_register_collision_with_existing_checkstation_email(self):
        create_owner(email="existing@gmail.com")
        pending = self._start_register()
        response = self._callback(pending, sub="new-sub", email="existing@gmail.com")
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
        )
        self.assertEqual(User.objects.filter(email="existing@gmail.com").count(), 1)


@override_settings(**GOOGLE_TEST_SETTINGS)
class GoogleOAuthSecurityTests(TestCase):
    def setUp(self):
        self.client = Client()

    def _start_login(self):
        response = self.client.get("/api/auth/google/start/?intent=login")
        pending = load_google_oauth_state(response.wsgi_request)
        return pending

    def test_invalid_state_rejected(self):
        with patch(
            "accounts.google_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.google_oauth.verify_google_id_token",
            return_value=google_claims(nonce="n"),
        ):
            response = self.client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": "wrong-state"},
            )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.INVALID_STATE,
        )

    def test_reused_state_rejected(self):
        pending = self._start_login()
        claims = google_claims(sub="google-sub-reuse", email="reuse@gmail.com", nonce=pending.nonce)
        with patch(
            "accounts.google_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.google_oauth.verify_google_id_token",
            return_value=claims,
        ):
            first = self.client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending.state},
            )
            second = self.client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending.state},
            )
        self.assertEqual(first.status_code, 302)
        self.assertEqual(
            result_code_from_redirect(second["Location"]),
            GoogleOAuthResultCode.INVALID_STATE,
        )

    @override_settings(GOOGLE_OAUTH_STATE_TTL_SECONDS=0)
    def test_expired_state_rejected(self):
        pending = self._start_login()
        with patch(
            "accounts.google_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.google_oauth.verify_google_id_token",
            return_value=google_claims(nonce=pending.nonce),
        ):
            response = self.client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending.state},
            )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.INVALID_STATE,
        )

    def test_invalid_issuer_rejected(self):
        pending = self._start_login()
        bad_claims = google_claims(nonce=pending.nonce)
        bad_claims["iss"] = "evil.example"
        with patch(
            "accounts.google_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.google_oauth.verify_google_id_token",
            side_effect=__import__(
                "accounts.google_oauth_client", fromlist=["GoogleOAuthClientError"]
            ).GoogleOAuthClientError("invalid_issuer"),
        ):
            response = self.client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending.state},
            )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.AUTHENTICATION_FAILED,
        )

    def test_invalid_nonce_rejected(self):
        pending = self._start_login()
        with patch(
            "accounts.google_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.google_oauth.verify_google_id_token",
            side_effect=__import__(
                "accounts.google_oauth_client", fromlist=["GoogleOAuthClientError"]
            ).GoogleOAuthClientError("invalid_nonce"),
        ):
            response = self.client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending.state},
            )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.AUTHENTICATION_FAILED,
        )

    def test_login_state_cannot_complete_link_flow(self):
        owner, _organization = create_owner(email="linker@gmail.com")
        pending = self._start_login()
        claims = google_claims(sub="google-sub-link", email="linker@gmail.com", nonce=pending.nonce)
        session = self.client.session
        raw = session[OWNER_GOOGLE_OAUTH_SESSION_KEY]
        raw["intent"] = "link"
        raw["owner_user_id"] = owner.pk
        session[OWNER_GOOGLE_OAUTH_SESSION_KEY] = raw
        session.save()
        with patch(
            "accounts.google_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.google_oauth.verify_google_id_token",
            return_value=claims,
        ):
            response = self.client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending.state},
            )
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.AUTHENTICATION_REQUIRED,
        )


@override_settings(**GOOGLE_TEST_SETTINGS)
class GoogleOAuthLinkFlowTests(TestCase):
    def setUp(self):
        self.owner, _organization = create_owner(email="link-owner@gmail.com")
        self.client = Client()
        self.client.force_login(self.owner)

    def _start_link(self):
        response = self.client.get("/api/auth/google/start/?intent=link")
        self.assertEqual(response.status_code, 302)
        return load_google_oauth_state(response.wsgi_request)

    def _callback(self, pending, *, sub="google-sub-link-owner", email="link-owner@gmail.com"):
        claims = google_claims(sub=sub, email=email, nonce=pending.nonce)
        with patch(
            "accounts.google_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.google_oauth.verify_google_id_token",
            return_value=claims,
        ):
            return self.client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending.state},
            )

    def test_authenticated_owner_can_link_new_google_identity(self):
        pending = self._start_link()
        response = self._callback(pending)
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.LINKED,
        )
        link = OwnerAuthProviderLink.objects.get(user=self.owner)
        self.assertEqual(link.provider_subject, "google-sub-link-owner")
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.email, "link-owner@gmail.com")
        self.assertTrue(self.owner.has_usable_password())

    def test_same_link_callback_is_idempotent(self):
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-link-owner",
            provider_email="old@gmail.com",
        )
        pending = self._start_link()
        response = self._callback(pending, email="updated@gmail.com")
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.ALREADY_LINKED,
        )
        link = OwnerAuthProviderLink.objects.get(user=self.owner)
        self.assertEqual(link.provider_email, "updated@gmail.com")

    def test_google_identity_already_linked_to_another_owner_rejected(self):
        other, _org = create_owner(email="other@gmail.com")
        OwnerAuthProviderLink.objects.create(
            user=other,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-taken",
        )
        pending = self._start_link()
        response = self._callback(pending, sub="google-sub-taken", email="taken@gmail.com")
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.GOOGLE_ALREADY_LINKED,
        )
        self.assertFalse(OwnerAuthProviderLink.objects.filter(user=self.owner).exists())

    def test_owner_with_different_google_link_not_silently_replaced(self):
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-existing",
        )
        pending = self._start_link()
        response = self._callback(pending, sub="google-sub-new", email="new@gmail.com")
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.DIFFERENT_GOOGLE_LINKED,
        )
        self.assertEqual(
            OwnerAuthProviderLink.objects.get(user=self.owner).provider_subject,
            "google-sub-existing",
        )

    def test_logged_out_owner_cannot_complete_link_callback(self):
        pending = self._start_link()
        self.client.logout()
        response = self._callback(pending)
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.INVALID_STATE,
        )

    def test_existing_google_sub_cannot_be_associated_with_second_owner(self):
        pending = self._start_link()
        response = self._callback(pending, sub="google-sub-unique", email="unique@gmail.com")
        self.assertEqual(
            result_code_from_redirect(response["Location"]),
            GoogleOAuthResultCode.LINKED,
        )

        other, _org = create_owner(email="second@gmail.com")
        client = Client()
        client.force_login(other)
        start = client.get("/api/auth/google/start/?intent=link")
        pending2 = load_google_oauth_state(start.wsgi_request)
        claims = google_claims(sub="google-sub-unique", email="unique@gmail.com", nonce=pending2.nonce)
        with patch(
            "accounts.google_oauth.exchange_authorization_code",
            return_value={"id_token": "fake-id-token"},
        ), patch(
            "accounts.google_oauth.verify_google_id_token",
            return_value=claims,
        ):
            second = client.get(
                "/api/auth/google/callback/",
                {"code": "auth-code", "state": pending2.state},
            )
        self.assertEqual(
            result_code_from_redirect(second["Location"]),
            GoogleOAuthResultCode.GOOGLE_ALREADY_LINKED,
        )
