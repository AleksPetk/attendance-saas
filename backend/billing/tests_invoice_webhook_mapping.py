"""Regression: modern Stripe Invoice webhook mapping for paid / payment_succeeded."""

from django.test import TestCase, override_settings

from accounts.models import User
from billing.fake_provider import get_fake_provider
from billing.models import (
    BillingStatus,
    ProviderEvent,
    ProviderEventStatus,
    PurchaseSource,
    WorkspaceSubscription,
)
from billing.snapshots import ProviderEventPayload
from billing.testing import simulate_migrated_existing_workspace
from billing.webhooks import (
    _subscription_id_from_object,
    process_provider_event,
)
from organizations.models import Organization, OrganizationPlan

STRIPE_TEST_SETTINGS = {
    "BILLING_PROVIDER": "fake",
    "STRIPE_SECRET_KEY": "sk_test_fake",
    "STRIPE_WEBHOOK_SECRET": "whsec_test_fake",
}


def _modern_invoice_object(*, invoice_id, customer_id, subscription_id, metadata=None):
    """Stripe Invoice shape without top-level ``subscription`` (API 2024+)."""
    return {
        "id": invoice_id,
        "object": "invoice",
        "customer": customer_id,
        "metadata": metadata or {},
        "billing_reason": "subscription_create",
        "amount_paid": 0,
        "amount_due": 0,
        "parent": {
            "type": "subscription_details",
            "subscription_details": {"subscription": subscription_id},
            "quote_details": None,
        },
        "lines": {
            "object": "list",
            "data": [
                {
                    "id": "il_test_1",
                    "object": "line_item",
                    "parent": {
                        "type": "subscription_item_details",
                        "subscription_item_details": {
                            "subscription": subscription_id,
                            "subscription_item": "si_test_1",
                        },
                    },
                }
            ],
        },
    }


@override_settings(**STRIPE_TEST_SETTINGS)
class InvoiceSubscriptionIdExtractionTests(TestCase):
    def test_legacy_top_level_subscription(self):
        self.assertEqual(
            _subscription_id_from_object(
                {"object": "invoice", "subscription": "sub_legacy"}
            ),
            "sub_legacy",
        )

    def test_modern_parent_subscription_details(self):
        obj = _modern_invoice_object(
            invoice_id="in_1",
            customer_id="cus_1",
            subscription_id="sub_modern",
        )
        self.assertIsNone(obj.get("subscription"))
        self.assertEqual(_subscription_id_from_object(obj), "sub_modern")


