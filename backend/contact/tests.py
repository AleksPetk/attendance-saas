from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from contact.catalog import get_pair, is_privacy_request, public_categories_payload
from contact.models import ContactRequest, DeliveryStatus
from contact.suggestions import suggest_faq_entries
from contact.turnstile import TurnstileError, DUMMY_PASS_SECRET, DUMMY_PASS_SITE_KEY
from content.seed import seed_faq_entries
from core.mail import EmailSendError


@override_settings(
    TURNSTILE_SITE_KEY=DUMMY_PASS_SITE_KEY,
    TURNSTILE_SECRET_KEY=DUMMY_PASS_SECRET,
    CONTACT_TO_EMAIL="contact@checkstation.app",
    RESEND_API_KEY="re_test",
    RESEND_FROM_EMAIL="accounts@checkstation.app",
)
class ContactApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()
        seed_faq_entries()

    def _valid_payload(self, **overrides):
        payload = {
            "category": "kiosk",
            "subcategory": "cannot_launch",
            "email": "customer@example.com",
            "name": "Alex",
            "subject": "Kiosk will not start",
            "message": "The launch button stays disabled after I saved an exit code.",
            "client_type": "public_web",
            "turnstile_token": "test-token",
            "company_url": "",
        }
        payload.update(overrides)
        return payload

    def test_categories_are_public_and_allowlisted(self):
        response = self.client.get(reverse("contact-categories"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["categories"]]
        self.assertIn("kiosk", ids)
        self.assertIn("plans_billing", ids)
        self.assertIn("privacy_data", ids)
        self.assertTrue(get_pair("kiosk", "cannot_launch"))
        self.assertIsNone(get_pair("kiosk", "not-a-real-sub"))
        self.assertNotIn("gmail.com", str(response.data).lower())
        self.assertIn("turnstile_site_key", response.data)
        self.assertTrue(response.data["turnstile_required"])

    def test_public_contact_readable_while_kiosk_locked(self):
        from attendance.kiosk_lock import SESSION_KIOSK_GROUP_ID, SESSION_KIOSK_LOCKED

        session = self.client.session
        session[SESSION_KIOSK_LOCKED] = True
        session[SESSION_KIOSK_GROUP_ID] = 1
        session.save()
        response = self.client.get(reverse("contact-categories"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotEqual(response.json().get("code"), "kiosk_locked")
        self.assertIn("turnstile_site_key", response.data)

    def test_invalid_combination_rejected(self):
        with patch("contact.views.verify_turnstile_token", return_value=True):
            response = self.client.post(
                reverse("contact-submit"),
                self._valid_payload(category="kiosk", subcategory="downgrade"),
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ContactRequest.objects.count(), 0)

    def test_valid_form_creates_request_and_sends_mail(self):
        captured = {}

        def fake_send(**kwargs):
            captured.update(kwargs)
            return True

        with patch("contact.views.verify_turnstile_token", return_value=True):
            with patch("contact.operations.send_transactional_email", side_effect=fake_send):
                response = self.client.post(
                    reverse("contact-submit"),
                    self._valid_payload(),
                    format="json",
                )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["delivered"])
        row = ContactRequest.objects.get(public_ref=response.data["reference"])
        self.assertEqual(row.email, "customer@example.com")
        self.assertEqual(row.category_id, "kiosk")
        self.assertEqual(row.delivery_status, DeliveryStatus.SENT)
        self.assertEqual(captured["to_email"], "contact@checkstation.app")
        self.assertEqual(captured["reply_to"], "customer@example.com")
        self.assertIn("Kiosk will not start", captured["text_body"])
        self.assertNotIn("@gmail.com", captured["text_body"])
        self.assertTrue(row.public_ref.startswith("CS-"))

    def test_destination_gmail_is_never_in_public_payloads(self):
        payload = public_categories_payload()
        blob = str(payload) + str(self._valid_payload())
        self.assertNotIn("@gmail.com", blob.lower())

    def test_invalid_email_rejected(self):
        with patch("contact.views.verify_turnstile_token", return_value=True):
            response = self.client.post(
                reverse("contact-submit"),
                self._valid_payload(email="not-an-email"),
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ContactRequest.objects.count(), 0)

    def test_message_too_short_rejected(self):
        with patch("contact.views.verify_turnstile_token", return_value=True):
            response = self.client.post(
                reverse("contact-submit"),
                self._valid_payload(message="too short"),
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_header_injection_stripped_from_subject(self):
        captured = {}

        def fake_send(**kwargs):
            captured.update(kwargs)
            return True

        with patch("contact.views.verify_turnstile_token", return_value=True):
            with patch("contact.operations.send_transactional_email", side_effect=fake_send):
                response = self.client.post(
                    reverse("contact-submit"),
                    self._valid_payload(subject="Hello\nBcc: other@example.com extra"),
                    format="json",
                )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("\n", captured["subject"])
        self.assertNotIn("\r", ContactRequest.objects.get().subject)

    def test_html_is_escaped_in_html_body(self):
        captured = {}

        def fake_send(**kwargs):
            captured.update(kwargs)
            return True

        with patch("contact.views.verify_turnstile_token", return_value=True):
            with patch("contact.operations.send_transactional_email", side_effect=fake_send):
                self.client.post(
                    reverse("contact-submit"),
                    self._valid_payload(
                        message="<script>alert(1)</script> Please help with launch."
                    ),
                    format="json",
                )
        self.assertIn("&lt;script&gt;", captured["html_body"])
        self.assertNotIn("<script>", captured["html_body"])
        stored = ContactRequest.objects.get().message
        self.assertIn("<script>", stored)

    def test_turnstile_missing_and_invalid(self):
        with patch(
            "contact.views.verify_turnstile_token",
            side_effect=TurnstileError("turnstile_missing"),
        ):
            missing = self.client.post(
                reverse("contact-submit"),
                self._valid_payload(turnstile_token=""),
                format="json",
            )
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        with patch(
            "contact.views.verify_turnstile_token",
            side_effect=TurnstileError("turnstile_invalid"),
        ):
            invalid = self.client.post(
                reverse("contact-submit"),
                self._valid_payload(),
                format="json",
            )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ContactRequest.objects.count(), 0)
        self.assertNotIn("turnstile", str(invalid.data).lower())

    def test_honeypot_rejected_without_storing(self):
        with patch("contact.views.verify_turnstile_token", return_value=True):
            response = self.client.post(
                reverse("contact-submit"),
                self._valid_payload(company_url="https://spam.test"),
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ContactRequest.objects.count(), 0)

    def test_rate_limiting_returns_429(self):
        with patch("contact.views.verify_turnstile_token", return_value=True):
            with patch("contact.operations.send_transactional_email", return_value=True):
                for index in range(5):
                    payload = self._valid_payload(
                        subject=f"Kiosk will not start {index}",
                        message=f"The launch button stays disabled after save {index}.",
                    )
                    response = self.client.post(
                        reverse("contact-submit"), payload, format="json"
                    )
                    self.assertEqual(response.status_code, status.HTTP_200_OK)
                blocked = self.client.post(
                    reverse("contact-submit"),
                    self._valid_payload(subject="Kiosk extra message here"),
                    format="json",
                )
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_duplicate_submission_reuses_reference(self):
        with patch("contact.views.verify_turnstile_token", return_value=True):
            with patch("contact.operations.send_transactional_email", return_value=True):
                first = self.client.post(
                    reverse("contact-submit"), self._valid_payload(), format="json"
                )
                second = self.client.post(
                    reverse("contact-submit"), self._valid_payload(), format="json"
                )
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["reference"], second.data["reference"])
        self.assertTrue(second.data.get("duplicate"))
        self.assertEqual(ContactRequest.objects.count(), 1)

    def test_email_failure_still_stores_request(self):
        with patch("contact.views.verify_turnstile_token", return_value=True):
            with patch(
                "contact.operations.send_transactional_email",
                side_effect=EmailSendError("provider down"),
            ):
                response = self.client.post(
                    reverse("contact-submit"),
                    self._valid_payload(),
                    format="json",
                )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["stored"])
        self.assertFalse(response.data["delivered"])
        row = ContactRequest.objects.get()
        self.assertEqual(row.delivery_status, DeliveryStatus.FAILED)
        self.assertEqual(row.delivery_error_code, "send_failed")
        self.assertNotIn("provider down", str(response.data))

    def test_privacy_request_classified(self):
        self.assertTrue(is_privacy_request("privacy_data", "legal_privacy_request"))
        with patch("contact.views.verify_turnstile_token", return_value=True):
            with patch("contact.operations.send_transactional_email", return_value=True):
                response = self.client.post(
                    reverse("contact-submit"),
                    self._valid_payload(
                        category="privacy_data",
                        subcategory="legal_privacy_request",
                        subject="Legal privacy request here",
                        message="Please provide a copy of the personal data you store.",
                    ),
                    format="json",
                )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(ContactRequest.objects.get().is_privacy_request)

    def test_public_endpoint_requires_no_login(self):
        self.assertEqual(self.client.get(reverse("contact-categories")).status_code, 200)
        with patch("contact.views.verify_turnstile_token", return_value=True):
            with patch("contact.operations.send_transactional_email", return_value=True):
                response = self.client.post(
                    reverse("contact-submit"),
                    self._valid_payload(),
                    format="json",
                )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_kiosk_cannot_launch_suggestions(self):
        items = suggest_faq_entries("kiosk", "cannot_launch")
        slugs = [item["slug"] for item in items]
        self.assertIn("why-cant-i-launch-my-kiosk", slugs)
        self.assertTrue(any("launch" in item["question"].lower() for item in items))

    def test_downgrade_suggestions(self):
        items = suggest_faq_entries("plans_billing", "downgrade")
        slugs = [item["slug"] for item in items]
        self.assertTrue(
            any("downgrade" in slug or "plan-locked" in slug or "locked" in slug for slug in slugs)
            or any("downgrade" in item["question"].lower() for item in items)
        )

    def test_email_not_sent_suggestions(self):
        items = suggest_faq_entries("email", "email_not_sent")
        slugs = [item["slug"] for item in items]
        self.assertIn("why-was-an-email-not-sent", slugs)

    def test_suggestions_endpoint_uses_canonical_faq(self):
        response = self.client.get(
            reverse("contact-suggestions"),
            {"category": "kiosk", "subcategory": "cannot_launch"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["items"])
        self.assertIn("question", response.data["items"][0])
        self.assertIn("answer_markdown", response.data["items"][0])

    def test_no_match_returns_empty_list(self):
        response = self.client.get(
            reverse("contact-suggestions"),
            {"category": "nope", "subcategory": "nope"},
        )
        self.assertEqual(response.data["items"], [])
