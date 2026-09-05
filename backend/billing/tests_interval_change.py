"""Scheduled billing interval and combined plan+interval change tests."""

from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from billing.fake_provider import get_fake_provider
from billing.models import BillingStatus, PurchaseSource, WorkspaceSubscription
from billing.services import (
    activate_paid_subscription,
    apply_due_billing_transitions,
    get_workspace_billing,
    schedule_billing_change,
)
from billing.tests_phase2 import STRIPE_TEST_SETTINGS, create_user, login_owner
from billing.testing import simulate_migrated_existing_workspace
from organizations.models import Organization, OrganizationPlan


@override_settings(**STRIPE_TEST_SETTINGS)
class BillingIntervalChangeTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = create_user("interval-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        simulate_migrated_existing_workspace(self.org)
        self.api = login_owner(APIClient(), "interval-owner@example.com")

    def _activate(self, *, plan="plus", interval="monthly"):
        fake = get_fake_provider()
        checkout = fake.create_checkout_session(
            organization=self.org,
            owner=self.owner,
            plan_key=plan,
            interval=interval,
            success_url="http://localhost/s",
            cancel_url="http://localhost/c",
        )
        snapshot = fake.complete_checkout(checkout.session_id)
        activate_paid_subscription(
            self.org,
            subscribed_plan=plan,
            billing_interval=interval,
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=snapshot.current_period_start,
            current_period_end=snapshot.current_period_end,
            external_customer_id=snapshot.customer_id,
            external_subscription_id=snapshot.subscription_id,
        )
        self.org.refresh_from_db()
        return get_workspace_billing(self.org)

    def test_plus_monthly_to_plus_yearly_schedules_at_period_end(self):
        billing = self._activate(plan="plus", interval="monthly")
        response = self.api.post(
            "/api/billing/change/schedule/",
            {"plan": "plus", "interval": "yearly"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        billing.refresh_from_db()
        self.assertEqual(billing.subscribed_plan, "plus")
        self.assertEqual(billing.billing_interval, "monthly")
        self.assertEqual(billing.pending_plan, "plus")
        self.assertEqual(billing.pending_interval, "yearly")
        self.assertIsNotNone(billing.pending_change_effective_at)
        fake = get_fake_provider()
        self.assertEqual(len(fake.schedule_change_calls), 1)

    def test_plus_yearly_to_plus_monthly_schedules(self):
        self._activate(plan="plus", interval="yearly")
        response = self.api.post(
            "/api/billing/change/schedule/",
            {"plan": "plus", "interval": "monthly"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.pending_interval, "monthly")
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)

    def test_business_interval_change_schedules(self):
        self._activate(plan="business", interval="monthly")
        response = self.api.post(
            "/api/billing/change/schedule/",
            {"plan": "business", "interval": "yearly"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.pending_plan, "business")
        self.assertEqual(billing.pending_interval, "yearly")

    def test_combined_plus_monthly_to_business_yearly(self):
        self._activate(plan="plus", interval="monthly")
        response = self.api.post(
            "/api/billing/change/schedule/",
            {"plan": "business", "interval": "yearly"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.pending_plan, "business")
        self.assertEqual(billing.pending_interval, "yearly")

    def test_interval_only_transition_leaves_organization_plan_unchanged_until_due(self):
        billing = self._activate(plan="plus", interval="monthly")
        period_end = billing.current_period_end
        schedule_billing_change(
            self.org,
            target_plan="plus",
            target_interval="yearly",
            effective_at=period_end,
        )
        apply_due_billing_transitions(self.org, now=period_end + timedelta(seconds=1))
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.billing_interval, "yearly")
        self.assertEqual(billing.pending_plan, "")
        self.assertEqual(billing.pending_interval, "")

    def test_combined_transition_applies_business_at_due(self):
        billing = self._activate(plan="plus", interval="monthly")
        period_end = billing.current_period_end
        schedule_billing_change(
            self.org,
            target_plan="business",
            target_interval="yearly",
            effective_at=period_end,
        )
        apply_due_billing_transitions(self.org, now=period_end + timedelta(seconds=1))
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.subscribed_plan, "business")
        self.assertEqual(billing.billing_interval, "yearly")

    def test_cancel_scheduled_interval_change(self):
        self._activate(plan="plus", interval="monthly")
        self.api.post(
            "/api/billing/change/schedule/",
            {"plan": "plus", "interval": "yearly"},
            format="json",
        )
        cancel = self.api.post("/api/billing/downgrade/cancel/", {}, format="json")
        self.assertEqual(cancel.status_code, 200)
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.pending_interval, "")
        self.assertEqual(billing.pending_plan, "")

    def test_repeated_cancel_scheduled_change_is_safe(self):
        self._activate(plan="plus", interval="monthly")
        self.api.post(
            "/api/billing/change/schedule/",
            {"plan": "business", "interval": "yearly"},
            format="json",
        )
        first = self.api.post("/api/billing/downgrade/cancel/", {}, format="json")
        self.assertEqual(first.status_code, 200)
        second = self.api.post("/api/billing/downgrade/cancel/", {}, format="json")
        self.assertEqual(second.status_code, 200)
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.pending_plan, "")
        self.assertEqual(billing.pending_interval, "")

    def test_same_interval_upgrade_still_rejected_by_schedule_endpoint(self):
        self._activate(plan="plus", interval="monthly")
        response = self.api.post(
            "/api/billing/change/schedule/",
            {"plan": "business", "interval": "monthly"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "use_immediate_upgrade")

    def test_apple_source_blocked(self):
        billing = self._activate(plan="plus", interval="monthly")
        billing.purchase_source = PurchaseSource.APPLE
        billing.save(update_fields=["purchase_source", "updated_at"])
        response = self.api.post(
            "/api/billing/change/schedule/",
            {"plan": "plus", "interval": "yearly"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "purchase_source_not_stripe")

    def test_provider_failure_preserves_state(self):
        self._activate(plan="plus", interval="monthly")
        fake = get_fake_provider()
        fake.fail_next_schedule_change = True
        response = self.api.post(
            "/api/billing/change/schedule/",
            {"plan": "plus", "interval": "yearly"},
            format="json",
        )
        self.assertEqual(response.status_code, 502)
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.pending_interval, "")

    def test_can_change_interval_true_for_active_plus(self):
        self._activate(plan="plus", interval="monthly")
        state = self.api.get("/api/billing/").data
        self.assertTrue(state["actions"]["can_change_interval"])

    def test_unauthenticated_blocked(self):
        self._activate(plan="plus", interval="monthly")
        anon = APIClient()
        response = anon.post(
            "/api/billing/change/schedule/",
            {"plan": "plus", "interval": "yearly"},
            format="json",
        )
        # Unauthenticated SPA requests are coerced to 403 (no WWW-Authenticate).
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


@override_settings(**STRIPE_TEST_SETTINGS)
class BusinessDowngradeIntervalPreservationTests(TestCase):
    """Regression: Business yearly → Plus yearly must not become monthly."""

    def setUp(self):
        get_fake_provider().reset()
        self.owner = create_user("downgrade-interval@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        simulate_migrated_existing_workspace(self.org)
        self.api = login_owner(APIClient(), "downgrade-interval@example.com")

    def _activate(self, *, plan="business", interval="yearly"):
        fake = get_fake_provider()
        checkout = fake.create_checkout_session(
            organization=self.org,
            owner=self.owner,
            plan_key=plan,
            interval=interval,
            success_url="http://localhost/s",
            cancel_url="http://localhost/c",
        )
        snapshot = fake.complete_checkout(checkout.session_id)
        activate_paid_subscription(
            self.org,
            subscribed_plan=plan,
            billing_interval=interval,
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=snapshot.current_period_start,
            current_period_end=snapshot.current_period_end,
            external_customer_id=snapshot.customer_id,
            external_subscription_id=snapshot.subscription_id,
        )
        self.org.refresh_from_db()
        return get_workspace_billing(self.org)

    def test_business_yearly_to_plus_yearly_preserves_interval(self):
        billing = self._activate(plan="business", interval="yearly")
        response = self.api.post(
            "/api/billing/downgrade/",
            {"interval": "yearly"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["pending_plan"], "plus")
        self.assertEqual(response.data["pending_interval"], "yearly")
        self.assertEqual(response.data["interval"], "yearly")
        self.assertEqual(response.data["scheduled_change"]["kind"], "downgrade")
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
        billing.refresh_from_db()
        self.assertEqual(billing.subscribed_plan, "business")
        self.assertEqual(billing.billing_interval, "yearly")
        self.assertEqual(billing.pending_plan, "plus")
        self.assertEqual(billing.pending_interval, "yearly")
        fake = get_fake_provider()
        self.assertEqual(len(fake.schedule_change_calls), 1)
        self.assertEqual(fake.schedule_change_calls[0]["target_plan"], "plus")
        self.assertEqual(fake.schedule_change_calls[0]["target_interval"], "yearly")
        self.assertEqual(
            fake.scheduled_downgrades[billing.external_subscription_id]["target_interval"],
            "yearly",
        )

    def test_business_monthly_to_plus_monthly_preserves_interval(self):
        self._activate(plan="business", interval="monthly")
        response = self.api.post(
            "/api/billing/downgrade/",
            {"interval": "monthly"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["pending_interval"], "monthly")
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.pending_interval, "monthly")
        fake = get_fake_provider()
        self.assertEqual(fake.schedule_change_calls[0]["target_interval"], "monthly")

    def test_business_yearly_to_plus_monthly_uses_schedule_change(self):
        self._activate(plan="business", interval="yearly")
        wrong = self.api.post(
            "/api/billing/downgrade/",
            {"interval": "monthly"},
            format="json",
        )
        self.assertEqual(wrong.status_code, 400)
        self.assertEqual(wrong.data["code"], "use_schedule_billing_change")
        response = self.api.post(
            "/api/billing/change/schedule/",
            {"plan": "plus", "interval": "monthly"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["pending_plan"], "plus")
        self.assertEqual(response.data["pending_interval"], "monthly")
        self.assertEqual(response.data["interval"], "yearly")
        self.assertEqual(response.data["scheduled_change"]["kind"], "combined")
        fake = get_fake_provider()
        self.assertEqual(fake.schedule_change_calls[0]["target_interval"], "monthly")

    def test_cancel_clears_pending_interval_after_yearly_downgrade(self):
        self._activate(plan="business", interval="yearly")
        self.api.post("/api/billing/downgrade/", {"interval": "yearly"}, format="json")
        cancel = self.api.post("/api/billing/downgrade/cancel/", {}, format="json")
        self.assertEqual(cancel.status_code, 200)
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.pending_plan, "")
        self.assertEqual(billing.pending_interval, "")
        self.assertIsNone(billing.pending_change_effective_at)
        self.assertEqual(billing.billing_interval, "yearly")
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
