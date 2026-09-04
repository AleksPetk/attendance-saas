"""Commercial subscription-selection rules (not effective_plan / builtin trial).

Uses BILLING_PROVIDER=fake. Does not touch live Stripe.
"""

from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from billing.fake_provider import get_fake_provider
from billing.models import BillingStatus, PurchaseSource
from billing.operations import (
    request_cancellation,
    request_schedule_billing_change,
    start_paid_checkout,
)
from billing.promotion import (
    AUDIENCE_BASIC,
    AUDIENCE_BUSINESS_MONTHLY,
    AUDIENCE_PLUS_MONTHLY,
    resolve_audience,
)
from billing.services import record_deferred_paid_start, schedule_cancellation
from billing.snapshots import SubscriptionSnapshot
from billing.state import build_billing_state
from billing.testing import simulate_migrated_existing_workspace
from organizations.entitlements.transitions import apply_effective_plan
from organizations.models import Organization, OrganizationPlan

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


def _owner(email):
    user = User.objects.create_user(email=email, password="secure-password")
    user.mark_email_verified()
    return user


def _deferred(org, *, plan="plus", interval="monthly"):
    now = timezone.now()
    return record_deferred_paid_start(
        org,
        subscribed_plan=plan,
        billing_interval=interval,
        purchase_source=PurchaseSource.STRIPE,
        trial_started_at=now,
        trial_ends_at=now + timedelta(days=7),
        external_customer_id=f"cus_{org.pk}",
        external_subscription_id=f"sub_{org.pk}_{plan}_{interval}",
        currency="usd",
        now=now,
    )


def _seed_fake_sub(billing, *, price_id, cancel_at_period_end=False):
    fake = get_fake_provider()
    fake.subscriptions[billing.external_subscription_id] = SubscriptionSnapshot(
        subscription_id=billing.external_subscription_id,
        customer_id=billing.external_customer_id,
        status="trialing",
        price_id=price_id,
        cancel_at_period_end=cancel_at_period_end,
        current_period_start=billing.current_period_start,
        current_period_end=billing.current_period_end,
        trial_start=billing.trial_started_at,
        trial_end=billing.trial_ends_at,
        metadata={},
    )
    return fake


