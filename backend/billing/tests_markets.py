"""JP/GLOBAL catalog, provider mapping, promotions, and reconciliation."""

from unittest.mock import patch
from dataclasses import replace

from django.test import TestCase, override_settings

from accounts.models import User
from billing.catalog import catalog_public_payload, format_currency_minor
from billing.coupons import resolve_checkout_coupon, retention_setting_name
from billing.fake_provider import get_fake_provider
from billing.exceptions import BillingStateError
from billing.markets import MARKET_GLOBAL, MARKET_JP, resolve_billing_market
from billing.operations import (
    apply_upgrade_to_business,
    request_schedule_billing_change,
    start_paid_checkout,
)
from billing.prices import price_id_for, price_mapping_for_id
from billing.promotion import (
    AUDIENCE_BUSINESS_MONTHLY,
    AUDIENCE_PLUS_MONTHLY,
    AUDIENCE_PUBLIC,
    GROUP_BUSINESS_MONTHLY,
    GROUP_NEW_BASIC,
    GROUP_PLUS_MONTHLY,
    MODE_BIG,
    MODE_NORMAL,
    promotion_payload_for_audience,
    set_group_value,
)
from billing.reconciliation import reconcile_subscription_snapshot
from billing.services import get_workspace_billing
from billing.state import build_billing_state
from billing.testing import simulate_migrated_existing_workspace
from organizations.models import BillingMarketOverride, Organization


MARKET_SETTINGS = {
    "BILLING_PROVIDER": "fake",
    "STRIPE_SECRET_KEY": "sk_test_fake",
    "STRIPE_PRICE_PLUS_MONTHLY": "price_global_plus_monthly",
    "STRIPE_PRICE_PLUS_YEARLY": "price_global_plus_yearly",
    "STRIPE_PRICE_BUSINESS_MONTHLY": "price_global_business_monthly",
    "STRIPE_PRICE_BUSINESS_YEARLY": "price_global_business_yearly",
    "STRIPE_PRICE_JP_PLUS_MONTHLY": "price_jp_plus_monthly",
    "STRIPE_PRICE_JP_PLUS_YEARLY": "price_jp_plus_yearly",
    "STRIPE_PRICE_JP_BUSINESS_MONTHLY": "price_jp_business_monthly",
    "STRIPE_PRICE_JP_BUSINESS_YEARLY": "price_jp_business_yearly",
    "STRIPE_COUPON_ACQ_NORMAL_PLUS_MONTHLY": "global_normal_pm",
    "STRIPE_COUPON_ACQ_NORMAL_BUSINESS_MONTHLY": "global_normal_bm",
    "STRIPE_COUPON_ACQ_NORMAL_PLUS_YEARLY": "global_normal_py",
    "STRIPE_COUPON_ACQ_NORMAL_BUSINESS_YEARLY": "global_normal_by",
    "STRIPE_COUPON_ACQ_BIG_PLUS_MONTHLY": "global_big_pm",
    "STRIPE_COUPON_ACQ_BIG_BUSINESS_MONTHLY": "global_big_bm",
    "STRIPE_COUPON_ACQ_BIG_PLUS_YEARLY": "global_big_py",
    "STRIPE_COUPON_ACQ_BIG_BUSINESS_YEARLY": "global_big_by",
    "STRIPE_COUPON_PLUS_MONTHLY_TO_PLUS_YEARLY": "global_retention_plus",
    "STRIPE_COUPON_BUSINESS_MONTHLY_TO_YEARLY": "global_retention_business",
    "STRIPE_COUPON_JP_ACQ_NORMAL_PLUS_MONTHLY": "jp_normal_pm",
    "STRIPE_COUPON_JP_ACQ_NORMAL_BUSINESS_MONTHLY": "jp_normal_bm",
    "STRIPE_COUPON_JP_ACQ_NORMAL_PLUS_YEARLY": "jp_normal_py",
    "STRIPE_COUPON_JP_ACQ_NORMAL_BUSINESS_YEARLY": "jp_normal_by",
    "STRIPE_COUPON_JP_ACQ_BIG_PLUS_MONTHLY": "jp_big_pm",
    "STRIPE_COUPON_JP_ACQ_BIG_BUSINESS_MONTHLY": "jp_big_bm",
    "STRIPE_COUPON_JP_ACQ_BIG_PLUS_YEARLY": "jp_big_py",
    "STRIPE_COUPON_JP_ACQ_BIG_BUSINESS_YEARLY": "jp_big_by",
    "STRIPE_COUPON_JP_PLUS_MONTHLY_TO_PLUS_YEARLY": "jp_retention_plus",
    "STRIPE_COUPON_JP_BUSINESS_MONTHLY_TO_YEARLY": "jp_retention_business",
    "STRIPE_COUPON_JP_BUSINESS_UPGRADE_YEARLY": "jp_retention_upgrade",
}


