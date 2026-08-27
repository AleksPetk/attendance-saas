"""Phase 2 Stripe-ready billing APIs, webhook, and provider boundary tests.

All provider calls use BILLING_PROVIDER=fake. No network requests.
"""

import json
from datetime import timedelta
from unittest.mock import patch

from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from attendance.kiosk_lock import SESSION_KIOSK_GROUP_ID, SESSION_KIOSK_LOCKED
from billing.fake_provider import FAKE_SIGNATURE_OK, get_fake_provider
from billing.models import (
    BillingStatus,
    ProviderEvent,
    ProviderEventStatus,
    PurchaseSource,
    WorkspaceSubscription,
)
from billing.services import activate_paid_subscription, mark_payment_failure
from billing.testing import simulate_migrated_existing_workspace
from groups.models import Group
from kiosk_builder.kiosk_settings_constants import KioskType
from kiosk_builder.testing import configure_group_kiosk_for_launch
from organizations.models import (
    Organization,
    OrganizationPlan,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
)

STRIPE_TEST_SETTINGS = {
    "BILLING_PROVIDER": "fake",
    "STRIPE_SECRET_KEY": "sk_test_fake",
    "STRIPE_WEBHOOK_SECRET": "whsec_fake",
    "STRIPE_PRICE_PLUS_MONTHLY": "price_plus_monthly",
    "STRIPE_PRICE_PLUS_YEARLY": "price_plus_yearly",
    "STRIPE_PRICE_BUSINESS_MONTHLY": "price_business_monthly",
    "STRIPE_PRICE_BUSINESS_YEARLY": "price_business_yearly",
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
class BillingPhase2ApiTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = create_user("billing-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        simulate_migrated_existing_workspace(self.org)
        self.api = login_owner(APIClient(), "billing-owner@example.com")

    def test_owner_can_get_billing_state_without_subscription_row(self):
        response = self.api.get("/api/billing/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["effective_plan"]["key"], "basic")
        self.assertEqual(response.data["purchase_source"], "none")
        self.assertTrue(response.data["actions"]["can_checkout_plus"])
        self.assertNotIn("can_start_trial", response.data["actions"])
        self.assertFalse(response.data["actions"]["can_change_interval"])
        self.assertNotIn("external_subscription_id", response.data)
        self.assertEqual(response.data["catalog"]["plans"]["plus"]["intervals"]["monthly"]["formatted"], "$9.99")

    def test_admin_and_staff_cannot_manage_billing(self):
        self.org.plan = OrganizationPlan.PLUS
        self.org.save(update_fields=["plan", "updated_at"])
        WorkspaceStaffAccount.objects.create_account(
            organization=self.org,
            username="bill.admin",
            password="admin-password",
            role=WorkspaceStaffRole.ADMIN,
            email="bill.admin@example.com",
        )
        admin_api = APIClient()
        login = admin_api.post(
            "/api/auth/staff-login/",
            {
                "workspace_id": self.org.workspace_id,
                "username": "bill.admin",
                "password": "admin-password",
            },
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        for path in (
            "/api/billing/",
            "/api/billing/checkout/",
            "/api/billing/portal/",
            "/api/billing/invoices/",
            "/api/billing/resume/",
            "/api/billing/downgrade/cancel/",
        ):
            if path in {"/api/billing/", "/api/billing/invoices/"}:
                response = admin_api.get(path)
            else:
                response = admin_api.post(path, {}, format="json")
            self.assertIn(response.status_code, (403, 401), path)

    def test_paid_checkout_maps_monthly_and_yearly_prices(self):
        monthly = self.api.post(
            "/api/billing/checkout/",
            {"plan": "plus", "interval": "monthly"},
            format="json",
        )
        self.assertEqual(monthly.status_code, 200)
        self.assertTrue(monthly.data["checkout_url"].startswith("https://checkout.stripe.test/"))
        fake = get_fake_provider()
        session = fake.checkouts[monthly.data["session_id"]]
        self.assertEqual(session["price_id"], "price_plus_monthly")
        self.assertEqual(session["organization_id"], self.org.pk)

        yearly = self.api.post(
            "/api/billing/checkout/",
            {"plan": "business", "interval": "yearly"},
            format="json",
        )
        self.assertEqual(yearly.status_code, 200)
        session = fake.checkouts[yearly.data["session_id"]]
        self.assertEqual(session["price_id"], "price_business_yearly")

    def test_old_trial_checkout_endpoint_is_gone(self):
        response = self.api.post(
            "/api/billing/trial-checkout/",
            {"interval": "monthly"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_checkout_success_return_does_not_grant_plan(self):
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)
        # Browser return is UX only; without webhook, plan stays Basic.
        response = self.api.get("/api/billing/")
        self.assertEqual(response.data["effective_plan"]["key"], "basic")
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)

    def _activate_plus(self):
        fake = get_fake_provider()
        checkout = fake.create_checkout_session(
            organization=self.org,
            owner=self.owner,
            plan_key="plus",
            interval="monthly",
            success_url="http://localhost/success",
            cancel_url="http://localhost/cancel",
        )
        snapshot = fake.complete_checkout(checkout.session_id)
        activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=snapshot.current_period_start,
            current_period_end=snapshot.current_period_end,
            external_customer_id=snapshot.customer_id,
            external_subscription_id=snapshot.subscription_id,
        )
        billing = WorkspaceSubscription.objects.get(organization=self.org)
        return billing, snapshot

    def test_upgrade_preview_uses_provider_amount(self):
        self._activate_plus()
        get_fake_provider().preview_amount_cents = 237
        response = self.api.post("/api/billing/upgrade/preview/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["amount_due_cents"], 237)
        self.assertEqual(response.data["amount_due_formatted"], "$2.37")
        self.assertEqual(response.data["target_plan"], "business")

    def test_immediate_upgrade_applies_only_after_provider_success(self):
        self._activate_plus()
        fake = get_fake_provider()
        fake.fail_next_upgrade = True
        failed = self.api.post("/api/billing/upgrade/", {}, format="json")
        self.assertEqual(failed.status_code, 502)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)

        ok = self.api.post("/api/billing/upgrade/", {}, format="json")
        self.assertEqual(ok.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
        self.assertEqual(ok.data["effective_plan"]["key"], "business")

    def test_downgrade_stays_current_plan_until_effective(self):
        billing, snapshot = self._activate_plus()
        # Move to Business first via provider upgrade path.
        fake = get_fake_provider()
        fake.apply_upgrade(
            subscription_id=billing.external_subscription_id,
            target_plan="business",
            target_interval="monthly",
        )
        from billing.reconciliation import reconcile_subscription_snapshot

        reconcile_subscription_snapshot(
            self.org, fake.retrieve_subscription(billing.external_subscription_id)
        )
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)

        response = self.api.post("/api/billing/downgrade/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
        self.assertEqual(response.data["pending_plan"], "plus")
        self.assertEqual(response.data["effective_plan"]["key"], "business")

    def test_cancellation_stays_current_until_effective(self):
        self._activate_plus()
        response = self.api.post("/api/billing/cancel/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        self.assertTrue(response.data["cancel_at_period_end"])

    def test_resume_clears_scheduled_cancellation(self):
        self._activate_plus()
        cancel = self.api.post("/api/billing/cancel/", {}, format="json")
        self.assertEqual(cancel.status_code, 200)
        billing = WorkspaceSubscription.objects.get(organization=self.org)
        period_end = billing.current_period_end
        self.assertTrue(billing.cancel_at_period_end)
        self.assertEqual(billing.pending_plan, "basic")
        self.assertTrue(cancel.data["actions"]["can_resume_subscription"])
        self.assertFalse(cancel.data["actions"]["can_cancel"])

        resume = self.api.post("/api/billing/resume/", {}, format="json")
        self.assertEqual(resume.status_code, 200)
        billing.refresh_from_db()
        self.org.refresh_from_db()
        fake = get_fake_provider()
        snapshot = fake.retrieve_subscription(billing.external_subscription_id)
        self.assertFalse(snapshot.cancel_at_period_end)
        self.assertFalse(billing.cancel_at_period_end)
        self.assertEqual(billing.pending_plan, "")
        self.assertIsNone(billing.pending_change_effective_at)
        self.assertEqual(billing.current_period_end, period_end)
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        self.assertEqual(resume.data["effective_plan"]["key"], "plus")
        self.assertFalse(resume.data["cancel_at_period_end"])
        self.assertTrue(resume.data["actions"]["can_cancel"])
        self.assertFalse(resume.data["actions"]["can_resume_subscription"])
        self.assertEqual(len(fake.resume_calls), 1)

        again = self.api.post("/api/billing/resume/", {}, format="json")
        self.assertEqual(again.status_code, 200)
        self.assertFalse(again.data["cancel_at_period_end"])
        self.assertEqual(len(fake.resume_calls), 1)

    def test_resume_provider_failure_preserves_cancellation(self):
        self._activate_plus()
        self.api.post("/api/billing/cancel/", {}, format="json")
        fake = get_fake_provider()
        fake.fail_next_resume = True
        response = self.api.post("/api/billing/resume/", {}, format="json")
        self.assertEqual(response.status_code, 502)
        billing = WorkspaceSubscription.objects.get(organization=self.org)
        self.assertTrue(billing.cancel_at_period_end)
        self.assertEqual(billing.pending_plan, "basic")
        snapshot = fake.retrieve_subscription(billing.external_subscription_id)
        self.assertTrue(snapshot.cancel_at_period_end)

    def test_deferred_paid_resume_keeps_delay_end_and_clears_cancel(self):
        from billing.services import record_deferred_paid_start
        from billing.snapshots import SubscriptionSnapshot

        trial_end = timezone.now() + timedelta(days=10)
        record_deferred_paid_start(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            trial_started_at=timezone.now(),
            trial_ends_at=trial_end,
            purchase_source=PurchaseSource.STRIPE,
            external_customer_id="cus_trial_resume",
            external_subscription_id="sub_trial_resume",
        )
        fake = get_fake_provider()
        fake.subscriptions["sub_trial_resume"] = SubscriptionSnapshot(
            subscription_id="sub_trial_resume",
            customer_id="cus_trial_resume",
            status="trialing",
            price_id="price_plus_monthly",
            cancel_at_period_end=False,
            current_period_start=timezone.now(),
            current_period_end=trial_end,
            trial_start=timezone.now(),
            trial_end=trial_end,
            metadata={"organization_id": str(self.org.pk)},
        )
        cancel = self.api.post("/api/billing/cancel/", {}, format="json")
        self.assertEqual(cancel.status_code, 200)
        self.assertTrue(cancel.data["cancel_at_period_end"])
        billing = WorkspaceSubscription.objects.get(organization=self.org)
        self.assertEqual(billing.trial_ends_at, trial_end)

        resume = self.api.post("/api/billing/resume/", {}, format="json")
        self.assertEqual(resume.status_code, 200)
        billing.refresh_from_db()
        self.assertFalse(billing.cancel_at_period_end)
        self.assertEqual(billing.trial_ends_at, trial_end)
        self.assertEqual(billing.status, BillingStatus.TRIALING)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)
        snapshot = fake.retrieve_subscription("sub_trial_resume")
        self.assertFalse(snapshot.cancel_at_period_end)
        self.assertEqual(snapshot.trial_end, trial_end)

    def test_cancel_scheduled_downgrade_keeps_business(self):
        self._activate_plus()
        billing = WorkspaceSubscription.objects.get(organization=self.org)
        fake = get_fake_provider()
        fake.apply_upgrade(
            subscription_id=billing.external_subscription_id,
            target_plan="business",
            target_interval="monthly",
        )
        from billing.reconciliation import reconcile_subscription_snapshot

        reconcile_subscription_snapshot(
            self.org, fake.retrieve_subscription(billing.external_subscription_id)
        )
        self.org.refresh_from_db()
        period_end = WorkspaceSubscription.objects.get(
            organization=self.org
        ).current_period_end

        scheduled = self.api.post("/api/billing/downgrade/", {}, format="json")
        self.assertEqual(scheduled.status_code, 200)
        self.assertEqual(scheduled.data["pending_plan"], "plus")
        self.assertTrue(scheduled.data["actions"]["can_cancel_scheduled_downgrade"])
        self.assertFalse(scheduled.data["actions"]["can_schedule_downgrade_to_plus"])
        self.assertEqual(len(fake.scheduled_downgrades), 1)

        cleared = self.api.post("/api/billing/downgrade/cancel/", {}, format="json")
        self.assertEqual(cleared.status_code, 200)
        billing = WorkspaceSubscription.objects.get(organization=self.org)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
        self.assertEqual(billing.subscribed_plan, "business")
        self.assertEqual(billing.pending_plan, "")
        self.assertIsNone(billing.pending_change_effective_at)
        self.assertEqual(billing.current_period_end, period_end)
        self.assertFalse(cleared.data["pending_plan"])
        self.assertTrue(cleared.data["actions"]["can_schedule_downgrade_to_plus"])
        self.assertFalse(cleared.data["actions"]["can_cancel_scheduled_downgrade"])
        self.assertEqual(len(fake.scheduled_downgrades), 0)
        self.assertEqual(len(fake.cancel_downgrade_calls), 1)

        again = self.api.post("/api/billing/downgrade/cancel/", {}, format="json")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(len(fake.cancel_downgrade_calls), 1)

    def test_cancel_downgrade_provider_failure_preserves_pending(self):
        self._activate_plus()
        billing = WorkspaceSubscription.objects.get(organization=self.org)
        fake = get_fake_provider()
        fake.apply_upgrade(
            subscription_id=billing.external_subscription_id,
            target_plan="business",
            target_interval="monthly",
        )
        from billing.reconciliation import reconcile_subscription_snapshot

        reconcile_subscription_snapshot(
            self.org, fake.retrieve_subscription(billing.external_subscription_id)
        )
        self.api.post("/api/billing/downgrade/", {}, format="json")
        fake.fail_next_cancel_downgrade = True
        response = self.api.post("/api/billing/downgrade/cancel/", {}, format="json")
        self.assertEqual(response.status_code, 502)
        billing = WorkspaceSubscription.objects.get(organization=self.org)
        self.assertEqual(billing.pending_plan, "plus")
        self.assertIn(billing.external_subscription_id, fake.scheduled_downgrades)

    def test_apple_source_rejects_resume_and_cancel_downgrade(self):
        activate_paid_subscription(
            self.org,
            subscribed_plan="business",
            billing_interval="monthly",
            purchase_source=PurchaseSource.APPLE,
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timedelta(days=30),
            external_customer_id="",
            external_subscription_id="apple_sub",
        )
        from billing.services import schedule_cancellation, schedule_downgrade

        schedule_cancellation(self.org)
        resume = self.api.post("/api/billing/resume/", {}, format="json")
        self.assertEqual(resume.status_code, 400)
        self.assertEqual(resume.data["code"], "purchase_source_not_stripe")

        billing = WorkspaceSubscription.objects.get(organization=self.org)
        billing.cancel_at_period_end = False
        billing.pending_plan = ""
        billing.pending_change_effective_at = None
        billing.save()
        schedule_downgrade(self.org, target_plan="plus")
        cancel_dg = self.api.post("/api/billing/downgrade/cancel/", {}, format="json")
        self.assertEqual(cancel_dg.status_code, 400)
        self.assertEqual(cancel_dg.data["code"], "purchase_source_not_stripe")

    def test_unauthenticated_cannot_resume_or_cancel_downgrade(self):
        anon = APIClient()
        resume = anon.post("/api/billing/resume/", {}, format="json")
        cancel_dg = anon.post("/api/billing/downgrade/cancel/", {}, format="json")
        self.assertEqual(resume.status_code, 401)
        self.assertEqual(cancel_dg.status_code, 401)

    def test_payment_failure_starts_grace_and_recovery(self):
        self._activate_plus()
        mark_payment_failure(self.org)
        billing = WorkspaceSubscription.objects.get(organization=self.org)
        self.assertEqual(billing.status, BillingStatus.PAST_DUE)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        state = self.api.get("/api/billing/").data
        self.assertTrue(state["payment_issue"]["active"])

        from billing.services import mark_payment_recovered

        mark_payment_recovered(self.org)
        billing.refresh_from_db()
        self.assertEqual(billing.status, BillingStatus.ACTIVE)

    def test_final_end_transitions_to_basic(self):
        self._activate_plus()
        from billing.services import finalize_subscription_end

        finalize_subscription_end(self.org)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)

    def test_portal_requires_stripe_customer(self):
        response = self.api.post("/api/billing/portal/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        self._activate_plus()
        ok = self.api.post("/api/billing/portal/", {}, format="json")
        self.assertEqual(ok.status_code, 200)
        self.assertTrue(ok.data["portal_url"].startswith("https://billing.stripe.test/"))

    def test_invoices_requires_stripe_source(self):
        activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.APPLE,
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timedelta(days=30),
            external_customer_id="cus_apple",
            external_subscription_id="apple_sub",
        )
        response = self.api.get("/api/billing/invoices/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "purchase_source_not_stripe")

    def test_invoices_empty_for_stripe_customer_without_history(self):
        billing, _snapshot = self._activate_plus()
        response = self.api.get("/api/billing/invoices/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["invoices"], [])
        fake = get_fake_provider()
        self.assertEqual(len(fake.list_invoices_calls), 1)
        self.assertEqual(
            fake.list_invoices_calls[0]["customer_id"],
            billing.external_customer_id,
        )

    def test_invoices_returns_recent_stripe_history(self):
        billing, _snapshot = self._activate_plus()
        fake = get_fake_provider()
        fake.seed_invoice(
            billing.external_customer_id,
            description="Plus (monthly)",
            amount_cents=999,
            status="paid",
            hosted_url="https://invoice.stripe.test/i/in_recent",
        )
        response = self.api.get("/api/billing/invoices/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["invoices"]), 1)
        row = response.data["invoices"][0]
        self.assertEqual(row["description"], "Plus (monthly)")
        self.assertEqual(row["amount_cents"], 999)
        self.assertEqual(row["amount_formatted"], "$9.99")
        self.assertEqual(row["currency"], "usd")
        self.assertEqual(row["status"], "paid")
        self.assertEqual(row["status_label"], "Paid")
        self.assertEqual(row["hosted_url"], "https://invoice.stripe.test/i/in_recent")
        self.assertTrue(row["created_at_formatted"])

    def test_invoices_are_scoped_to_owner_workspace_customer(self):
        billing_a, _snapshot_a = self._activate_plus()
        fake = get_fake_provider()
        fake.seed_invoice(
            billing_a.external_customer_id,
            description="Workspace A invoice",
            hosted_url="https://invoice.stripe.test/i/a",
        )

        owner_b = create_user("billing-owner-b@example.com")
        org_b = Organization.objects.create_with_owner(owner=owner_b)
        simulate_migrated_existing_workspace(org_b)
        checkout_b = fake.create_checkout_session(
            organization=org_b,
            owner=owner_b,
            plan_key="plus",
            interval="monthly",
            success_url="http://localhost/success",
            cancel_url="http://localhost/cancel",
        )
        snapshot_b = fake.complete_checkout(checkout_b.session_id)
        activate_paid_subscription(
            org_b,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=snapshot_b.current_period_start,
            current_period_end=snapshot_b.current_period_end,
            external_customer_id=snapshot_b.customer_id,
            external_subscription_id=snapshot_b.subscription_id,
        )
        fake.seed_invoice(
            snapshot_b.customer_id,
            description="Workspace B invoice",
            hosted_url="https://invoice.stripe.test/i/b",
        )

        api_b = login_owner(APIClient(), "billing-owner-b@example.com")
        response_a = self.api.get("/api/billing/invoices/")
        response_b = api_b.get("/api/billing/invoices/")
        self.assertEqual(response_a.data["invoices"][0]["description"], "Workspace A invoice")
        self.assertEqual(response_b.data["invoices"][0]["description"], "Workspace B invoice")

    def test_invoices_provider_failure_returns_error(self):
        self._activate_plus()
        fake = get_fake_provider()
        fake.fail_next_list_invoices = True
        response = self.api.get("/api/billing/invoices/")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["code"], "stripe_provider_error")

    def test_apple_source_blocks_stripe_checkout(self):
        activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.APPLE,
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timedelta(days=30),
            external_customer_id="",
            external_subscription_id="apple_sub",
        )
        # Force Basic-like checkout attempt after ending — Apple active blocks.
        response = self.api.post(
            "/api/billing/checkout/",
            {"plan": "plus", "interval": "monthly"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "purchase_source_apple")


@override_settings(**STRIPE_TEST_SETTINGS)
class BillingWebhookTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = create_user("webhook-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        simulate_migrated_existing_workspace(self.org)
        self.client = Client()

    def _post_event(self, event_id, event_type, obj, signature=FAKE_SIGNATURE_OK):
        payload = json.dumps(
            {"id": event_id, "type": event_type, "data": {"object": obj}}
        ).encode("utf-8")
        return self.client.post(
            "/api/billing/webhooks/stripe",
            data=payload,
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE=signature,
        )

    def test_invalid_signature_rejected(self):
        response = self._post_event(
            "evt_bad",
            "customer.subscription.updated",
            {"id": "sub_x"},
            signature="bad",
        )
        self.assertEqual(response.status_code, 400)

    def test_duplicate_event_idempotent(self):
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
        obj = {
            "id": checkout.session_id,
            "object": "checkout.session",
            "subscription": snapshot.subscription_id,
            "customer": snapshot.customer_id,
            "client_reference_id": str(self.org.pk),
            "metadata": {"organization_id": str(self.org.pk)},
        }
        first = self._post_event("evt_dup_1", "checkout.session.completed", obj)
        self.assertEqual(first.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        second = self._post_event("evt_dup_1", "checkout.session.completed", obj)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["status"], "duplicate")
        self.assertEqual(
            ProviderEvent.objects.filter(external_event_id="evt_dup_1").count(), 1
        )

    def test_tenant_mapping_from_metadata(self):
        fake = get_fake_provider()
        checkout = fake.create_checkout_session(
            organization=self.org,
            owner=self.owner,
            plan_key="business",
            interval="monthly",
            success_url="http://localhost/s",
            cancel_url="http://localhost/c",
        )
        snapshot = fake.complete_checkout(checkout.session_id)
        response = self._post_event(
            "evt_map",
            "customer.subscription.updated",
            {
                "id": snapshot.subscription_id,
                "object": "subscription",
                "customer": snapshot.customer_id,
                "metadata": {"organization_id": str(self.org.pk)},
            },
        )
        self.assertEqual(response.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)

    def test_payment_failed_starts_grace_not_basic(self):
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
        self._post_event(
            "evt_paid",
            "checkout.session.completed",
            {
                "id": checkout.session_id,
                "object": "checkout.session",
                "subscription": snapshot.subscription_id,
                "customer": snapshot.customer_id,
                "client_reference_id": str(self.org.pk),
                "metadata": {"organization_id": str(self.org.pk)},
            },
        )
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        failed = self._post_event(
            "evt_fail",
            "invoice.payment_failed",
            {
                "id": "in_1",
                "object": "invoice",
                "subscription": snapshot.subscription_id,
                "customer": snapshot.customer_id,
            },
        )
        self.assertEqual(failed.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        billing = WorkspaceSubscription.objects.get(organization=self.org)
        self.assertEqual(billing.status, BillingStatus.PAST_DUE)


@override_settings(**STRIPE_TEST_SETTINGS)
class BillingKioskLockWebhookTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = create_user("kiosk-bill@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        simulate_migrated_existing_workspace(self.org)
        self.org.plan = OrganizationPlan.BUSINESS
        self.org.save(update_fields=["plan", "updated_at"])
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Lobby",
            check_in_enabled=True,
        )
        configure_group_kiosk_for_launch(self.group, mode=KioskType.INPUT)
        self.api = login_owner(APIClient(), "kiosk-bill@example.com")

    def test_kiosk_lock_allows_stripe_webhook(self):
        session = self.api.session
        session[SESSION_KIOSK_LOCKED] = True
        session[SESSION_KIOSK_GROUP_ID] = self.group.pk
        session.save()
        payload = json.dumps(
            {
                "id": "evt_kiosk",
                "type": "customer.subscription.updated",
                "data": {"object": {"id": "sub_none"}},
            }
        ).encode("utf-8")
        # Invalid mapping may 500/400 after signature OK; must not be kiosk 403.
        response = self.api.post(
            "/api/billing/webhooks/stripe",
            data=payload,
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE=FAKE_SIGNATURE_OK,
        )
        self.assertNotEqual(response.status_code, 403)
        if response.status_code == 403:
            self.assertNotEqual(response.json().get("code"), "kiosk_locked")


@override_settings(**STRIPE_TEST_SETTINGS)
class BillingWarningCommandTests(TestCase):
    def setUp(self):
        self.owner = create_user("warn-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        simulate_migrated_existing_workspace(self.org)
        activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timedelta(days=30),
            external_customer_id="cus_warn",
            external_subscription_id="sub_warn",
        )
        mark_payment_failure(self.org)

    @patch("billing.warnings.send_payment_failure_warning")
    def test_warning_once_per_day(self, send_mock):
        from billing.warnings import send_due_payment_warnings

        first = send_due_payment_warnings()
        self.assertEqual(first["sent"], 1)
        second = send_due_payment_warnings()
        self.assertEqual(second["sent"], 0)
        self.assertEqual(send_mock.call_count, 1)


@override_settings(**{**STRIPE_TEST_SETTINGS, "STRIPE_SECRET_KEY": ""})
class BillingConfigErrorTests(TestCase):
    def setUp(self):
        self.owner = create_user("cfg-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        simulate_migrated_existing_workspace(self.org)
        self.api = login_owner(APIClient(), "cfg-owner@example.com")

    def test_missing_stripe_key_returns_controlled_error(self):
        response = self.api.post(
            "/api/billing/checkout/",
            {"plan": "plus", "interval": "monthly"},
            format="json",
        )
        self.assertEqual(response.status_code, 503)
        self.assertIn("code", response.data)
