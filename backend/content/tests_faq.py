from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from attendance.kiosk_lock import SESSION_KIOSK_GROUP_ID, SESSION_KIOSK_LOCKED
from billing.catalog import PAYMENT_GRACE_DAYS, format_usd_cents, price_cents
from content.faq_search import filter_faq_entries, tokenize_query
from content.faq_seed import FAQ_ENTRIES
from content.models import FaqCategory, FaqEntry, PublicationStatus
from content.placeholders import apply_placeholders
from content.seed import seed_documents, seed_faq_entries
from organizations.entitlements.catalog import get_plan_definition


class PublicFaqApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        seed_documents()
        seed_faq_entries()

    def test_seeded_faq_count_and_categories(self):
        self.assertGreaterEqual(len(FAQ_ENTRIES), 50)
        self.assertLessEqual(len(FAQ_ENTRIES), 100)
        slugs = [item["slug"] for item in FAQ_ENTRIES]
        self.assertEqual(len(slugs), len(set(slugs)))
        categories = {item["category"] for item in FAQ_ENTRIES}
        self.assertIn(FaqCategory.GETTING_STARTED, categories)
        self.assertIn(FaqCategory.MEMBERS_GROUPS, categories)
        self.assertIn(FaqCategory.KIOSK, categories)
        self.assertIn(FaqCategory.PLANS, categories)
        self.assertIn(FaqCategory.SUBSCRIPTION_CHANGES, categories)
        self.assertNotIn("mobile_desktop", categories)

    def test_list_returns_published_entries_only(self):
        FaqEntry.objects.create(
            slug="secret-draft-faq",
            question="Internal only?",
            answer_markdown="draft answer",
            category=FaqCategory.GENERAL,
            keywords="secret",
            status=PublicationStatus.DRAFT,
            is_public=True,
            admin_notes="do not ship this FAQ",
        )
        FaqEntry.objects.create(
            slug="private-faq",
            question="Hidden?",
            answer_markdown="nope",
            status=PublicationStatus.PUBLISHED,
            is_public=False,
        )
        response = self.client.get(reverse("content-faq-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["entries"]]
        self.assertIn("what-is-a-member", ids)
        self.assertNotIn("secret-draft-faq", ids)
        self.assertNotIn("private-faq", ids)
        blob = str(response.data)
        self.assertNotIn("admin_notes", blob)
        self.assertNotIn("do not ship this FAQ", blob)
        self.assertNotIn("draft answer", blob)
        category_ids = [item["id"] for item in response.data["categories"]]
        self.assertIn("members_groups", category_ids)
        self.assertIn("kiosk", category_ids)
        self.assertTrue(all("label" in item for item in response.data["categories"]))
        sample = response.data["entries"][0]
        self.assertIn("question", sample)
        self.assertIn("answer_markdown", sample)
        self.assertIn("keywords", sample)
        self.assertIsInstance(sample["keywords"], list)
        self.assertNotIn("status", sample)
        self.assertNotIn("is_public", sample)
        self.assertNotIn("admin_notes", sample)

    def test_server_search_matches_question_answer_keywords_case_and_whitespace(self):
        question = self.client.get(reverse("content-faq-list"), {"q": "  What is a Member  "})
        self.assertEqual(question.status_code, status.HTTP_200_OK)
        q_ids = [item["id"] for item in question.data["entries"]]
        self.assertIn("what-is-a-member", q_ids)

        pin = self.client.get(reverse("content-faq-list"), {"q": "PIN"})
        pin_ids = [item["id"] for item in pin.data["entries"]]
        self.assertTrue(any("pin" in item_id or "pins" in item_id for item_id in pin_ids))
        self.assertTrue(len(pin.data["entries"]) >= 1)

        downgrade = self.client.get(reverse("content-faq-list"), {"q": "downgrade members"})
        down_ids = [item["id"] for item in downgrade.data["entries"]]
        self.assertTrue(
            any(
                item_id in down_ids
                for item_id in (
                    "what-happens-to-data-if-i-downgrade",
                    "why-is-my-group-plan-locked",
                    "are-records-deleted-when-i-downgrade",
                    "plan-locked-member-cannot-open",
                )
            )
        )

        cancel = self.client.get(reverse("content-faq-list"), {"q": "cancel subscription"})
        cancel_ids = [item["id"] for item in cancel.data["entries"]]
        self.assertIn("what-happens-when-i-cancel", cancel_ids)

        empty = self.client.get(reverse("content-faq-list"), {"q": "zzzz-no-such-faq-term"})
        self.assertEqual(empty.data["entries"], [])

    def test_category_filter(self):
        response = self.client.get(
            reverse("content-faq-list"), {"category": FaqCategory.KIOSK}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["entries"])
        self.assertTrue(all(item["category"] == "kiosk" for item in response.data["entries"]))

    def test_faq_readable_while_kiosk_locked(self):
        session = self.client.session
        session[SESSION_KIOSK_LOCKED] = True
        session[SESSION_KIOSK_GROUP_ID] = 1
        session.save()
        response = self.client.get(reverse("content-faq-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotEqual(response.json().get("code"), "kiosk_locked")

    def test_faq_answers_use_catalog_placeholders(self):
        response = self.client.get(reverse("content-faq-list"), {"q": "included in Basic"})
        body = " ".join(item["answer_markdown"] for item in response.data["entries"])
        self.assertNotIn("{{", body)
        self.assertIn(str(get_plan_definition("basic")["limits"]["members"]), body)

    def test_search_helper_ranks_question_above_answer(self):
        entries = [
            {
                "question": "Unrelated title",
                "answer_markdown": "downgrade appears only here",
                "keywords": [],
                "category_label": "General",
                "sort_order": 1,
            },
            {
                "question": "What happens if I downgrade?",
                "answer_markdown": "data remains",
                "keywords": [],
                "category_label": "Plans",
                "sort_order": 2,
            },
        ]
        ranked = filter_faq_entries(entries, "downgrade")
        self.assertEqual(ranked[0]["question"], "What happens if I downgrade?")
        self.assertEqual(tokenize_query("  Cancel   Subscription "), ["cancel", "subscription"])

    def test_seed_faq_does_not_overwrite(self):
        entry = FaqEntry.objects.get(slug="what-is-a-member")
        entry.question = "Edited by admin"
        entry.save()
        created, updated = seed_faq_entries(overwrite=False)
        self.assertEqual(created, [])
        self.assertEqual(updated, [])
        entry.refresh_from_db()
        self.assertEqual(entry.question, "Edited by admin")


class GroupsBillingDocumentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        seed_documents()
        seed_faq_entries()

    def test_groups_members_and_billing_are_published(self):
        groups = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "groups-members"})
        )
        billing = self.client.get(
            reverse("content-document-detail", kwargs={"slug": "billing-plans"})
        )
        faq = self.client.get(reverse("content-document-detail", kwargs={"slug": "faq"}))
        listing = self.client.get(reverse("content-document-list"))
        slugs = [item["slug"] for item in listing.data["documents"]]
        self.assertIn("groups-members", slugs)
        self.assertIn("billing-plans", slugs)
        self.assertIn("faq", slugs)
        self.assertIn("support", slugs)
        self.assertEqual(groups.status_code, status.HTTP_200_OK)
        self.assertEqual(billing.status_code, status.HTTP_200_OK)
        self.assertEqual(faq.status_code, status.HTTP_200_OK)
        self.assertEqual(groups.data["title"], "Groups & Members")
        self.assertEqual(groups.data["nav_group"], "using")
        self.assertIn("Member vs participant", groups.data["body_markdown"])
        self.assertIn("Visitor", groups.data["body_markdown"])
        self.assertIn("plan-locked", groups.data["body_markdown"])
        self.assertEqual(billing.data["title"], "Billing & Plans")
        self.assertNotIn("{{", billing.data["body_markdown"])
        plus_monthly = format_usd_cents(price_cents("plus", "monthly"))
        self.assertIn(plus_monthly, billing.data["body_markdown"])
        self.assertIn(f"{PAYMENT_GRACE_DAYS} days", billing.data["body_markdown"])
        self.assertIn("not currently offered", billing.data["body_markdown"])
        self.assertEqual(faq.data["nav_group"], "help")

    def test_catalog_api_matches_entitlement_and_billing_catalogs(self):
        response = self.client.get(reverse("content-catalog"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["grace_days"], PAYMENT_GRACE_DAYS)
        self.assertFalse(response.data["trial_offered"])
        basic = next(plan for plan in response.data["plans"] if plan["key"] == "basic")
        self.assertEqual(
            basic["limits"]["members"],
            get_plan_definition("basic")["limits"]["members"],
        )
        self.assertEqual(
            response.data["prices"]["plus"]["monthly"]["formatted"],
            format_usd_cents(price_cents("plus", "monthly")),
        )
        rendered = apply_placeholders("{{PLAN_BASIC_LIMIT_MEMBERS}}")
        self.assertEqual(rendered, str(basic["limits"]["members"]))
