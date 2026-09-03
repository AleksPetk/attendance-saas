"""Owner preferred_language API and model defaults."""

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.language import DEFAULT_LANGUAGE, normalize_language
from organizations.models import Organization

User = get_user_model()


class NormalizeLanguageTests(TestCase):
    def test_canonical_values(self):
        self.assertEqual(normalize_language("en"), "en")
        self.assertEqual(normalize_language("ja"), "ja")

    def test_variants(self):
        self.assertEqual(normalize_language("en-US"), "en")
        self.assertEqual(normalize_language("en-GB"), "en")
        self.assertEqual(normalize_language("ja-JP"), "ja")

    def test_unknown_falls_back_to_english(self):
        self.assertEqual(normalize_language("fr"), "en")
        self.assertEqual(normalize_language(""), DEFAULT_LANGUAGE)


@override_settings(
    AUTHENTICATION_BACKENDS=["django.contrib.auth.backends.ModelBackend"],
)
class PreferredLanguageApiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner@example.com",
            password="test-password-32-chars-minimum!!",
            email_verified=True,
        )
        self.owner.mark_email_verified()
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.client = APIClient()
        self.client.force_login(self.owner)

    def test_user_defaults_to_english(self):
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.preferred_language, "en")

    def test_account_get_includes_preferred_language(self):
        response = self.client.get("/api/auth/account/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["preferred_language"], "en")

    def test_workspace_get_includes_preferred_language_for_owner(self):
        response = self.client.get("/api/workspace/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["preferred_language"], "en")

    def test_patch_accepts_english(self):
        response = self.client.patch(
            "/api/auth/account/",
            {"preferred_language": "en"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["preferred_language"], "en")
        self.assertEqual(response.data["code"], "preferred_language_updated")

    def test_patch_accepts_japanese(self):
        response = self.client.patch(
            "/api/auth/account/",
            {"preferred_language": "ja"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["preferred_language"], "ja")
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.preferred_language, "ja")

    def test_patch_rejects_invalid_value(self):
        response = self.client.patch(
            "/api/auth/account/",
            {"preferred_language": "fr"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "invalid_preferred_language")
        self.assertIn("preferred_language", response.data)

    def test_patch_does_not_change_billing_fields(self):
        self.organization.plan = "plus"
        self.organization.save(update_fields=["plan"])
        response = self.client.patch(
            "/api/auth/account/",
            {"preferred_language": "ja"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.organization.refresh_from_db()
        self.assertEqual(self.organization.plan, "plus")

    def test_account_still_includes_sign_in_methods(self):
        response = self.client.get("/api/auth/account/")
        self.assertIn("sign_in_methods", response.data)
        self.assertIn("email", response.data)