@override_settings(**STRIPE_TEST_SETTINGS)
class InvoiceWebhookMappingTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = User.objects.create_user(
            email="invoice-map@example.com", password="secure-password"
        )
        self.owner.mark_email_verified()
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        simulate_migrated_existing_workspace(self.org)

    def _complete_checkout(self):
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
        process_provider_event(
            ProviderEventPayload(
                event_id="evt_checkout_base",
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
        )
        return snapshot

    def test_invoice_paid_maps_modern_shape(self):
        snapshot = self._complete_checkout()
        # Simulate race: clear local IDs so mapping must use parent.subscription
        # + Stripe subscription metadata enrichment.
        billing = WorkspaceSubscription.objects.get(organization=self.org)
        billing.external_customer_id = ""
        billing.external_subscription_id = ""
        billing.save(
            update_fields=["external_customer_id", "external_subscription_id", "updated_at"]
        )

        result = process_provider_event(
            ProviderEventPayload(
                event_id="evt_invoice_paid_modern",
                event_type="invoice.paid",
                data_object=_modern_invoice_object(
                    invoice_id="in_paid_1",
                    customer_id=snapshot.customer_id,
                    subscription_id=snapshot.subscription_id,
                ),
            )
        )
        self.assertEqual(result, "processed")
        row = ProviderEvent.objects.get(external_event_id="evt_invoice_paid_modern")
        self.assertEqual(row.status, ProviderEventStatus.PROCESSED)
        billing.refresh_from_db()
        self.assertEqual(billing.external_subscription_id, snapshot.subscription_id)
        self.assertEqual(billing.external_customer_id, snapshot.customer_id)
        self.assertEqual(
            WorkspaceSubscription.objects.filter(organization=self.org).count(), 1
        )

    def test_invoice_payment_succeeded_maps_same_subscription(self):
        snapshot = self._complete_checkout()
        result = process_provider_event(
            ProviderEventPayload(
                event_id="evt_invoice_payment_succeeded",
                event_type="invoice.payment_succeeded",
                data_object=_modern_invoice_object(
                    invoice_id="in_succeeded_1",
                    customer_id=snapshot.customer_id,
                    subscription_id=snapshot.subscription_id,
                ),
            )
        )
        self.assertEqual(result, "processed")
        self.org.refresh_from_db()
        billing = WorkspaceSubscription.objects.get(organization=self.org)
        self.assertEqual(billing.subscribed_plan, "plus")
        self.assertEqual(billing.status, BillingStatus.ACTIVE)
        self.assertEqual(
            WorkspaceSubscription.objects.exclude(external_subscription_id="").count(),
            1,
        )

    def test_redundant_payment_succeeded_does_not_corrupt_state(self):
        snapshot = self._complete_checkout()
        invoice = _modern_invoice_object(
            invoice_id="in_same",
            customer_id=snapshot.customer_id,
            subscription_id=snapshot.subscription_id,
        )
        first = process_provider_event(
            ProviderEventPayload(
                event_id="evt_paid_then_succeeded_a",
                event_type="invoice.paid",
                data_object=invoice,
            )
        )
        self.org.refresh_from_db()
        billing = WorkspaceSubscription.objects.get(organization=self.org)
        before = (
            billing.status,
            billing.subscribed_plan,
            billing.external_subscription_id,
            billing.external_customer_id,
            self.org.plan,
        )
        second = process_provider_event(
            ProviderEventPayload(
                event_id="evt_paid_then_succeeded_b",
                event_type="invoice.payment_succeeded",
                data_object=invoice,
            )
        )
        self.assertEqual(first, "processed")
        self.assertEqual(second, "processed")
        billing.refresh_from_db()
        self.org.refresh_from_db()
        after = (
            billing.status,
            billing.subscribed_plan,
            billing.external_subscription_id,
            billing.external_customer_id,
            self.org.plan,
        )
        self.assertEqual(before, after)
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        self.assertEqual(WorkspaceSubscription.objects.filter(organization=self.org).count(), 1)
        self.assertEqual(
            ProviderEvent.objects.filter(
                external_event_id__in=[
                    "evt_paid_then_succeeded_a",
                    "evt_paid_then_succeeded_b",
                ]
            ).count(),
            2,
        )

    def test_unknown_invoice_is_ignored_not_failed(self):
        result = process_provider_event(
            ProviderEventPayload(
                event_id="evt_foreign_invoice",
                event_type="invoice.payment_succeeded",
                data_object=_modern_invoice_object(
                    invoice_id="in_foreign",
                    customer_id="cus_not_ours",
                    subscription_id="sub_not_ours",
                ),
            )
        )
        self.assertEqual(result, "ignored")
        row = ProviderEvent.objects.get(external_event_id="evt_foreign_invoice")
        self.assertEqual(row.status, ProviderEventStatus.IGNORED)
        self.assertFalse(
            WorkspaceSubscription.objects.filter(
                external_subscription_id="sub_not_ours"
            ).exists()
        )
        self.assertEqual(
            WorkspaceSubscription.objects.filter(purchase_source=PurchaseSource.STRIPE)
            .exclude(external_subscription_id="")
            .count(),
            0,
        )

    def test_failed_event_can_be_replayed_after_fix(self):
        """FAILED claim can be reclaimed once mapping works (production replay)."""
        snapshot = self._complete_checkout()
        ProviderEvent.objects.create(
            provider=PurchaseSource.STRIPE,
            external_event_id="evt_replay_failed",
            event_type="invoice.payment_succeeded",
            status=ProviderEventStatus.FAILED,
            error_summary="Stripe object could not be mapped to a workspace.",
        )
        result = process_provider_event(
            ProviderEventPayload(
                event_id="evt_replay_failed",
                event_type="invoice.payment_succeeded",
                data_object=_modern_invoice_object(
                    invoice_id="in_replay",
                    customer_id=snapshot.customer_id,
                    subscription_id=snapshot.subscription_id,
                ),
            )
        )
        self.assertEqual(result, "processed")
        row = ProviderEvent.objects.get(external_event_id="evt_replay_failed")
        self.assertEqual(row.status, ProviderEventStatus.PROCESSED)
        self.assertEqual(row.error_summary, "")
