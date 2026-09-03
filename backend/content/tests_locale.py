from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from content.models import Document, DocumentType, FaqCategory, FaqEntry, NavGroup, PublicationStatus
from content.seed import seed_documents, seed_faq_entries


class ContentLocaleApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        seed_documents(languages=("en", "ja"))
        seed_faq_entries(languages=("en", "ja"))

    def test_japanese_document_list(self):
        response = self.client.get(reverse("content-document-list"), {"lang": "ja"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["language"], "ja")
        titles = {item["slug"]: item["title"] for item in response.data["documents"]}
        self.assertEqual(titles.get("getting-started"), "CheckStation をはじめる")
        self.assertEqual(titles.get("privacy-policy"), "プライバシーポリシー")

    def test_japanese_document_detail(self):
        response = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "getting-started"}),
            {"lang": "ja"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["language"], "ja")
        self.assertIn("/ja/getting-started", response.data["canonical_url"])
        self.assertEqual(len(response.data["alternate_urls"]), 2)

    def test_invalid_locale_falls_back_to_english(self):
        response = self.client.get(reverse("content-document-list"), {"lang": "fr"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["language"], "en")

    def test_japanese_faq_list(self):
        response = self.client.get(reverse("content-faq-list"), {"lang": "ja"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["language"], "ja")
        self.assertTrue(response.data["entries"])
        self.assertNotEqual(response.data["entries"][0]["question"], "")

    def test_missing_japanese_row_falls_back_to_english(self):
        Document.objects.filter(slug="support", language="ja").delete()
        response = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "support"}),
            {"lang": "ja"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["language"], "en")
        self.assertTrue(response.data.get("fallback"))

    def test_price_tokens_still_apply_in_japanese_billing_doc(self):
        response = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "billing-plans"}),
            {"lang": "ja"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.data["body_markdown"]
        self.assertIn("$", body)

    def test_locale_validation_on_create(self):
        doc = Document(
            slug="locale-test",
            language="ja",
            title="テスト",
            body_markdown="# test",
            status=PublicationStatus.PUBLISHED,
            is_public=True,
        )
        doc.save()
        self.assertEqual(doc.language, "ja")

        entry = FaqEntry(
            slug="locale-faq-test",
            language="ja",
            question="テスト?",
            answer_markdown="回答",
            category=FaqCategory.GENERAL,
            status=PublicationStatus.PUBLISHED,
            is_public=True,
        )
        entry.save()
        self.assertEqual(entry.language, "ja")
