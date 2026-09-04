"""Built-in Business trial: deferred future paid selection (commercially Basic).

Uses BILLING_PROVIDER=fake. Does not touch live Stripe.
"""

from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from billing.exceptions import BillingStateError
from billing.fake_provider import get_fake_provider
from billing.models import BillingStatus, PurchaseSource
from billing.operations import (
    apply_upgrade_to_business,
    clear_deferred_trial_selection,
    request_cancellation,
    request_resume_subscription,
    request_schedule_billing_change,
    start_paid_checkout,
)
from billing.promotion import AUDIENCE_BASIC, AUDIENCE_PLUS_MONTHLY, resolve_audience
from billing.reconciliation import reconcile_subscription_snapshot
from billing.services import get_workspace_billing, record_deferred_paid_start
from billing.snapshots import SubscriptionSnapshot
from billing.state import build_billing_state
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


def _seed_deferred(org, *, plan="plus", interval="monthly"):
    """Record a deferred Stripe selection aligned to the builtin trial end."""
    trial = org.builtin_trial
    now = timezone.now()
    billing = record_deferred_paid_start(
        org,
        subscribed_plan=plan,
        billing_interval=interval,
        purchase_source=PurchaseSource.STRIPE,
        trial_started_at=now,
        trial_ends_at=trial.ends_at,
        external_customer_id=f"cus_{org.pk}",
        external_subscription_id=f"sub_{org.pk}_{plan}_{interval}",
        currency="usd",
        now=now,
    )
    fake = get_fake_provider()
    fake.subscriptions[billing.external_subscription_id] = SubscriptionSnapshot(
        subscription_id=billing.external_subscription_id,
        customer_id=billing.external_customer_id,
        status="trialing",
        price_id=f"price_{plan}_{interval}",
        cancel_at_period_end=False,
        current_period_start=billing.current_period_start,
        current_period_end=billing.trial_ends_at,
        trial_start=billing.trial_started_at,
        trial_end=billing.trial_ends_at,
        metadata={},
    )
    return billing, fake