@override_settings(**STRIPE_TEST_SETTINGS)
class CommercialSelectionStateTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = _owner("commercial-sel@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        simulate_migrated_existing_workspace(self.org)

    def test_basic_allows_checkout(self):
        state = build_billing_state(self.org)
        self.assertTrue(state["actions"]["can_checkout_plus"])
        self.assertTrue(state["actions"]["can_checkout_business"])
        self.assertFalse(state["actions"]["can_upgrade_to_business"])
        self.assertFalse(state["actions"]["can_schedule_downgrade_to_plus"])

    def test_builtin_trial_alone_still_allows_checkout_not_highest_commercial(self):
        apply_effective_plan(
            self.org, OrganizationPlan.BUSINESS, source="test.builtin"
        )
        self.org.refresh_from_db()
        state = build_billing_state(self.org)
        self.assertEqual(state["effective_plan"]["key"], "business")
        self.assertIsNone(state["subscribed_plan"]["key"])
        self.assertTrue(state["actions"]["can_checkout_plus"])
        self.assertTrue(state["actions"]["can_checkout_business"])
        self.assertFalse(state["actions"]["can_upgrade_to_business"])

    def test_trialing_plus_monthly_allows_commercial_changes(self):
        apply_effective_plan(
            self.org, OrganizationPlan.BUSINESS, source="test.builtin"
        )
        _deferred(self.org, plan="plus", interval="monthly")
        state = build_billing_state(self.org)
        self.assertEqual(state["subscribed_plan"]["key"], "plus")
        self.assertEqual(state["status"], BillingStatus.TRIALING)
        self.assertFalse(state["actions"]["can_checkout_plus"])
        self.assertTrue(state["actions"]["can_schedule_billing_change"])
        self.assertTrue(state["actions"]["can_change_interval"])
        self.assertTrue(state["actions"]["can_upgrade_to_business"])
        self.assertTrue(state["actions"]["can_cancel"])
        self.assertFalse(state["actions"]["can_schedule_downgrade_to_plus"])

    def test_trialing_business_allows_downgrade_and_interval_change(self):
        apply_effective_plan(
            self.org, OrganizationPlan.BUSINESS, source="test.builtin"
        )
        _deferred(self.org, plan="business", interval="yearly")
        state = build_billing_state(self.org)
        self.assertTrue(state["actions"]["can_schedule_billing_change"])
        self.assertTrue(state["actions"]["can_schedule_downgrade_to_plus"])
        self.assertTrue(state["actions"]["can_change_interval"])
        self.assertFalse(state["actions"]["can_upgrade_to_business"])
        self.assertFalse(state["actions"]["can_checkout_plus"])

    def test_cancelled_during_trialing_allows_checkout_reselection(self):
        apply_effective_plan(
            self.org, OrganizationPlan.BUSINESS, source="test.builtin"
        )
        billing = _deferred(self.org, plan="plus", interval="monthly")
        schedule_cancellation(self.org, effective_at=billing.trial_ends_at)
        state = build_billing_state(self.org)
        self.assertTrue(state["cancel_at_period_end"])
        self.assertTrue(state["actions"]["can_checkout_plus"])
        self.assertTrue(state["actions"]["can_checkout_business"])
        self.assertTrue(state["actions"]["can_resume_subscription"])
        self.assertFalse(state["actions"]["can_schedule_billing_change"])
        self.assertFalse(state["actions"]["can_upgrade_to_business"])

    def test_schedule_plus_yearly_to_monthly_while_trialing(self):
        apply_effective_plan(
            self.org, OrganizationPlan.BUSINESS, source="test.builtin"
        )
        billing = _deferred(self.org, plan="plus", interval="yearly")
        _seed_fake_sub(billing, price_id="price_plus_yearly")
        updated = request_schedule_billing_change(
            self.org, plan="plus", interval="monthly"
        )
        self.assertEqual(updated.pending_plan, "plus")
        self.assertEqual(updated.pending_interval, "monthly")

    def test_schedule_business_yearly_to_monthly(self):
        apply_effective_plan(
            self.org, OrganizationPlan.BUSINESS, source="test.builtin"
        )
        billing = _deferred(self.org, plan="business", interval="yearly")
        _seed_fake_sub(billing, price_id="price_business_yearly")
        updated = request_schedule_billing_change(
            self.org, plan="business", interval="monthly"
        )
        self.assertEqual(updated.pending_plan, "business")
        self.assertEqual(updated.pending_interval, "monthly")

    def test_schedule_business_to_plus_downgrade(self):
        apply_effective_plan(
            self.org, OrganizationPlan.BUSINESS, source="test.builtin"
        )
        billing = _deferred(self.org, plan="business", interval="monthly")
        _seed_fake_sub(billing, price_id="price_business_monthly")
        updated = request_schedule_billing_change(
            self.org, plan="plus", interval="monthly"
        )
        self.assertEqual(updated.pending_plan, "plus")
        self.assertEqual(updated.pending_interval, "monthly")

    def test_retarget_cancelled_trialing_does_not_create_second_checkout(self):
        apply_effective_plan(
            self.org, OrganizationPlan.BUSINESS, source="test.builtin"
        )
        billing = _deferred(self.org, plan="plus", interval="monthly")
        fake = _seed_fake_sub(
            billing, price_id="price_plus_monthly", cancel_at_period_end=True
        )
        schedule_cancellation(self.org, effective_at=billing.trial_ends_at)
        result = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        self.assertEqual(result.mode, "resumed")
        self.assertFalse(result.checkout_url)
        self.assertEqual(len(fake.checkouts), 0)
        billing.refresh_from_db()
        self.assertFalse(billing.cancel_at_period_end)

    def test_retarget_cancelled_trialing_schedules_other_plan(self):
        apply_effective_plan(
            self.org, OrganizationPlan.BUSINESS, source="test.builtin"
        )
        billing = _deferred(self.org, plan="plus", interval="monthly")
        fake = _seed_fake_sub(
            billing, price_id="price_plus_monthly", cancel_at_period_end=True
        )
        schedule_cancellation(self.org, effective_at=billing.trial_ends_at)
        result = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="yearly"
        )
        self.assertEqual(result.mode, "scheduled")
        self.assertEqual(len(fake.checkouts), 0)
        billing.refresh_from_db()
        self.assertFalse(billing.cancel_at_period_end)
        self.assertEqual(billing.pending_interval, "yearly")

    def test_promotion_audience_uses_subscribed_not_effective(self):
        apply_effective_plan(
            self.org, OrganizationPlan.BUSINESS, source="test.builtin"
        )
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_BASIC)
        _deferred(self.org, plan="plus", interval="monthly")
        self.assertEqual(
            resolve_audience(organization=self.org), AUDIENCE_PLUS_MONTHLY
        )
        _deferred(self.org, plan="business", interval="monthly")
        self.assertEqual(
            resolve_audience(organization=self.org), AUDIENCE_BUSINESS_MONTHLY
        )

    def test_cancelled_trialing_subscription_returns_basic_audience(self):
        apply_effective_plan(
            self.org, OrganizationPlan.BUSINESS, source="test.builtin"
        )
        billing = _deferred(self.org, plan="plus", interval="monthly")
        schedule_cancellation(self.org, effective_at=billing.trial_ends_at)
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_BASIC)
        billing = _deferred(self.org, plan="business", interval="yearly")
        schedule_cancellation(self.org, effective_at=billing.trial_ends_at)
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_BASIC)


@override_settings(**STRIPE_TEST_SETTINGS)
class CommercialSelectionApiTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = _owner("commercial-api@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        simulate_migrated_existing_workspace(self.org)
        self.api = APIClient()
        self.api.force_authenticate(user=self.owner)

    def test_checkout_retarget_returns_billing_without_url(self):
        apply_effective_plan(
            self.org, OrganizationPlan.BUSINESS, source="test.builtin"
        )
        billing = _deferred(self.org, plan="business", interval="monthly")
        fake = _seed_fake_sub(
            billing, price_id="price_business_monthly", cancel_at_period_end=True
        )
        request_cancellation(self.org)
        response = self.api.post(
            "/api/billing/checkout/",
            {"plan": "business", "interval": "yearly"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["mode"], "scheduled")
        self.assertIsNone(response.data["checkout_url"])
        self.assertIn("billing", response.data)
        self.assertEqual(response.data["billing"]["pending_interval"], "yearly")
        self.assertEqual(len(fake.checkouts), 0)
