"""Pre-Stripe audit coverage: tenant isolation, reconciliation, UI action gates."""

from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from billing.exceptions import BillingStateError
from billing.fake_provider import get_fake_provider
from billing.models import (
    ProviderEvent,
    ProviderEventStatus,
    PurchaseSource,
)
from billing.reconciliation import (
    reconcile_subscription_snapshot,
    resolve_organization_from_mapping,
)
from billing.services import (
    activate_paid_subscription,
    schedule_cancellation,
    start_trial,
)
from billing.snapshots import ProviderEventPayload, SubscriptionSnapshot
from billing.state import build_billing_state
from billing.webhooks import process_provider_event
from organizations.models import Organization, OrganizationPlan

STRIPE_TEST_SETTINGS = {
    "BILLING_PROVIDER": "fake",
    "STRIPE_SECRET_KEY": "sk_test_fake",
    "STRIPE_WEBHOOK_SECRET": "whsec_fake",
    "STRIPE_PRICE_PLUS_MONTHLY": "price_plus_monthly",
    "STRIPE_PRICE_PLUS_YEARLY": "price_plus_yearly",
    "STRIPE_PRICE_BUSINESS_MONTHLY": "price_business_monthly",
    "STRIPE_PRICE_BUSINESS_YEARLY": "price_business_yearly",
    "BUSINESS_TRIAL_DAYS": 0,
    "FRONTEND_BASE_URL": "http://localhost:5173",
}


def create_user(email, *, password="secure-password", verified=True):
    user = User.objects.create_user(email=email, password=password)
    if verified:
        user.mark_email_verified()
    return user


def login_owner(api, email, password="secure-password"):
    response = api.post(
        "/api/auth/login/",
        {"email": email, "password": password},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    return api


@override_settings(**STRIPE_TEST_SETTINGS)
class BillingTenantIsolationTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner_a = create_user("owner-a@example.com")
        self.owner_b = create_user("owner-b@example.com")
        self.org_a = Organization.objects.create_with_owner(owner=self.owner_a)
        self.org_b = Organization.objects.create_with_owner(owner=self.owner_b)
        self.api_a = login_owner(APIClient(), "owner-a@example.com")
        self.api_b = login_owner(APIClient(), "owner-b@example.com")

    def test_owner_cannot_read_or_mutate_other_workspace_billing(self):
        activate_paid_subscription(
            self.org_b,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timedelta(days=30),
            external_customer_id="cus_b",
            external_subscription_id="sub_b",
        )
        state_a = self.api_a.get("/api/billing/").data
        self.assertEqual(state_a["effective_plan"]["key"], "basic")
        self.assertNotEqual(state_a["effective_plan"]["key"], "plus")

        checkout = self.api_a.post(
            "/api/billing/checkout/",
            {"plan": "plus", "interval": "monthly", "organization_id": self.org_b.pk},
            format="json",
        )
        self.assertEqual(checkout.status_code, 200)
        session = get_fake_provider().checkouts[checkout.data["session_id"]]
        self.assertEqual(session["organization_id"], self.org_a.pk)

        preview = self.api_a.post("/api/billing/upgrade/preview/", {}, format="json")
        self.assertEqual(preview.status_code, 400)

        portal = self.api_a.post("/api/billing/portal/", {}, format="json")
        self.assertEqual(portal.status_code, 400)

    def test_metadata_and_subscription_org_conflict_rejected(self):
        activate_paid_subscription(
            self.org_a,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timedelta(days=30),
            external_customer_id="cus_a",
            external_subscription_id="sub_a",
        )
        with self.assertRaises(BillingStateError) as ctx:
            resolve_organization_from_mapping(
                metadata={"organization_id": str(self.org_b.pk)},
                subscription_id="sub_a",
            )
        self.assertEqual(ctx.exception.code, "stripe_tenant_mismatch")


@override_settings(**STRIPE_TEST_SETTINGS)
class BillingReconciliationAuditTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = create_user("recon-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)

    def test_ended_without_price_id_still_finalizes(self):
        activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timedelta(days=30),
            external_customer_id="cus_end",
            external_subscription_id="sub_end",
        )
        snapshot = SubscriptionSnapshot(
            subscription_id="sub_end",
            customer_id="cus_end",
            status="canceled",
            price_id="",
            cancel_at_period_end=False,
            current_period_start=timezone.now(),
            current_period_end=timezone.now(),
            trial_start=None,
            trial_end=None,
            metadata={"organization_id": str(self.org.pk)},
        )
        reconcile_subscription_snapshot(self.org, snapshot)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)

    def test_stale_active_retrieve_after_delete_converges_via_provider_truth(self):
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
        reconcile_subscription_snapshot(self.org, snap)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)

        deleted = fake.mark_deleted(snap.subscription_id)
        reconcile_subscription_snapshot(self.org, deleted)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)

        again = fake.retrieve_subscription(snap.subscription_id)
        reconcile_subscription_snapshot(self.org, again)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)

    def test_failed_webhook_can_retry_same_event_id(self):
        payload = ProviderEventPayload(
            event_id="evt_retry_fail",
            event_type="customer.subscription.updated",
            data_object={"id": "sub_missing", "object": "subscription"},
        )
        with self.assertRaises(Exception):
            process_provider_event(payload)
        row = ProviderEvent.objects.get(external_event_id="evt_retry_fail")
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
            event_id="evt_retry_fail",
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
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)