@override_settings(**STRIPE_TEST_SETTINGS)
class BuiltinTrialSelectionTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = _owner("trial-selection@example.com")
        # Fresh org keeps the write-once built-in Business trial.
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.org.refresh_from_db()
        self.assertTrue(self.org.builtin_trial.ends_at > timezone.now())
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)

    def test_1_builtin_trial_no_plan_is_basic_with_four_choices(self):
        state = build_billing_state(self.org)
        self.assertTrue(state["builtin_trial"]["active"])
        self.assertIsNone(state["subscribed_plan"]["key"])
        self.assertIsNone(state["future_paid_plan"])
        self.assertTrue(state["actions"]["can_checkout_plus"])
        self.assertTrue(state["actions"]["can_checkout_business"])
        self.assertFalse(state["actions"]["can_upgrade_to_business"])
        self.assertFalse(state["actions"]["can_resume_subscription"])
        self.assertFalse(state["actions"]["can_schedule_billing_change"])
        self.assertFalse(state["actions"]["can_cancel"])
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_BASIC)

    def test_2_select_plus_monthly_stays_commercially_basic_and_trialing(self):
        billing, fake = _seed_deferred(self.org, plan="plus", interval="monthly")
        trial_end = billing.trial_ends_at
        state = build_billing_state(self.org)
        self.assertIsNone(state["subscribed_plan"]["key"])
        self.assertEqual(state["future_paid_plan"]["key"], "plus")
        self.assertEqual(state["future_paid_plan"]["interval"], "monthly")
        self.assertTrue(state["actions"]["can_checkout_plus"])
        self.assertTrue(state["actions"]["can_cancel"])
        self.assertFalse(state["actions"]["can_upgrade_to_business"])
        self.assertFalse(state["cancel_at_period_end"])
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_BASIC)
        snap = fake.subscriptions[billing.external_subscription_id]
        self.assertEqual(snap.status, "trialing")
        self.assertEqual(snap.trial_end, trial_end)

    def test_3_change_plus_monthly_to_business_yearly_preserves_trial_end(self):
        billing, fake = _seed_deferred(self.org, plan="plus", interval="monthly")
        trial_end = billing.trial_ends_at
        result = start_paid_checkout(
            self.org, self.owner, plan_key="business", interval="yearly"
        )
        self.assertEqual(result.mode, "deferred_retargeted")
        self.assertEqual(len(fake.checkouts), 0)
        billing.refresh_from_db()
        self.assertEqual(billing.subscribed_plan, "business")
        self.assertEqual(billing.billing_interval, "yearly")
        self.assertEqual(billing.status, BillingStatus.TRIALING)
        self.assertEqual(billing.trial_ends_at, trial_end)
        snap = fake.subscriptions[billing.external_subscription_id]
        self.assertEqual(snap.status, "trialing")
        self.assertEqual(snap.trial_end, trial_end)
        self.assertEqual(snap.price_id, "price_business_yearly")
        self.assertFalse(any(True for _ in fake.upgrade_calls))
        retargets = [
            c for c in fake.schedule_change_calls if c.get("kind") == "deferred_retarget"
        ]
        self.assertEqual(len(retargets), 1)
        self.assertEqual(retargets[0]["trial_end"], trial_end)
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_BASIC)
        state = build_billing_state(self.org)
        self.assertEqual(state["future_paid_plan"]["key"], "business")
        self.assertEqual(state["future_paid_plan"]["interval"], "yearly")

    def test_4_change_business_yearly_to_plus_yearly_preserves_trial_end(self):
        billing, fake = _seed_deferred(self.org, plan="business", interval="yearly")
        trial_end = billing.trial_ends_at
        result = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="yearly"
        )
        self.assertEqual(result.mode, "deferred_retargeted")
        billing.refresh_from_db()
        self.assertEqual(billing.subscribed_plan, "plus")
        self.assertEqual(billing.billing_interval, "yearly")
        self.assertEqual(billing.trial_ends_at, trial_end)
        snap = fake.subscriptions[billing.external_subscription_id]
        self.assertEqual(snap.status, "trialing")
        self.assertEqual(snap.trial_end, trial_end)

    def test_5_cancel_future_plan_clears_selection_no_resume(self):
        billing, fake = _seed_deferred(self.org, plan="plus", interval="monthly")
        sub_id = billing.external_subscription_id
        updated = request_cancellation(self.org)
        self.assertEqual(updated.status, BillingStatus.CANCELED)
        self.assertEqual(updated.subscribed_plan, "")
        self.assertFalse(updated.cancel_at_period_end)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
        state = build_billing_state(self.org)
        self.assertIsNone(state["future_paid_plan"])
        self.assertTrue(state["actions"]["can_checkout_plus"])
        self.assertTrue(state["actions"]["can_checkout_business"])
        self.assertFalse(state["actions"]["can_resume_subscription"])
        self.assertFalse(state["actions"]["can_cancel"])
        self.assertFalse(state["cancel_at_period_end"])
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_BASIC)
        self.assertIn(("immediate", sub_id), fake.cancel_calls)

    def test_6_choose_again_after_cancel_uses_checkout_not_duplicate_retarget(self):
        billing, fake = _seed_deferred(self.org, plan="plus", interval="monthly")
        clear_deferred_trial_selection(self.org)
        result = start_paid_checkout(
            self.org, self.owner, plan_key="business", interval="monthly"
        )
        self.assertEqual(result.mode, "checkout")
        self.assertTrue(result.checkout_url)
        self.assertEqual(len(fake.checkouts), 1)
        session = fake.checkouts[result.session_id]
        self.assertEqual(session["billing_start_at"], self.org.builtin_trial.ends_at)
        # Completing checkout creates exactly one new trialing subscription.
        snap = fake.complete_checkout(result.session_id)
        reconcile_subscription_snapshot(self.org, snap)
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.status, BillingStatus.TRIALING)
        self.assertEqual(billing.subscribed_plan, "business")
        self.assertEqual(len(fake.subscriptions), 2)  # old canceled + new

    def test_7_trial_end_never_shortened_by_plan_change(self):
        billing, fake = _seed_deferred(self.org, plan="plus", interval="monthly")
        original_end = billing.trial_ends_at
        earlier = original_end - timedelta(days=3)
        # Even if local state were wrong, retarget uses builtin trial end.
        start_paid_checkout(self.org, self.owner, plan_key="plus", interval="yearly")
        billing.refresh_from_db()
        self.assertEqual(billing.trial_ends_at, original_end)
        snap = fake.subscriptions[billing.external_subscription_id]
        self.assertEqual(snap.trial_end, original_end)
        self.assertGreater(snap.trial_end, earlier)

    def test_8_no_billing_cycle_anchor_now_and_no_immediate_upgrade(self):
        _seed_deferred(self.org, plan="plus", interval="monthly")
        with self.assertRaises(BillingStateError) as ctx:
            apply_upgrade_to_business(self.org)
        self.assertEqual(ctx.exception.code, "builtin_trial_deferred_only")
        with self.assertRaises(BillingStateError) as ctx2:
            request_schedule_billing_change(
                self.org, plan="business", interval="yearly"
            )
        self.assertEqual(ctx2.exception.code, "builtin_trial_deferred_only")
        with self.assertRaises(BillingStateError) as ctx3:
            request_resume_subscription(self.org)
        self.assertEqual(ctx3.exception.code, "builtin_trial_no_resume")

    def test_9_no_nonzero_invoice_due_before_trial_end(self):
        billing, fake = _seed_deferred(self.org, plan="plus", interval="monthly")
        start_paid_checkout(
            self.org, self.owner, plan_key="business", interval="monthly"
        )
        # Fake provider never seeds invoices on deferred retarget.
        invoices = fake.list_invoices(customer_id=billing.external_customer_id)
        self.assertEqual(invoices, [])
        snap = fake.subscriptions[billing.external_subscription_id]
        self.assertEqual(snap.status, "trialing")
        self.assertEqual(snap.trial_end, self.org.builtin_trial.ends_at)

    def test_10_after_builtin_trial_expires_paid_behavior_works(self):
        billing, fake = _seed_deferred(self.org, plan="plus", interval="monthly")
        trial = self.org.builtin_trial
        # Mark builtin trial consumed/expired without rewriting the window.
        trial.expired_at = timezone.now()
        trial.save(update_fields=["expired_at", "updated_at"])
        self.org.refresh_from_db()
        # Stripe still trialing — commercially changeable.
        state = build_billing_state(self.org)
        self.assertFalse(state["builtin_trial"]["active"])
        self.assertEqual(state["subscribed_plan"]["key"], "plus")
        self.assertTrue(state["actions"]["can_upgrade_to_business"])
        self.assertTrue(state["actions"]["can_schedule_billing_change"])
        self.assertFalse(state["actions"]["can_checkout_plus"])
        self.assertEqual(
            resolve_audience(organization=self.org), AUDIENCE_PLUS_MONTHLY
        )
        apply_upgrade_to_business(self.org)
        billing.refresh_from_db()
        self.assertEqual(billing.subscribed_plan, "business")

    def test_same_selection_returns_unchanged(self):
        _seed_deferred(self.org, plan="plus", interval="monthly")
        result = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        self.assertEqual(result.mode, "deferred_unchanged")


@override_settings(**STRIPE_TEST_SETTINGS)
class BuiltinTrialSelectionApiTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = _owner("trial-selection-api@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.api = APIClient()
        self.api.force_authenticate(user=self.owner)

    def test_checkout_retarget_returns_billing_without_url(self):
        billing, fake = _seed_deferred(self.org, plan="plus", interval="monthly")
        response = self.api.post(
            "/api/billing/checkout/",
            {"plan": "business", "interval": "yearly"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["mode"], "deferred_retargeted")
        self.assertIsNone(response.data["checkout_url"])
        self.assertIn("billing", response.data)
        self.assertEqual(
            response.data["billing"]["future_paid_plan"]["key"], "business"
        )
        self.assertIsNone(response.data["billing"]["subscribed_plan"]["key"])
        self.assertEqual(len(fake.checkouts), 0)

    def test_cancel_clears_future_selection(self):
        _seed_deferred(self.org, plan="business", interval="monthly")
        response = self.api.post("/api/billing/cancel/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        state = response.data
        self.assertIsNone(state.get("future_paid_plan"))
        self.assertFalse(state["actions"]["can_resume_subscription"])
        self.assertTrue(state["actions"]["can_checkout_plus"])
