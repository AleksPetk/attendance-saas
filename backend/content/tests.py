import importlib

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from attendance.kiosk_lock import SESSION_KIOSK_GROUP_ID, SESSION_KIOSK_LOCKED
from content.models import Document, DocumentType, NavGroup, PublicationStatus
from content.placeholders import apply_placeholders
from content.seed import seed_documents


class PublicContentApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        seed_documents()

    def test_list_returns_published_documents_only(self):
        Document.objects.create(
            slug="secret-draft",
            title="Draft",
            document_type=DocumentType.HELP,
            nav_group=NavGroup.HELP,
            description="hidden",
            body_markdown="# Draft\ninternal only",
            status=PublicationStatus.DRAFT,
            is_public=True,
            admin_notes="reviewer: do not ship",
        )
        Document.objects.create(
            slug="private-doc",
            title="Private",
            body_markdown="nope",
            status=PublicationStatus.PUBLISHED,
            is_public=False,
        )
        response = self.client.get(reverse("content-document-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        slugs = [item["slug"] for item in response.data["documents"]]
        self.assertIn("documentation", slugs)
        self.assertIn("getting-started", slugs)
        self.assertIn("kiosk-setup", slugs)
        self.assertIn("groups-members", slugs)
        self.assertIn("billing-plans", slugs)
        self.assertIn("faq", slugs)
        self.assertIn("support", slugs)
        self.assertIn("privacy-policy", slugs)
        self.assertIn("terms-of-use", slugs)
        self.assertNotIn("secret-draft", slugs)
        self.assertNotIn("private-doc", slugs)
        self.assertNotIn("admin_notes", str(response.data))
        self.assertNotIn("reviewer: do not ship", str(response.data))
        self.assertNotIn("body_markdown", str(response.data["documents"]))

    def test_privacy_and_terms_are_published_with_metadata(self):
        privacy = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "privacy-policy"})
        )
        terms = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "terms-of-use"})
        )
        self.assertEqual(privacy.status_code, status.HTTP_200_OK)
        self.assertEqual(terms.status_code, status.HTTP_200_OK)
        self.assertEqual(privacy.data["id"], "privacy-policy")
        self.assertEqual(privacy.data["slug"], "privacy-policy")
        self.assertEqual(privacy.data["title"], "Privacy Policy")
        self.assertEqual(privacy.data["version"], "1.1")
        self.assertEqual(privacy.data["effective_on"], "2026-08-26")
        self.assertTrue(privacy.data["updated_at"])
        self.assertIn("Action Record", privacy.data["body_markdown"])
        self.assertIn("Stripe", privacy.data["body_markdown"])
        self.assertIn("Resend", privacy.data["body_markdown"])
        self.assertIn("Contact form", privacy.data["body_markdown"])
        self.assertIn("contact@checkstation.app", privacy.data["body_markdown"])
        self.assertNotIn("@gmail.com", privacy.data["body_markdown"].lower())
        self.assertIn("$9.99", terms.data["body_markdown"])
        self.assertIn("three-day", terms.data["body_markdown"])
        self.assertNotIn("admin_notes", privacy.data)
        self.assertIsNone(privacy.data.get("admin_notes"))

    def test_getting_started_and_kiosk_setup_are_published(self):
        started = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "getting-started"})
        )
        kiosk = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "kiosk-setup"})
        )
        self.assertEqual(started.status_code, status.HTTP_200_OK)
        self.assertEqual(kiosk.status_code, status.HTTP_200_OK)
        self.assertEqual(started.data["id"], "getting-started")
        self.assertEqual(started.data["slug"], "getting-started")
        self.assertEqual(started.data["nav_group"], "getting_started")
        self.assertEqual(started.data["version"], "1.1")
        self.assertTrue(started.data["updated_at"])
        self.assertIn("Create account", started.data["body_markdown"])
        self.assertIn("Launch Kiosk", started.data["body_markdown"])
        self.assertIn("/kiosk-setup", started.data["body_markdown"])
        self.assertIn("/groups-members", started.data["body_markdown"])
        self.assertIn("/billing-plans", started.data["body_markdown"])
        self.assertIn("/faq", started.data["body_markdown"])
        self.assertNotIn("window.open", started.data["body_markdown"])
        self.assertEqual(kiosk.data["id"], "kiosk-setup")
        self.assertEqual(kiosk.data["slug"], "kiosk-setup")
        self.assertEqual(kiosk.data["nav_group"], "using")
        self.assertEqual(kiosk.data["title"], "Kiosk Setup")
        self.assertIn("Kiosk Builder", kiosk.data["body_markdown"])
        self.assertIn("Exit code", kiosk.data["body_markdown"])
        self.assertIn("/getting-started", kiosk.data["body_markdown"])
        self.assertNotIn("admin_notes", started.data)
        self.assertNotIn("admin_notes", kiosk.data)

    def test_unpublished_slug_is_not_found(self):
        Document.objects.filter(slug="privacy-policy").update(
            status=PublicationStatus.DRAFT
        )
        response = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "privacy-policy"})
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("Action Record", str(response.data))

    def test_stable_slug_lookup_and_cache_headers(self):
        response = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "documentation"})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("max-age=60", response["Cache-Control"])
        self.assertTrue(response.get("ETag"))
        self.assertEqual(response.data["nav_group"], "home")
        self.assertIn("Getting Started", response.data["body_markdown"])
        self.assertIn("Kiosk Setup", response.data["body_markdown"])
        self.assertIn("Groups & Members", response.data["body_markdown"])
        self.assertIn("Billing & Plans", response.data["body_markdown"])
        self.assertIn("FAQ", response.data["body_markdown"])
        self.assertIn("Support", response.data["body_markdown"])

    def test_support_hub_is_published_help_content(self):
        response = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "support"})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["nav_group"], "help")
        self.assertEqual(response.data["title"], "Support")
        self.assertIn("self-service", response.data["body_markdown"])
        self.assertNotIn("admin_notes", response.data)

    def test_script_in_markdown_is_plain_text_in_json(self):
        Document.objects.create(
            slug="xss-test",
            title="XSS test",
            description="probe",
            body_markdown="Hello <script>alert('xss')</script> **world**",
            status=PublicationStatus.PUBLISHED,
            is_public=True,
        )
        response = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "xss-test"})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("<script>alert('xss')</script>", response.data["body_markdown"])
        self.assertEqual(response["Content-Type"].split(";")[0], "application/json")

    def test_admin_notes_never_serialized(self):
        doc = Document.objects.get(slug="privacy-policy")
        doc.admin_notes = "internal counsel: pending APPI review"
        doc.save()
        response = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "privacy-policy"})
        )
        blob = str(response.data)
        self.assertNotIn("internal counsel", blob)
        self.assertNotIn("admin_notes", response.data)

    @override_settings(LEGAL_OPERATOR_NAME="Example Operator KK")
    def test_placeholders_use_configured_operator_name(self):
        rendered = apply_placeholders("Operated by {{LEGAL_OPERATOR_NAME}}.")
        self.assertEqual(rendered, "Operated by Example Operator KK.")
        self.assertNotIn("{{", rendered)

    @override_settings(LEGAL_OPERATOR_NAME="", LEGAL_GOVERNING_LAW="")
    def test_empty_legal_placeholders_are_conservative_not_invented_names(self):
        rendered = apply_placeholders("{{LEGAL_OPERATOR_NAME}} {{LEGAL_GOVERNING_LAW}}")
        self.assertNotIn("Aleks", rendered)
        self.assertNotIn("{{", rendered)
        self.assertIn("operator of the Check Station service", rendered)

    def test_seed_does_not_overwrite_existing_edits(self):
        doc = Document.objects.get(slug="privacy-policy")
        doc.body_markdown = "# Edited by admin"
        doc.save()
        created, updated = seed_documents(overwrite=False)
        self.assertEqual(created, [])
        self.assertEqual(updated, [])
        doc.refresh_from_db()
        self.assertEqual(doc.body_markdown, "# Edited by admin")

    def test_legacy_email_migration_preserves_other_admin_edits(self):
        migration = importlib.import_module(
            "content.migrations.0007_replace_legacy_checkstation_email_domains"
        )
        legacy_domain = "aleks" + "petk.com"
        doc = Document.objects.get(slug="privacy-policy")
        doc.body_markdown = (
            "Admin-edited introduction.\n\n"
            f"Contact contact@checkstation.{legacy_domain}.\n"
            f"Sent by accounts@checkstation.{legacy_domain}."
        )
        doc.admin_notes = "Keep this counsel note"
        doc.save()

        class MigrationApps:
            @staticmethod
            def get_model(app_label, model_name):
                self.assertEqual((app_label, model_name), ("content", "Document"))
                return Document

        migration.replace_legacy_email_domains(MigrationApps(), None)

        doc.refresh_from_db()
        self.assertIn("Admin-edited introduction.", doc.body_markdown)
        self.assertIn("contact@checkstation.app", doc.body_markdown)
        self.assertIn("accounts@checkstation.app", doc.body_markdown)
        self.assertNotIn(legacy_domain, doc.body_markdown)
        self.assertEqual(doc.admin_notes, "Keep this counsel note")

    @override_settings(DOCS_PUBLIC_URL="http://localhost:8091")
    def test_canonical_url_uses_docs_public_url(self):
        response = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "privacy-policy"})
        )
        self.assertEqual(
            response.data["canonical_url"],
            "http://localhost:8091/privacy-policy",
        )
        home = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "documentation"})
        )
        self.assertEqual(home.data["canonical_url"], "http://localhost:8091/")

    def test_public_content_is_readable_while_kiosk_locked(self):
        session = self.client.session
        session[SESSION_KIOSK_LOCKED] = True
        session[SESSION_KIOSK_GROUP_ID] = 1
        session.save()
        listing = self.client.get(reverse("content-document-list"))
        detail = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "privacy-policy"})
        )
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertNotEqual(listing.json().get("code"), "kiosk_locked")

    def test_public_api_needs_no_session(self):
        anonymous = APIClient()
        response = anonymous.get(reverse("content-document-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.get("Set-Cookie"))
