"""M6: durable CheckoutAttempt + Stripe idempotency recovery."""

from __future__ import annotations

import threading
from datetime import timedelta
from unittest import mock

from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from billing.checkout_attempts import _persist_open_session, claim_checkout_attempt
from billing.exceptions import BillingStateError, StripeProviderError
from billing.fake_provider import get_fake_provider
from billing.models import (
    BillingStatus,
    CheckoutAttemptStatus,
    PurchaseSource,
    WorkspaceCheckoutAttempt,
)
from billing.operations import start_paid_checkout
from billing.reconciliation import reconcile_subscription_snapshot
from billing.services import get_workspace_billing
from billing.testing import simulate_migrated_existing_workspace
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


def _owner_org(email):
    user = User.objects.create_user(email=email, password="secure-password")
    user.mark_email_verified()
    org = Organization.objects.create_with_owner(owner=user)
    simulate_migrated_existing_workspace(org)
    return user, org


@override_settings(**STRIPE_TEST_SETTINGS)
class DurableCheckoutAttemptTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner, self.org = _owner_org("checkout-durable@example.com")

    def test_normal_single_checkout(self):
        result = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        self.assertEqual(result.mode, "checkout")
        self.assertTrue(result.session_id)
        attempt = WorkspaceCheckoutAttempt.objects.get(organization=self.org)
        self.assertEqual(attempt.status, CheckoutAttemptStatus.OPEN)
        self.assertEqual(attempt.stripe_session_id, result.session_id)
        self.assertTrue(attempt.idempotency_key.startswith("checkstation-checkout-"))
        self.assertEqual(len(get_fake_provider().checkouts), 1)

    def test_same_plan_reuses_open_session(self):
        first = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        second = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        self.assertEqual(first.session_id, second.session_id)
        self.assertEqual(WorkspaceCheckoutAttempt.objects.filter(organization=self.org).count(), 1)
        self.assertEqual(len(get_fake_provider().checkouts), 1)

    def test_missing_session_id_recovers_with_same_idempotency_key(self):
        first = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        attempt = WorkspaceCheckoutAttempt.objects.get(organization=self.org)
        key = attempt.idempotency_key
        attempt.stripe_session_id = ""
        attempt.checkout_url = ""
        attempt.status = CheckoutAttemptStatus.PENDING
        attempt.save(
            update_fields=["stripe_session_id", "checkout_url", "status", "updated_at"]
        )
        second = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        self.assertEqual(first.session_id, second.session_id)
        attempt.refresh_from_db()
        self.assertEqual(attempt.idempotency_key, key)
        self.assertEqual(len(get_fake_provider().checkouts), 1)

    def test_stripe_success_local_persist_failure_then_retry_same_key(self):
        calls = {"n": 0}
        real_persist = _persist_open_session

        def flaky_persist(attempt, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("simulated db failure after Stripe success")
            return real_persist(attempt, **kwargs)

        with mock.patch(
            "billing.checkout_attempts._persist_open_session",
            side_effect=flaky_persist,
        ):
            with self.assertRaises(RuntimeError):
                start_paid_checkout(
                    self.org, self.owner, plan_key="plus", interval="monthly"
                )
        attempt = WorkspaceCheckoutAttempt.objects.get(organization=self.org)
        self.assertEqual(attempt.status, CheckoutAttemptStatus.PENDING)
        self.assertEqual(attempt.stripe_session_id, "")
        key = attempt.idempotency_key
        self.assertEqual(len(get_fake_provider().checkouts), 1)

        result = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        attempt.refresh_from_db()
        self.assertEqual(attempt.idempotency_key, key)
        self.assertEqual(attempt.stripe_session_id, result.session_id)
        self.assertEqual(attempt.status, CheckoutAttemptStatus.OPEN)
        self.assertEqual(len(get_fake_provider().checkouts), 1)

    def test_stripe_transport_error_keeps_attempt_for_retry(self):
        fake = get_fake_provider()
        fake.fail_next_checkout = True
        with self.assertRaises(StripeProviderError):
            start_paid_checkout(
                self.org, self.owner, plan_key="plus", interval="monthly"
            )
        attempt = WorkspaceCheckoutAttempt.objects.get(organization=self.org)
        self.assertEqual(attempt.status, CheckoutAttemptStatus.PENDING)
        key = attempt.idempotency_key
        result = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        attempt.refresh_from_db()
        self.assertEqual(attempt.idempotency_key, key)
        self.assertEqual(attempt.stripe_session_id, result.session_id)
        self.assertEqual(len(fake.checkouts), 1)

    def test_expired_stripe_session_allows_new_attempt(self):
        first = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        fake = get_fake_provider()
        fake.expire_checkout_session(first.session_id)
        second = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        self.assertNotEqual(first.session_id, second.session_id)
        statuses = list(
            WorkspaceCheckoutAttempt.objects.filter(organization=self.org)
            .order_by("id")
            .values_list("status", flat=True)
        )
        self.assertIn(CheckoutAttemptStatus.EXPIRED, statuses)
        self.assertIn(CheckoutAttemptStatus.OPEN, statuses)
        self.assertEqual(len(fake.checkouts), 2)

    def test_different_plan_replaces_open_session(self):
        first = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        second = start_paid_checkout(
            self.org, self.owner, plan_key="business", interval="yearly"
        )
        self.assertNotEqual(first.session_id, second.session_id)
        self.assertTrue(get_fake_provider().checkouts[first.session_id].get("expired"))
        open_attempt = WorkspaceCheckoutAttempt.objects.get(
            organization=self.org, status=CheckoutAttemptStatus.OPEN
        )
        self.assertEqual(open_attempt.plan_key, "business")
        self.assertEqual(open_attempt.stripe_session_id, second.session_id)

    def test_completed_session_delayed_webhook_does_not_create_second_checkout(self):
        first = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        fake = get_fake_provider()
        snapshot = fake.complete_checkout(first.session_id)
        # Local commercial state still unpaid (webhook delayed).
        billing = get_workspace_billing(self.org)
        self.assertTrue(
            billing is None
            or (
                billing.status == BillingStatus.NONE
                and not (billing.external_subscription_id or "").strip()
            )
        )
        result = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        self.assertEqual(result.mode, "checkout_processing")
        self.assertEqual(len(fake.checkouts), 1)
        billing = get_workspace_billing(self.org)
        self.assertIsNotNone(billing)
        self.assertEqual(billing.external_subscription_id, snapshot.subscription_id)
        attempt = WorkspaceCheckoutAttempt.objects.get(organization=self.org)
        self.assertEqual(attempt.status, CheckoutAttemptStatus.COMPLETED)

    def test_completed_different_plan_request_still_processes_not_replace(self):
        first = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        fake = get_fake_provider()
        fake.complete_checkout(first.session_id)
        result = start_paid_checkout(
            self.org, self.owner, plan_key="business", interval="yearly"
        )
        self.assertEqual(result.mode, "checkout_processing")
        self.assertEqual(len(fake.checkouts), 1)
        self.assertFalse(fake.checkouts[first.session_id].get("expired"))


@override_settings(**STRIPE_TEST_SETTINGS)
class DurableCheckoutTrialTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        owner = User.objects.create_user(
            email="checkout-trial-durable@example.com", password="secure-password"
        )
        owner.mark_email_verified()
        self.owner = owner
        self.org = Organization.objects.create_with_owner(owner=owner)

    def test_trial_future_plan_checkout(self):
        result = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        self.assertEqual(result.mode, "checkout")
        checkout = get_fake_provider().checkouts[result.session_id]
        self.assertIsNotNone(checkout["billing_start_at"])
        attempt = WorkspaceCheckoutAttempt.objects.get(organization=self.org)
        self.assertEqual(attempt.status, CheckoutAttemptStatus.OPEN)


@override_settings(**STRIPE_TEST_SETTINGS)
class DurableCheckoutUpgradeUnchangedTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner, self.org = _owner_org("checkout-upgrade-durable@example.com")
        from billing.services import activate_paid_subscription
        from billing.snapshots import SubscriptionSnapshot

        now = timezone.now()
        activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
            external_customer_id="cus_upg",
            external_subscription_id="sub_upg",
            currency="usd",
            now=now,
        )
        get_fake_provider().subscriptions["sub_upg"] = SubscriptionSnapshot(
            subscription_id="sub_upg",
            customer_id="cus_upg",
            status="active",
            price_id="price_plus_monthly",
            cancel_at_period_end=False,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
            trial_start=None,
            trial_end=None,
            metadata={},
        )

    def test_upgrade_not_checkout(self):
        from billing.operations import apply_upgrade_to_business

        before = len(get_fake_provider().checkouts)
        apply_upgrade_to_business(self.org)
        self.assertEqual(len(get_fake_provider().checkouts), before)
        with self.assertRaises(BillingStateError):
            start_paid_checkout(
                self.org, self.owner, plan_key="business", interval="monthly"
            )


@override_settings(**STRIPE_TEST_SETTINGS)
class ConcurrentDurableCheckoutTests(TransactionTestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner, self.org = _owner_org("checkout-concurrent-durable@example.com")

    def test_parallel_identical_checkouts_one_attempt_one_session(self):
        barrier = threading.Barrier(2)
        results = []
        errors = []

        def worker():
            try:
                barrier.wait(timeout=5)
                results.append(
                    start_paid_checkout(
                        self.org,
                        self.owner,
                        plan_key="plus",
                        interval="monthly",
                    )
                )
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=15)

        self.assertEqual(errors, [])
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0].session_id, results[1].session_id)
        self.assertEqual(len(get_fake_provider().checkouts), 1)
        active = WorkspaceCheckoutAttempt.objects.filter(
            organization=self.org,
            status__in=[CheckoutAttemptStatus.PENDING, CheckoutAttemptStatus.OPEN],
        )
        self.assertEqual(active.count(), 1)
        self.assertEqual(active.get().stripe_session_id, results[0].session_id)
