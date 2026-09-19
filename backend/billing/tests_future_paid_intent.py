"""Intent-only future paid plan (purchase_source=none) during built-in trial."""

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from billing.exceptions import BillingStateError
from billing.models import BillingStatus, PurchaseSource
from billing.operations import clear_future_paid_intent, set_future_paid_intent
from billing.services import get_workspace_billing, record_deferred_paid_start
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


@override_settings(**STRIPE_TEST_SETTINGS)
class FuturePaidIntentTests(TestCase):
    def setUp(self):
        self.owner = _owner("future-intent@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.org.refresh_from_db()
        self.assertTrue(self.org.builtin_trial.ends_at > timezone.now())
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)

    def test_select_and_change_intent_keeps_source_none(self):
        set_future_paid_intent(self.org, plan_key="plus", interval="monthly")
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.purchase_source, PurchaseSource.NONE)
        self.assertEqual(billing.status, BillingStatus.NONE)
        self.assertEqual(billing.subscribed_plan, "plus")
        self.assertEqual(billing.billing_interval, "monthly")
        state = build_billing_state(self.org)
        self.assertEqual(state["future_paid_plan"]["key"], "plus")
        self.assertEqual(state["future_paid_plan"]["interval"], "monthly")
        self.assertTrue(state["can_start_apple"])
        self.assertEqual(state["purchase_source"], PurchaseSource.NONE)
        self.assertIsNone(state["subscribed_plan"]["key"])

        set_future_paid_intent(self.org, plan_key="business", interval="yearly")
        state = build_billing_state(self.org)
        self.assertEqual(state["future_paid_plan"]["key"], "business")
        self.assertEqual(state["future_paid_plan"]["interval"], "yearly")
        billing.refresh_from_db()
        self.assertEqual(billing.purchase_source, PurchaseSource.NONE)
        self.assertEqual(billing.status, BillingStatus.NONE)

    def test_clear_intent(self):
        set_future_paid_intent(self.org, plan_key="plus", interval="yearly")
        clear_future_paid_intent(self.org)
        state = build_billing_state(self.org)
        self.assertIsNone(state["future_paid_plan"])
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.subscribed_plan, "")
        self.assertEqual(billing.purchase_source, PurchaseSource.NONE)

    def test_stripe_deferred_blocks_intent(self):
        now = timezone.now()
        record_deferred_paid_start(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            trial_started_at=now,
            trial_ends_at=self.org.builtin_trial.ends_at,
            external_customer_id="cus_x",
            external_subscription_id="sub_x",
            currency="usd",
            now=now,
        )
        with self.assertRaises(BillingStateError) as ctx:
            set_future_paid_intent(self.org, plan_key="business", interval="monthly")
        self.assertEqual(ctx.exception.code, "purchase_source_locked")

    def test_api_select_and_clear(self):
        client = APIClient()
        client.force_authenticate(user=self.owner)
        response = client.post(
            "/api/billing/future-plan/",
            {"plan": "business", "interval": "monthly"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["future_paid_plan"]["key"], "business")
        self.assertEqual(response.data["purchase_source"], "none")
        cleared = client.post("/api/billing/future-plan/clear/", {}, format="json")
        self.assertEqual(cleared.status_code, 200)
        self.assertIsNone(cleared.data["future_paid_plan"])
