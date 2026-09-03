"""Phase 4: Stripe webhook claim concurrency / idempotency."""

from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import User
from billing.fake_provider import get_fake_provider
from billing.models import ProviderEvent, ProviderEventStatus, PurchaseSource
from billing.snapshots import ProviderEventPayload
from billing.testing import simulate_migrated_existing_workspace
from billing.webhooks import (
    PROCESSING_RECLAIM_AFTER,
    claim_provider_event_for_processing,
    process_provider_event,
)
from organizations.models import Organization, OrganizationPlan

STRIPE_TEST_SETTINGS = {
    "BILLING_PROVIDER": "fake",
    "STRIPE_SECRET_KEY": "sk_test_fake",
    "STRIPE_WEBHOOK_SECRET": "whsec_test_fake",
}


@override_settings(**STRIPE_TEST_SETTINGS)
class WebhookClaimIdempotencyTests(TestCase):
    """
    SQLite tests prove application-level claim transitions and uniqueness.
    They do not prove PostgreSQL row-lock concurrency under real contention.
    """

    def setUp(self):
        get_fake_provider().reset()
        self.owner = User.objects.create_user(
            email="webhook-claim@example.com", password="secure-password"
        )
        self.owner.mark_email_verified()
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        simulate_migrated_existing_workspace(self.org)

    def _checkout_payload(self, event_id="evt_claim_1"):
        fake = get_fake_provider()
        checkout = fake.create_checkout_session(
            organization=self.org,
            owner=self.owner,
            plan_key="plus",
            interval="monthly",
            success_url="http://localhost/s",
            cancel_url="http://localhost/c",
        )
        snapshot = fake.complete_checkout(checkout.session_id)
        return ProviderEventPayload(
            event_id=event_id,
            event_type="checkout.session.completed",
            data_object={
                "id": checkout.session_id,
                "object": "checkout.session",
                "subscription": snapshot.subscription_id,
                "customer": snapshot.customer_id,
                "client_reference_id": str(self.org.pk),
                "metadata": {"organization_id": str(self.org.pk)},
            },
        )

    def test_sequential_duplicate_dispatches_once(self):
        payload = self._checkout_payload("evt_seq_dup")
        first = process_provider_event(payload)
        self.assertEqual(first, "processed")
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        second = process_provider_event(payload)
        self.assertEqual(second, "duplicate")
        self.assertEqual(
            ProviderEvent.objects.filter(external_event_id="evt_seq_dup").count(), 1
        )
        row = ProviderEvent.objects.get(external_event_id="evt_seq_dup")
        self.assertEqual(row.status, ProviderEventStatus.PROCESSED)

    def test_processed_state_no_redispatch(self):
        ProviderEvent.objects.create(
            provider=PurchaseSource.STRIPE,
            external_event_id="evt_already_done",
            event_type="checkout.session.completed",
            status=ProviderEventStatus.PROCESSED,
            processed_at=timezone.now(),
        )
        with patch("billing.webhooks._dispatch") as dispatch:
            result = process_provider_event(
                ProviderEventPayload(
                    event_id="evt_already_done",
                    event_type="checkout.session.completed",
                    data_object={},
                )
            )
        self.assertEqual(result, "duplicate")
        dispatch.assert_not_called()

    def test_processing_state_blocks_second_claim(self):
        ProviderEvent.objects.create(
            provider=PurchaseSource.STRIPE,
            external_event_id="evt_busy",
            event_type="checkout.session.completed",
            status=ProviderEventStatus.PROCESSING,
            processing_started_at=timezone.now(),
        )
        with patch("billing.webhooks._dispatch") as dispatch:
            result = process_provider_event(
                ProviderEventPayload(
                    event_id="evt_busy",
                    event_type="checkout.session.completed",
                    data_object={},
                )
            )
        self.assertEqual(result, "duplicate")
        dispatch.assert_not_called()

    def test_failed_event_is_retryable(self):
        payload = ProviderEventPayload(
            event_id="evt_retry_me",
            event_type="customer.subscription.updated",
            data_object={"id": "sub_missing", "object": "subscription"},
        )
        with self.assertRaises(Exception):
            process_provider_event(payload)
        row = ProviderEvent.objects.get(external_event_id="evt_retry_me")
        self.assertEqual(row.status, ProviderEventStatus.FAILED)

        fake = get_fake_provider()
        checkout = fake.create_checkout_session(
            organization=self.org,
            owner=self.owner,
            plan_key="plus",
            interval="monthly",
            success_url="http://localhost/s",
            cancel_url="http://localhost/c",
        )
        snap = fake.complete_checkout(checkout.session_id)
        retry = ProviderEventPayload(
            event_id="evt_retry_me",
            event_type="customer.subscription.updated",
            data_object={
                "id": snap.subscription_id,
                "object": "subscription",
                "customer": snap.customer_id,
                "metadata": {"organization_id": str(self.org.pk)},
            },
        )
        result = process_provider_event(retry)
        self.assertEqual(result, "processed")
        row.refresh_from_db()
        self.assertEqual(row.status, ProviderEventStatus.PROCESSED)

    def test_unique_constraint_prevents_duplicate_rows(self):
        ProviderEvent.objects.create(
            provider=PurchaseSource.STRIPE,
            external_event_id="evt_unique",
            event_type="invoice.paid",
            status=ProviderEventStatus.RECEIVED,
        )
        with self.assertRaises(Exception):
            ProviderEvent.objects.create(
                provider=PurchaseSource.STRIPE,
                external_event_id="evt_unique",
                event_type="invoice.paid",
                status=ProviderEventStatus.RECEIVED,
            )

    def test_claim_helper_competing_second_sees_processing(self):
        event = ProviderEventPayload(
            event_id="evt_race_helper",
            event_type="invoice.paid",
            data_object={},
        )
        first_row, first_outcome = claim_provider_event_for_processing(event)
        self.assertEqual(first_outcome, "claimed")
        self.assertEqual(first_row.status, ProviderEventStatus.PROCESSING)
        second_row, second_outcome = claim_provider_event_for_processing(event)
        self.assertEqual(second_outcome, "in_progress")
        self.assertEqual(second_row.pk, first_row.pk)

    def test_stale_processing_can_be_reclaimed(self):
        stale_started = timezone.now() - PROCESSING_RECLAIM_AFTER - timedelta(seconds=5)
        ProviderEvent.objects.create(
            provider=PurchaseSource.STRIPE,
            external_event_id="evt_stale",
            event_type="invoice.paid",
            status=ProviderEventStatus.PROCESSING,
            processing_started_at=stale_started,
        )
        row, outcome = claim_provider_event_for_processing(
            ProviderEventPayload(
                event_id="evt_stale",
                event_type="invoice.paid",
                data_object={},
            )
        )
        self.assertEqual(outcome, "claimed")
        self.assertEqual(row.status, ProviderEventStatus.PROCESSING)
        self.assertGreater(row.processing_started_at, stale_started)
