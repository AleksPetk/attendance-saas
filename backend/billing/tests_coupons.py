"""Stripe coupon resolution and application for simple promotion offers."""

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from billing.catalog import catalog_public_payload
from billing.coupons import (
    ACQUISITION_COUPON_SETTINGS,
    ALL_COUPON_SETTING_NAMES,
    resolve_checkout_coupon,
    resolve_schedule_coupon,
)
from billing.exceptions import StripeConfigurationError
from billing.fake_provider import get_fake_provider
from billing.models import BillingInterval, BillingStatus, PurchaseSource, WorkspaceSubscription
from billing.operations import request_schedule_billing_change, start_paid_checkout
from billing.promotion import (
    GROUP_BUSINESS_MONTHLY,
    GROUP_NEW_BASIC,
    GROUP_PLUS_MONTHLY,
    MODE_BIG,
    MODE_NORMAL,
    MODE_OFF,
    set_group_value,
)
from core.models import PlatformPromotionSettings
from organizations.models import Organization

COUPON_TEST_SETTINGS = {
    "BILLING_PROVIDER": "fake",
    "STRIPE_SECRET_KEY": "sk_test_fake",
    "STRIPE_WEBHOOK_SECRET": "whsec_fake",
    "STRIPE_PRICE_PLUS_MONTHLY": "price_plus_monthly",
    "STRIPE_PRICE_PLUS_YEARLY": "price_plus_yearly",
    "STRIPE_PRICE_BUSINESS_MONTHLY": "price_business_monthly",
    "STRIPE_PRICE_BUSINESS_YEARLY": "price_business_yearly",
    "STRIPE_COUPON_ACQ_NORMAL_PLUS_MONTHLY": "coup_acq_n_pm",
    "STRIPE_COUPON_ACQ_NORMAL_BUSINESS_MONTHLY": "coup_acq_n_bm",
    "STRIPE_COUPON_ACQ_NORMAL_PLUS_YEARLY": "coup_acq_n_py",
    "STRIPE_COUPON_ACQ_NORMAL_BUSINESS_YEARLY": "coup_acq_n_by",
    "STRIPE_COUPON_ACQ_BIG_PLUS_MONTHLY": "coup_acq_b_pm",
    "STRIPE_COUPON_ACQ_BIG_BUSINESS_MONTHLY": "coup_acq_b_bm",
    "STRIPE_COUPON_ACQ_BIG_PLUS_YEARLY": "coup_acq_b_py",
    "STRIPE_COUPON_ACQ_BIG_BUSINESS_YEARLY": "coup_acq_b_by",
    "STRIPE_COUPON_PLUS_MONTHLY_TO_PLUS_YEARLY": "coup_pm_to_py",
    "STRIPE_COUPON_BUSINESS_MONTHLY_TO_YEARLY": "coup_bm_to_by",
}


def _set_paid(org, *, plan, interval):
    from datetime import timedelta

    from django.utils import timezone

    from billing.snapshots import SubscriptionSnapshot
    from billing.testing import mark_builtin_trial_expired_for_tests

    # Paid retention/acquisition audience requires a post-trial customer.
    mark_builtin_trial_expired_for_tests(org)
    now = timezone.now()
    billing, _ = WorkspaceSubscription.objects.get_or_create(organization=org)
    billing.purchase_source = PurchaseSource.STRIPE
    billing.status = BillingStatus.ACTIVE
    billing.subscribed_plan = plan
    billing.billing_interval = interval
    billing.external_customer_id = f"cus_{org.pk}"
    billing.external_subscription_id = f"sub_{org.pk}"
    billing.current_period_start = now
    billing.current_period_end = now + timedelta(days=30)
    billing.save()
    org.plan = plan
    org.save(update_fields=["plan", "updated_at"])
    fake = get_fake_provider()
    fake.subscriptions[billing.external_subscription_id] = SubscriptionSnapshot(
        subscription_id=billing.external_subscription_id,
        customer_id=billing.external_customer_id,
        status="active",
        price_id=f"price_{plan}_{interval}",
        cancel_at_period_end=False,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
        trial_start=None,
        trial_end=None,
        metadata={},
    )
    return billing