@override_settings(**MARKET_SETTINGS)
class MarketCatalogTests(TestCase):
    def setUp(self):
        set_group_value(GROUP_NEW_BASIC, MODE_NORMAL)
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        set_group_value(GROUP_BUSINESS_MONTHLY, "on")

    def test_default_resolver_is_global_and_ignores_language_like_attributes(self):
        self.assertEqual(resolve_billing_market(None), MARKET_GLOBAL)
        self.assertEqual(
            resolve_billing_market(type("Workspace", (), {"preferred_language": "ja"})()),
            MARKET_GLOBAL,
        )

    def test_persistent_override_resolves_auto_global_and_jp(self):
        owner = User.objects.create_user(email="resolver@example.com", password="password12345")
        organization = Organization.objects.create_with_owner(owner=owner)
        self.assertEqual(organization.billing_market_override, BillingMarketOverride.AUTO)
        self.assertEqual(resolve_billing_market(organization), MARKET_GLOBAL)

        organization.billing_market_override = BillingMarketOverride.GLOBAL
        organization.save(update_fields=["billing_market_override", "updated_at"])
        self.assertEqual(resolve_billing_market(organization), MARKET_GLOBAL)

        organization.billing_market_override = BillingMarketOverride.JP
        organization.save(update_fields=["billing_market_override", "updated_at"])
        organization.owner.preferred_language = "en"
        self.assertEqual(resolve_billing_market(organization), MARKET_JP)

    def test_authenticated_catalog_uses_workspace_override_but_anonymous_uses_geo(self):
        owner = User.objects.create_user(email="catalog-jp@example.com", password="password12345")
        owner.mark_email_verified()
        organization = Organization.objects.create_with_owner(owner=owner)
        organization.billing_market_override = BillingMarketOverride.JP
        organization.save(update_fields=["billing_market_override", "updated_at"])

        from rest_framework.test import APIClient

        public = APIClient().get("/api/billing/catalog/")
        self.assertEqual((public.data["market"], public.data["currency"]), ("global", "usd"))
        public_jp = APIClient().get(
            "/api/billing/catalog/",
            HTTP_X_CHECKSTATION_COUNTRY="JP",
        )
        self.assertEqual((public_jp.data["market"], public_jp.data["currency"]), ("jp", "jpy"))
        client = APIClient()
        client.force_authenticate(user=owner)
        workspace = client.get("/api/billing/catalog/")
        self.assertEqual((workspace.data["market"], workspace.data["currency"]), ("jp", "jpy"))
        self.assertEqual(
            workspace.data["plans"]["plus"]["intervals"]["yearly"]["formatted"],
            "¥9,800",
        )

    def test_both_catalogs_have_explicit_minor_units_and_currency_formatting(self):
        global_catalog = catalog_public_payload(audience=AUDIENCE_PUBLIC, market=MARKET_GLOBAL)
        jp_catalog = catalog_public_payload(audience=AUDIENCE_PUBLIC, market=MARKET_JP)
        self.assertEqual(global_catalog["currency"], "usd")
        self.assertEqual(global_catalog["plans"]["plus"]["intervals"]["monthly"]["amount_minor"], 999)
        self.assertEqual(global_catalog["plans"]["business"]["intervals"]["yearly"]["formatted"], "$149.99")
        self.assertEqual(jp_catalog["currency"], "jpy")
        self.assertEqual(jp_catalog["plans"]["plus"]["intervals"]["monthly"]["amount_minor"], 980)
        self.assertEqual(jp_catalog["plans"]["plus"]["intervals"]["yearly"]["formatted"], "¥9,800")
        self.assertEqual(jp_catalog["plans"]["business"]["intervals"]["monthly"]["formatted"], "¥1,480")
        self.assertEqual(jp_catalog["plans"]["business"]["intervals"]["yearly"]["formatted"], "¥14,800")
        self.assertEqual(format_currency_minor(980, "jpy"), "¥980")

    def test_jp_acquisition_final_prices_and_coupon_ids(self):
        expected = {
            MODE_NORMAL: {("plus", "monthly"): 490, ("business", "monthly"): 740, ("plus", "yearly"): 6900, ("business", "yearly"): 10400},
            MODE_BIG: {("plus", "monthly"): 290, ("business", "monthly"): 440, ("plus", "yearly"): 4900, ("business", "yearly"): 7400},
        }
        for mode, amounts in expected.items():
            set_group_value(GROUP_NEW_BASIC, mode)
            payload = promotion_payload_for_audience(AUDIENCE_PUBLIC, market=MARKET_JP)
            actual = {(row["target_plan"], row["target_interval"]): row["promotional_amount_minor"] for row in payload["offers"]}
            self.assertEqual(actual, amounts)
        set_group_value(GROUP_NEW_BASIC, MODE_NORMAL)
        self.assertEqual(resolve_checkout_coupon(organization=None, plan_key="plus", interval="monthly", market=MARKET_JP)[0], "jp_normal_pm")

    def test_jp_retention_uses_three_distinct_coupon_economics(self):
        plus = promotion_payload_for_audience(AUDIENCE_PLUS_MONTHLY, market=MARKET_JP)
        self.assertEqual([o["promotional_amount_minor"] for o in plus["offers"]], [6900, 11800])
        business = promotion_payload_for_audience(AUDIENCE_BUSINESS_MONTHLY, market=MARKET_JP)
        self.assertEqual(business["offers"][0]["promotional_amount_minor"], 10400)
        self.assertEqual(
            retention_setting_name("plus_yearly_30", market=MARKET_JP),
            "STRIPE_COUPON_JP_PLUS_MONTHLY_TO_PLUS_YEARLY",
        )
        self.assertEqual(
            retention_setting_name("business_yearly_30", market=MARKET_JP),
            "STRIPE_COUPON_JP_BUSINESS_MONTHLY_TO_YEARLY",
        )
        self.assertEqual(
            retention_setting_name("business_upgrade_yearly_30", market=MARKET_JP),
            "STRIPE_COUPON_JP_BUSINESS_UPGRADE_YEARLY",
        )

    def test_price_reverse_mapping_includes_market_currency_and_legacy(self):
        jp = price_mapping_for_id("price_jp_business_yearly")
        self.assertEqual((jp.market, jp.plan_key, jp.interval, jp.currency), ("jp", "business", "yearly", "jpy"))
        legacy = price_mapping_for_id("price_1U8I7f5eHcXTJr2asaypCH5m")
        self.assertTrue(legacy.legacy)
        self.assertEqual((legacy.market, legacy.currency), ("global", "usd"))