@override_settings(**STRIPE_TEST_SETTINGS)
class BillingActionGateAndPreviewTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = create_user("gate-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.api = login_owner(APIClient(), "gate-owner@example.com")

    def _activate(self, plan="plus", interval="monthly"):
        fake = get_fake_provider()
        checkout = fake.create_checkout_session(
            organization=self.org,
            owner=self.owner,
            plan_key=plan,
            interval=interval,
            success_url="http://localhost/s",
            cancel_url="http://localhost/c",
        )
        snap = fake.complete_checkout(checkout.session_id)
        activate_paid_subscription(
            self.org,
            subscribed_plan=plan,
            billing_interval=interval,
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=snap.current_period_start,
            current_period_end=snap.current_period_end,
            external_customer_id=snap.customer_id,
            external_subscription_id=snap.subscription_id,
        )
        return snap

    def test_checkout_all_four_price_mappings(self):
        cases = [
            ("plus", "monthly", "price_plus_monthly"),
            ("plus", "yearly", "price_plus_yearly"),
            ("business", "monthly", "price_business_monthly"),
            ("business", "yearly", "price_business_yearly"),
        ]
        for plan, interval, price_id in cases:
            get_fake_provider().reset()
            response = self.api.post(
                "/api/billing/checkout/",
                {"plan": plan, "interval": interval},
                format="json",
            )
            self.assertEqual(response.status_code, 200, (plan, interval))
            session = get_fake_provider().checkouts[response.data["session_id"]]
            self.assertEqual(session["price_id"], price_id)
            self.org.refresh_from_db()
            self.assertEqual(self.org.plan, OrganizationPlan.BASIC)

    def test_unusual_preview_amounts_pass_through(self):
        self._activate("plus", "monthly")
        for cents, formatted in ((37, "$0.37"), (243, "$2.43"), (498, "$4.98")):
            get_fake_provider().preview_amount_cents = cents
            response = self.api.post("/api/billing/upgrade/preview/", {}, format="json")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["amount_due_cents"], cents)
            self.assertEqual(response.data["amount_due_formatted"], formatted)

    def test_yearly_plus_to_business_uses_provider(self):
        self._activate("plus", "yearly")
        get_fake_provider().preview_amount_cents = 498
        preview = self.api.post("/api/billing/upgrade/preview/", {}, format="json")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["recurring_interval"], "yearly")
        self.assertEqual(preview.data["amount_due_cents"], 498)
        upgraded = self.api.post("/api/billing/upgrade/", {}, format="json")
        self.assertEqual(upgraded.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
        self.assertEqual(upgraded.data["interval"], "yearly")

    def test_cancel_scheduled_hides_conflicting_actions(self):
        self._activate("business", "monthly")
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
        schedule_cancellation(
            self.org, effective_at=timezone.now() + timedelta(days=10)
        )
        self.org.refresh_from_db()
        state = build_billing_state(self.org)
        self.assertTrue(state["cancel_at_period_end"])
        self.assertFalse(state["actions"]["can_schedule_downgrade_to_plus"])
        self.assertFalse(state["actions"]["can_cancel"])
        self.assertTrue(state["actions"]["can_resume_subscription"])
        self.assertFalse(state["actions"]["can_cancel_scheduled_downgrade"])
        self.assertEqual(state["effective_plan"]["key"], "business")

    def test_trial_cancel_keeps_business_until_end(self):
        start_trial(
            self.org,
            billing_interval="monthly",
            trial_started_at=timezone.now(),
            trial_ends_at=timezone.now() + timedelta(days=10),
            purchase_source=PurchaseSource.STRIPE,
            payment_method_recorded=True,
            external_customer_id="cus_trial",
            external_subscription_id="sub_trial",
        )
        get_fake_provider().subscriptions["sub_trial"] = SubscriptionSnapshot(
            subscription_id="sub_trial",
            customer_id="cus_trial",
            status="trialing",
            price_id="price_business_monthly",
            cancel_at_period_end=False,
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timedelta(days=10),
            trial_start=timezone.now(),
            trial_end=timezone.now() + timedelta(days=10),
            metadata={"organization_id": str(self.org.pk)},
        )
        response = self.api.post("/api/billing/cancel/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
        self.assertTrue(response.data["cancel_at_period_end"])


@override_settings(
    **{
        **STRIPE_TEST_SETTINGS,
        "STRIPE_SECRET_KEY": "",
        "STRIPE_PRICE_PLUS_MONTHLY": "",
    }
)
class BillingUnconfiguredModeTests(TestCase):
    def setUp(self):
        self.owner = create_user("unconfigured@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.api = login_owner(APIClient(), "unconfigured@example.com")

    def test_billing_get_and_catalog_work_without_stripe(self):
        catalog = self.api.get("/api/billing/catalog/")
        self.assertEqual(catalog.status_code, 200)
        self.assertEqual(
            catalog.data["plans"]["plus"]["intervals"]["monthly"]["formatted"], "$9.99"
        )
        self.assertFalse(catalog.data.get("stripe_configured"))
        state = self.api.get("/api/billing/")
        self.assertEqual(state.status_code, 200)
        self.assertFalse(state.data["stripe_configured"])
        self.assertFalse(state.data["actions"]["can_checkout_plus"])
        checkout = self.api.post(
            "/api/billing/checkout/",
            {"plan": "plus", "interval": "monthly"},
            format="json",
        )
        self.assertEqual(checkout.status_code, 503)