@override_settings(**COUPON_TEST_SETTINGS)
class AcquisitionCouponTests(TestCase):
    def setUp(self):
        PlatformPromotionSettings.load()
        set_group_value(GROUP_NEW_BASIC, MODE_OFF)
        set_group_value(GROUP_PLUS_MONTHLY, "off")
        set_group_value(GROUP_BUSINESS_MONTHLY, "off")
        get_fake_provider().reset()
        self.owner = User.objects.create_user(
            email="coupon-basic@example.com", password="password12345"
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.org = Organization.objects.create_with_owner(
            owner=self.owner, internal_label="Coupon Basic"
        )

    def test_group1_off_no_coupon(self):
        set_group_value(GROUP_NEW_BASIC, MODE_OFF)
        coupon_id, slot = resolve_checkout_coupon(
            organization=self.org, plan_key="plus", interval="monthly"
        )
        self.assertIsNone(coupon_id)
        self.assertIsNone(slot)

    def test_group1_normal_maps_all_four(self):
        set_group_value(GROUP_NEW_BASIC, MODE_NORMAL)
        expected = {
            ("plus", "monthly"): "coup_acq_n_pm",
            ("business", "monthly"): "coup_acq_n_bm",
            ("plus", "yearly"): "coup_acq_n_py",
            ("business", "yearly"): "coup_acq_n_by",
        }
        for (plan, interval), coupon in expected.items():
            coupon_id, slot = resolve_checkout_coupon(
                organization=self.org, plan_key=plan, interval=interval
            )
            self.assertEqual(coupon_id, coupon)
            self.assertEqual(slot, ACQUISITION_COUPON_SETTINGS[(MODE_NORMAL, plan, interval)])

    def test_group1_big_maps_all_four(self):
        set_group_value(GROUP_NEW_BASIC, MODE_BIG)
        expected = {
            ("plus", "monthly"): "coup_acq_b_pm",
            ("business", "monthly"): "coup_acq_b_bm",
            ("plus", "yearly"): "coup_acq_b_py",
            ("business", "yearly"): "coup_acq_b_by",
        }
        for (plan, interval), coupon in expected.items():
            coupon_id, _slot = resolve_checkout_coupon(
                organization=self.org, plan_key=plan, interval=interval
            )
            self.assertEqual(coupon_id, coupon)

    def test_checkout_records_coupon_on_fake_provider(self):
        set_group_value(GROUP_NEW_BASIC, MODE_NORMAL)
        result = start_paid_checkout(
            self.org, self.owner, plan_key="plus", interval="monthly"
        )
        fake = get_fake_provider()
        session = fake.checkouts[result.session_id]
        self.assertEqual(session["coupon_id"], "coup_acq_n_pm")
        self.assertEqual(session["coupon_slot"], "STRIPE_COUPON_ACQ_NORMAL_PLUS_MONTHLY")
        self.assertEqual(session["price_id"], "price_plus_monthly")

    def test_missing_coupon_fails_closed(self):
        set_group_value(GROUP_NEW_BASIC, MODE_NORMAL)
        with override_settings(STRIPE_COUPON_ACQ_NORMAL_PLUS_MONTHLY=""):
            with self.assertRaises(StripeConfigurationError) as ctx:
                resolve_checkout_coupon(
                    organization=self.org, plan_key="plus", interval="monthly"
                )
            self.assertEqual(ctx.exception.code, "stripe_coupon_missing")

    def test_plus_user_never_gets_group1_checkout_coupon(self):
        set_group_value(GROUP_NEW_BASIC, MODE_BIG)
        _set_paid(self.org, plan="plus", interval=BillingInterval.MONTHLY)
        coupon_id, slot = resolve_checkout_coupon(
            organization=self.org, plan_key="business", interval="yearly"
        )
        self.assertIsNone(coupon_id)
        self.assertIsNone(slot)


@override_settings(**COUPON_TEST_SETTINGS)
class RetentionCouponTests(TestCase):
    def setUp(self):
        PlatformPromotionSettings.load()
        set_group_value(GROUP_NEW_BASIC, MODE_OFF)
        set_group_value(GROUP_PLUS_MONTHLY, "off")
        set_group_value(GROUP_BUSINESS_MONTHLY, "off")
        get_fake_provider().reset()
        self.owner = User.objects.create_user(
            email="coupon-paid@example.com", password="password12345"
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.org = Organization.objects.create_with_owner(
            owner=self.owner, internal_label="Coupon Paid"
        )

    def test_group2_plus_yearly_and_business_yearly(self):
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        _set_paid(self.org, plan="plus", interval=BillingInterval.MONTHLY)
        c1, s1 = resolve_schedule_coupon(
            organization=self.org, target_plan="plus", target_interval="yearly"
        )
        self.assertEqual(c1, "coup_pm_to_py")
        self.assertEqual(s1, "STRIPE_COUPON_PLUS_MONTHLY_TO_PLUS_YEARLY")
        c2, s2 = resolve_schedule_coupon(
            organization=self.org, target_plan="business", target_interval="yearly"
        )
        # Reuses the Business Monthly → Yearly $45 coupon.
        self.assertEqual(c2, "coup_bm_to_by")
        self.assertEqual(s2, "STRIPE_COUPON_BUSINESS_MONTHLY_TO_YEARLY")

    def test_group2_business_monthly_has_no_promo_coupon(self):
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        _set_paid(self.org, plan="plus", interval=BillingInterval.MONTHLY)
        coupon_id, slot = resolve_schedule_coupon(
            organization=self.org, target_plan="business", target_interval="monthly"
        )
        self.assertIsNone(coupon_id)
        self.assertIsNone(slot)

    def test_group2_off_no_coupon(self):
        set_group_value(GROUP_PLUS_MONTHLY, "off")
        _set_paid(self.org, plan="plus", interval=BillingInterval.MONTHLY)
        coupon_id, slot = resolve_schedule_coupon(
            organization=self.org, target_plan="plus", target_interval="yearly"
        )
        self.assertIsNone(coupon_id)
        self.assertIsNone(slot)

    def test_wrong_audience_no_group2_coupon(self):
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        _set_paid(self.org, plan="business", interval=BillingInterval.YEARLY)
        coupon_id, slot = resolve_schedule_coupon(
            organization=self.org, target_plan="plus", target_interval="yearly"
        )
        self.assertIsNone(coupon_id)
        self.assertIsNone(slot)

    def test_group3_business_yearly(self):
        set_group_value(GROUP_BUSINESS_MONTHLY, "on")
        _set_paid(self.org, plan="business", interval=BillingInterval.MONTHLY)
        coupon_id, slot = resolve_schedule_coupon(
            organization=self.org, target_plan="business", target_interval="yearly"
        )
        self.assertEqual(coupon_id, "coup_bm_to_by")
        self.assertEqual(slot, "STRIPE_COUPON_BUSINESS_MONTHLY_TO_YEARLY")

    def test_plus_yearly_audience_no_promo_coupon(self):
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        set_group_value(GROUP_BUSINESS_MONTHLY, "on")
        _set_paid(self.org, plan="plus", interval=BillingInterval.YEARLY)
        coupon_id, slot = resolve_schedule_coupon(
            organization=self.org, target_plan="business", target_interval="yearly"
        )
        self.assertIsNone(coupon_id)
        self.assertIsNone(slot)

    def test_shared_business_yearly_coupon_both_audiences(self):
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        set_group_value(GROUP_BUSINESS_MONTHLY, "on")
        _set_paid(self.org, plan="plus", interval=BillingInterval.MONTHLY)
        c_plus, s_plus = resolve_schedule_coupon(
            organization=self.org, target_plan="business", target_interval="yearly"
        )
        _set_paid(self.org, plan="business", interval=BillingInterval.MONTHLY)
        c_biz, s_biz = resolve_schedule_coupon(
            organization=self.org, target_plan="business", target_interval="yearly"
        )
        self.assertEqual(c_plus, c_biz)
        self.assertEqual(s_plus, s_biz)
        self.assertEqual(s_plus, "STRIPE_COUPON_BUSINESS_MONTHLY_TO_YEARLY")

    def test_schedule_records_coupon_on_fake_provider(self):
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        _set_paid(self.org, plan="plus", interval=BillingInterval.MONTHLY)
        request_schedule_billing_change(
            self.org, plan="plus", interval="yearly"
        )
        fake = get_fake_provider()
        last = fake.schedule_change_calls[-1]
        self.assertEqual(last["coupon_id"], "coup_pm_to_py")
        self.assertEqual(last["coupon_slot"], "STRIPE_COUPON_PLUS_MONTHLY_TO_PLUS_YEARLY")

    def test_schedule_plus_to_business_yearly_reuses_shared_coupon(self):
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        _set_paid(self.org, plan="plus", interval=BillingInterval.MONTHLY)
        request_schedule_billing_change(
            self.org, plan="business", interval="yearly"
        )
        fake = get_fake_provider()
        last = fake.schedule_change_calls[-1]
        self.assertEqual(last["coupon_id"], "coup_bm_to_by")
        self.assertEqual(last["coupon_slot"], "STRIPE_COUPON_BUSINESS_MONTHLY_TO_YEARLY")

    def test_missing_retention_coupon_fails_closed(self):
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        _set_paid(self.org, plan="plus", interval=BillingInterval.MONTHLY)
        with override_settings(STRIPE_COUPON_PLUS_MONTHLY_TO_PLUS_YEARLY=""):
            with self.assertRaises(StripeConfigurationError):
                resolve_schedule_coupon(
                    organization=self.org, target_plan="plus", target_interval="yearly"
                )


@override_settings(**COUPON_TEST_SETTINGS)
class CouponPublicApiSafetyTests(TestCase):
    def setUp(self):
        PlatformPromotionSettings.load()
        set_group_value(GROUP_NEW_BASIC, MODE_NORMAL)
        self.client = APIClient()

    def test_catalog_never_exposes_coupon_ids(self):
        payload = catalog_public_payload()
        blob = str(payload)
        for name in ALL_COUPON_SETTING_NAMES:
            self.assertNotIn(name, blob)
        for value in COUPON_TEST_SETTINGS.values():
            if isinstance(value, str) and value.startswith("coup_"):
                self.assertNotIn(value, blob)
        resp = self.client.get("/api/billing/catalog/")
        self.assertEqual(resp.status_code, 200)
        body = str(resp.data)
        self.assertNotIn("coup_acq", body)
        self.assertNotIn("STRIPE_COUPON_", body)
        # When coupons are configured, Group 1 offers report checkout applies.
        offer = resp.data["promotion"]["offers"][0]
        self.assertTrue(offer["checkout_applies_promotion"])
        self.assertIsNone(offer["provider_offer_ref"])

    def test_all_global_and_jp_coupon_settings_defined(self):
        self.assertEqual(len(ALL_COUPON_SETTING_NAMES), 21)
        self.assertNotIn(
            "STRIPE_COUPON_PLUS_MONTHLY_TO_BUSINESS_YEARLY",
            ALL_COUPON_SETTING_NAMES,
        )