@override_settings(**MARKET_SETTINGS)
class MarketOperationTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        set_group_value(GROUP_NEW_BASIC, "off")
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        set_group_value(GROUP_BUSINESS_MONTHLY, "on")
        self.owner = User.objects.create_user(email="jp-market@example.com", password="password12345")
        self.org = simulate_migrated_existing_workspace(Organization.objects.create_with_owner(owner=self.owner))

    @patch("billing.operations.resolve_billing_market", return_value=MARKET_JP)
    def test_jp_checkout_reconciliation_and_upgrade_stay_jp(self, _resolver):
        checkout = start_paid_checkout(self.org, self.owner, plan_key="plus", interval="monthly")
        fake = get_fake_provider()
        self.assertEqual(fake.checkouts[checkout.session_id]["price_id"], "price_jp_plus_monthly")
        snapshot = fake.complete_checkout(checkout.session_id)
        reconcile_subscription_snapshot(self.org, snapshot)
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.currency, "jpy")
        state = build_billing_state(self.org)
        self.assertEqual(state["billing_market"], "jp")
        self.assertEqual(state["catalog"]["currency"], "jpy")
        apply_upgrade_to_business(self.org)
        billing.refresh_from_db()
        self.assertEqual(billing.currency, "jpy")
        self.assertEqual(fake.subscriptions[billing.external_subscription_id].price_id, "price_jp_business_monthly")
        request_schedule_billing_change(self.org, plan="business", interval="yearly")
        scheduled = fake.schedule_change_calls[-1]
        self.assertEqual(scheduled["market"], "jp")
        self.assertEqual(scheduled["coupon_id"], "jp_retention_business")
        fake.apply_scheduled_price(billing.external_subscription_id, "business", "yearly")
        self.assertEqual(
            fake.subscriptions[billing.external_subscription_id].price_id,
            "price_jp_business_yearly",
        )

    def test_default_checkout_remains_global_even_with_untrusted_market_fields_elsewhere(self):
        checkout = start_paid_checkout(self.org, self.owner, plan_key="plus", interval="monthly")
        row = get_fake_provider().checkouts[checkout.session_id]
        self.assertEqual(row["market"], "global")
        self.assertEqual(row["price_id"], price_id_for("plus", "monthly"))

    def test_jp_override_selects_jp_prices_and_normal_or_big_coupons(self):
        self.org.billing_market_override = BillingMarketOverride.JP
        self.org.save(update_fields=["billing_market_override", "updated_at"])
        fake = get_fake_provider()

        for mode, expected_coupon in ((MODE_NORMAL, "jp_normal_pm"), (MODE_BIG, "jp_big_pm")):
            set_group_value(GROUP_NEW_BASIC, mode)
            checkout = start_paid_checkout(
                self.org,
                self.owner,
                plan_key="plus",
                interval="monthly",
            )
            row = fake.checkouts[checkout.session_id]
            self.assertEqual(row["market"], MARKET_JP)
            self.assertEqual(row["price_id"], "price_jp_plus_monthly")
            self.assertEqual(row["coupon_id"], expected_coupon)

    def test_global_override_selects_global_price_and_coupon(self):
        self.org.billing_market_override = BillingMarketOverride.GLOBAL
        self.org.save(update_fields=["billing_market_override", "updated_at"])
        set_group_value(GROUP_NEW_BASIC, MODE_NORMAL)
        checkout = start_paid_checkout(
            self.org,
            self.owner,
            plan_key="business",
            interval="yearly",
        )
        row = get_fake_provider().checkouts[checkout.session_id]
        self.assertEqual(row["market"], MARKET_GLOBAL)
        self.assertEqual(row["price_id"], "price_global_business_yearly")
        self.assertEqual(row["coupon_id"], "global_normal_by")

    def test_active_subscription_currency_remains_authoritative_after_override_change(self):
        set_group_value(GROUP_NEW_BASIC, "off")
        checkout = start_paid_checkout(self.org, self.owner, plan_key="plus", interval="monthly")
        fake = get_fake_provider()
        reconcile_subscription_snapshot(self.org, fake.complete_checkout(checkout.session_id))
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.currency, "usd")
        subscription_id = billing.external_subscription_id

        self.org.billing_market_override = BillingMarketOverride.JP
        self.org.save(update_fields=["billing_market_override", "updated_at"])
        billing.refresh_from_db()
        self.assertEqual(billing.currency, "usd")
        self.assertEqual(fake.subscriptions[subscription_id].price_id, "price_global_plus_monthly")

        apply_upgrade_to_business(self.org)
        billing.refresh_from_db()
        self.assertEqual(billing.currency, "usd")
        self.assertEqual(fake.upgrade_calls[-1]["market"], MARKET_GLOBAL)
        self.assertEqual(fake.subscriptions[subscription_id].price_id, "price_global_business_monthly")

    def test_reconciliation_rejects_cross_market_price_before_mutating_ids(self):
        checkout = start_paid_checkout(self.org, self.owner, plan_key="plus", interval="monthly")
        snapshot = get_fake_provider().complete_checkout(checkout.session_id)
        reconcile_subscription_snapshot(self.org, snapshot)
        incoming = replace(
            snapshot,
            subscription_id="sub_wrong_market",
            price_id="price_jp_plus_monthly",
        )
        with self.assertRaises(BillingStateError) as caught:
            reconcile_subscription_snapshot(self.org, incoming)
        self.assertEqual(caught.exception.code, "stripe_market_mismatch")
        billing = get_workspace_billing(self.org)
        self.assertEqual(billing.external_subscription_id, snapshot.subscription_id)
        self.assertEqual(billing.currency, "usd")
