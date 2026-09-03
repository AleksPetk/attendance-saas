"""Phase 7 docs accuracy checks — semantic drift guards, not full paragraph asserts."""

import re
from pathlib import Path

from django.test import TestCase

from content.models import Document, PublicationStatus
from content.placeholders import apply_placeholders
from content.seed import seed_documents

SEED_DIR = Path(__file__).resolve().parent / "seed"
KNOWN_INTERNAL_SLUGS = {
    "getting-started",
    "groups-members",
    "kiosk-setup",
    "billing-plans",
    "faq",
    "support",
    "privacy-policy",
    "terms-of-use",
}


class DocsAccuracyTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        seed_documents()

    def _document_body(self, slug, language="en"):
        document = Document.objects.get(slug=slug, language=language)
        return apply_placeholders(document.body_markdown)

    def test_en_and_ja_docs_exist_for_core_slugs(self):
        for slug in sorted(KNOWN_INTERNAL_SLUGS):
            for language in ("en", "ja"):
                with self.subTest(slug=slug, language=language):
                    self.assertTrue(
                        Document.objects.filter(
                            slug=slug,
                            language=language,
                            status=PublicationStatus.PUBLISHED,
                        ).exists()
                    )

    def test_billing_docs_describe_multiple_markets_not_usd_only(self):
        for language in ("en", "ja"):
            with self.subTest(language=language):
                body = self._document_body("billing-plans", language=language)
                self.assertNotRegex(body, r"Prices are USD list prices")
                self.assertNotRegex(body, r"価格は請求カタログの USD リスト価格")
                self.assertIn("Global", body)
                self.assertIn("Japan", body if language == "en" else "Japan")

    def test_terms_describe_business_trial_not_basic_at_registration(self):
        for language in ("en", "ja"):
            with self.subTest(language=language):
                body = self._document_body("terms-of-use", language=language)
                self.assertNotIn("start on Basic", body)
                self.assertNotIn("Basic から開始", body)
                self.assertRegex(body, r"7.day Business trial|7 日間の Business トライアル")

    def test_getting_started_mentions_owner_oauth_and_sign_in_methods(self):
        for language in ("en", "ja"):
            with self.subTest(language=language):
                body = self._document_body("getting-started", language=language)
                self.assertRegex(body, r"Google")
                self.assertRegex(body, r"Apple")
                self.assertRegex(body, r"Sign-in Methods|サインイン方法")

    def test_groups_members_pin_docs_do_not_claim_pin_recovery(self):
        for language in ("en", "ja"):
            with self.subTest(language=language):
                body = self._document_body("groups-members", language=language)
                self.assertNotIn("view assigned PINs", body)
                self.assertNotIn("割り当て PIN を閲覧", body)
                self.assertRegex(body, r"does not show|表示されません|not show")

    def test_privacy_pin_section_uses_hashed_storage_wording(self):
        for language in ("en", "ja"):
            with self.subTest(language=language):
                body = self._document_body("privacy-policy", language=language)
                self.assertNotIn("stored in recoverable form", body)
                self.assertNotIn("復元可能形式で保存", body)

    def test_privacy_deletion_mentions_live_subscription_block(self):
        body = self._document_body("privacy-policy")
        self.assertIn("live paid subscription", body)
        self.assertIn("cancel Stripe billing automatically", body)

    def test_billing_docs_group_email_uses_group_smtp_not_platform_sender(self):
        for language in ("en", "ja"):
            with self.subTest(language=language):
                body = self._document_body("billing-plans", language=language)
                self.assertNotIn("platform or custom SMTP", body)
                self.assertNotIn("プラットフォームまたはカスタム SMTP", body)
                self.assertRegex(body, r"Group email sender|グループメール送信者")

    def test_seed_markdown_internal_links_resolve(self):
        link_pattern = re.compile(r"\]\(/(?P<slug>[a-z0-9-]+)(?:[#?][^)]*)?\)")
        for path in sorted(SEED_DIR.rglob("*.md")):
            text = path.read_text(encoding="utf-8")
            for match in link_pattern.finditer(text):
                slug = match.group("slug")
                with self.subTest(file=path.name, slug=slug):
                    self.assertIn(slug, KNOWN_INTERNAL_SLUGS)
