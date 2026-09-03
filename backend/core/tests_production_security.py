"""Phase 2 production security: CORS, health probes, protected media."""

import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from members.models import Member
from organizations.models import Organization


def _create_verified_owner(email):
    user = User.objects.create_user(email=email, password="secure-password")
    user.mark_email_verified()
    return user


class ProviderHealthAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @override_settings(DEBUG=False, STATUS_PROBE_TOKEN="probe-secret-token")
    def test_email_health_requires_probe_token(self):
        response = self.client.get(reverse("health-email"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data, {"status": "forbidden"})

    @override_settings(DEBUG=False, STATUS_PROBE_TOKEN="probe-secret-token")
    def test_stripe_health_requires_probe_token(self):
        response = self.client.get(reverse("health-stripe"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(DEBUG=False, STATUS_PROBE_TOKEN="probe-secret-token")
    def test_email_health_accepts_probe_token(self):
        with patch("core.views.get_email_provider") as mock_provider:
            mock_provider.return_value.check_health.return_value = "ok"
            response = self.client.get(
                reverse("health-email"),
                HTTP_X_STATUS_PROBE_TOKEN="probe-secret-token",
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"status": "ok"})

    def test_basic_health_remains_public(self):
        response = self.client.get(reverse("health-check"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)


@override_settings(
    CORS_CREDENTIALED_ORIGINS=[
        "https://workspace.checkstation.app",
    ],
    CORS_ANONYMOUS_ORIGINS=[
        "https://checkstation.app",
        "https://docs.checkstation.app",
        "https://status.checkstation.app",
    ],
    CORS_ALLOWED_ORIGINS=[
        "https://workspace.checkstation.app",
    ],
    CORS_ALLOW_CREDENTIALS=True,
    CSRF_TRUSTED_ORIGINS=[
        "https://workspace.checkstation.app",
    ],
)
class ProductionCorsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_workspace_origin_gets_credentialed_cors(self):
        response = self.client.get(
            reverse("health-check"),
            HTTP_ORIGIN="https://workspace.checkstation.app",
        )
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "https://workspace.checkstation.app",
        )
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Credentials"),
            "true",
        )

    def test_promo_origin_gets_anonymous_cors_without_credentials(self):
        response = self.client.get(
            reverse("health-check"),
            HTTP_ORIGIN="https://checkstation.app",
        )
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "https://checkstation.app",
        )
        self.assertNotEqual(
            response.headers.get("Access-Control-Allow-Credentials"),
            "true",
        )

    def test_promo_contact_preflight_allows_post_without_credentials(self):
        response = self.client.options(
            "/api/contact/",
            HTTP_ORIGIN="https://checkstation.app",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="content-type",
        )
        self.assertEqual(response.status_code, 204)
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "https://checkstation.app",
        )
        self.assertIn("POST", response.headers.get("Access-Control-Allow-Methods", ""))
        self.assertNotEqual(
            response.headers.get("Access-Control-Allow-Credentials"),
            "true",
        )

    def test_promo_cannot_get_credentialed_cors_on_authenticated_api(self):
        """
        Marketing origin must never receive Allow-Credentials on an
        authenticated workspace response (even if a sibling cookie could be sent).
        """
        owner = _create_verified_owner("cors-owner@example.com")
        Organization.objects.create_with_owner(owner=owner)
        self.client.force_login(owner)
        response = self.client.get(
            reverse("account"),
            HTTP_ORIGIN="https://checkstation.app",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "https://checkstation.app",
        )
        self.assertNotEqual(
            response.headers.get("Access-Control-Allow-Credentials"),
            "true",
        )

    def test_docs_origin_gets_anonymous_cors_without_credentials(self):
        response = self.client.get(
            reverse("health-check"),
            HTTP_ORIGIN="https://docs.checkstation.app",
        )
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "https://docs.checkstation.app",
        )
        self.assertNotEqual(
            response.headers.get("Access-Control-Allow-Credentials"),
            "true",
        )

    def test_status_origin_gets_anonymous_cors_without_credentials(self):
        response = self.client.get(
            reverse("health-check"),
            HTTP_ORIGIN="https://status.checkstation.app",
        )
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "https://status.checkstation.app",
        )
        self.assertNotEqual(
            response.headers.get("Access-Control-Allow-Credentials"),
            "true",
        )


class ProtectedMediaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = _create_verified_owner("owner@media.test")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.member = Member.objects.create_member(
            organization=self.organization,
            name="Photo Member",
        )
        jpeg = (
            b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01"
            b"\x00\x01\x00\x00\xff\xd9"
        )
        relative = f"members/{self.organization.pk}/{self.member.pk}.jpg"
        from django.conf import settings

        dest = Path(settings.MEDIA_ROOT) / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(jpeg)
        self.member.photo.name = relative
        self.member.save(update_fields=["photo"])
        self.media_url = f"/media/{relative}"

        self.other_owner = _create_verified_owner("other@media.test")
        Organization.objects.create_with_owner(owner=self.other_owner)

    def test_anonymous_cannot_fetch_member_photo(self):
        response = self.client.get(self.media_url)
        self.assertEqual(response.status_code, 403)

    def test_owner_can_fetch_own_member_photo(self):
        self.client.force_login(self.owner)
        response = self.client.get(self.media_url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get("Content-Type", "").startswith("image/"))

    def test_other_owner_cannot_fetch_member_photo(self):
        self.client.force_login(self.other_owner)
        response = self.client.get(self.media_url)
        self.assertEqual(response.status_code, 403)


class ProductionRedisConfigTests(TestCase):
    def test_production_settings_require_redis_url(self):
        backend_dir = Path(__file__).resolve().parents[1]
        env = os.environ.copy()
        env.update(
            {
                "DJANGO_SETTINGS_MODULE": "config.settings_production",
                "DEBUG": "False",
                "SECRET_KEY": "test-secret-key-for-production-import",
                "APP_SECRETS_ENCRYPTION_KEY": "dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXk=",
                "PLATFORM_2FA_ENCRYPTION_KEY": "dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXk=",
                "STATUS_PROBE_TOKEN": "probe-token",
                "REDIS_URL": "",
                "DATABASE_URL": "sqlite:////tmp/checkstation-prod-redis-test.db",
            }
        )
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "import django; django.setup()",
            ],
            cwd=backend_dir,
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        combined = f"{result.stderr}\n{result.stdout}"
        self.assertIn("REDIS_URL", combined)
