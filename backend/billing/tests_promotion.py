"""Eligibility-based promotion groups: calculation, catalog, admin."""

from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.test import Client, TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from accounts.testing import force_platform_admin_login
from billing.catalog import PRICE_CENTS, catalog_public_payload, price_cents
from billing.models import BillingInterval, BillingStatus, PurchaseSource, WorkspaceSubscription
from billing.promotion import (
    AUDIENCE_BASIC,
    AUDIENCE_BUSINESS_MONTHLY,
    AUDIENCE_BUSINESS_YEARLY,
    AUDIENCE_PLUS_MONTHLY,
    AUDIENCE_PLUS_YEARLY,
    AUDIENCE_PUBLIC,
    CHECKOUT_APPLIES_PROMOTION,
    DISCOUNT_TYPE_FIXED_AMOUNT,
    GROUP_BUSINESS_MONTHLY,
    GROUP_NEW_BASIC,
    GROUP_PLUS_MONTHLY,
    MODE_BIG,
    MODE_NORMAL,
    MODE_OFF,
    admin_groups_snapshot,
    cents_to_amount_string,
    fixed_promotional_cents,
    promotion_payload_for_audience,
    resolve_audience,
    set_group_value,
)
from core.models import (
    NewBasicPromotionMode,
    PlatformPromotionModeChange,
    PlatformPromotionSettings,
    PromotionGroupKey,
)
from organizations.models import Organization, OrganizationPlan


def _set_paid(
    org,
    *,
    plan,
    interval,
    status=BillingStatus.ACTIVE,
    cancel_at_period_end=False,
    expire_builtin_trial=True,
):
    from billing.testing import mark_builtin_trial_expired_for_tests

    # Paid Plus/Business audience requires post-trial commercial state.
    # Leave expire_builtin_trial=False only when asserting active builtin trial.
    if expire_builtin_trial:
        mark_builtin_trial_expired_for_tests(org)
    billing, _created = WorkspaceSubscription.objects.get_or_create(organization=org)
    billing.purchase_source = PurchaseSource.STRIPE
    billing.status = status
    billing.subscribed_plan = plan
    billing.billing_interval = interval
    billing.cancel_at_period_end = bool(cancel_at_period_end)
    billing.external_customer_id = f"cus_{org.pk}"
    billing.external_subscription_id = f"sub_{org.pk}"
    billing.save()
    org.plan = plan
    org.save(update_fields=["plan", "updated_at"])
    return billing


class PromotionRoundingTests(TestCase):
    def test_fixed_coupon_economics_match_stripe(self):
        # normal − fixed off = promotional
        self.assertEqual(fixed_promotional_cents(999, 500), 499)
        self.assertEqual(fixed_promotional_cents(1499, 750), 749)
        self.assertEqual(fixed_promotional_cents(9999, 3000), 6999)
        self.assertEqual(fixed_promotional_cents(14999, 4500), 10499)
        self.assertEqual(fixed_promotional_cents(999, 700), 299)
        self.assertEqual(fixed_promotional_cents(1499, 1050), 449)
        self.assertEqual(fixed_promotional_cents(9999, 5000), 4999)
        self.assertEqual(fixed_promotional_cents(14999, 7500), 7499)
        self.assertEqual(fixed_promotional_cents(14999, 3000), 11999)
        self.assertEqual(cents_to_amount_string(499), "4.99")
        self.assertEqual(cents_to_amount_string(4999), "49.99")
        self.assertEqual(cents_to_amount_string(7499), "74.99")


class EligibilityResolverTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="elig@example.com", password="password12345"
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.org = Organization.objects.create_with_owner(
            owner=self.owner, internal_label="Elig Org"
        )

    def test_matrix(self):
        self.assertEqual(resolve_audience(), AUDIENCE_PUBLIC)
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_BASIC)
        _set_paid(self.org, plan="plus", interval=BillingInterval.MONTHLY)
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_PLUS_MONTHLY)
        _set_paid(self.org, plan="plus", interval=BillingInterval.YEARLY)
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_PLUS_YEARLY)
        _set_paid(self.org, plan="business", interval=BillingInterval.MONTHLY)
        self.assertEqual(
            resolve_audience(organization=self.org), AUDIENCE_BUSINESS_MONTHLY
        )
        _set_paid(self.org, plan="business", interval=BillingInterval.YEARLY)
        self.assertEqual(
            resolve_audience(organization=self.org), AUDIENCE_BUSINESS_YEARLY
        )

    def test_builtin_trial_without_subscription_is_basic_audience(self):
        # create_with_owner grants Business entitlement trial; no paid sub.
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_BASIC)

    def test_builtin_trial_with_future_plus_selection_is_basic_audience(self):
        # Active builtin trial + deferred future Plus → still Basic/New audience.
        _set_paid(
            self.org,
            plan="plus",
            interval=BillingInterval.MONTHLY,
            status=BillingStatus.TRIALING,
            expire_builtin_trial=False,
        )
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_BASIC)

    def test_builtin_trial_with_future_business_selection_is_basic_audience(self):
        _set_paid(
            self.org,
            plan="business",
            interval=BillingInterval.YEARLY,
            status=BillingStatus.TRIALING,
            expire_builtin_trial=False,
        )
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_BASIC)

    def test_trialing_plus_non_cancelled_is_plus_audience(self):
        # Post-trial Stripe trialing (deferred paid already committed) → Plus.
        _set_paid(
            self.org,
            plan="plus",
            interval=BillingInterval.MONTHLY,
            status=BillingStatus.TRIALING,
        )
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_PLUS_MONTHLY)

    def test_trialing_plus_cancelled_before_start_is_basic_audience(self):
        _set_paid(
            self.org,
            plan="plus",
            interval=BillingInterval.MONTHLY,
            status=BillingStatus.TRIALING,
            cancel_at_period_end=True,
        )
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_BASIC)

    def test_trialing_business_cancelled_before_start_is_basic_audience(self):
        _set_paid(
            self.org,
            plan="business",
            interval=BillingInterval.YEARLY,
            status=BillingStatus.TRIALING,
            cancel_at_period_end=True,
        )
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_BASIC)

    def test_active_plus_and_business_audiences(self):
        _set_paid(self.org, plan="plus", interval=BillingInterval.MONTHLY)
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_PLUS_MONTHLY)
        _set_paid(self.org, plan="business", interval=BillingInterval.MONTHLY)
        self.assertEqual(
            resolve_audience(organization=self.org), AUDIENCE_BUSINESS_MONTHLY
        )

    def test_active_cancelled_plus_keeps_plus_audience(self):
        # Paid period already started — cancel-at-period-end is not Basic yet.
        _set_paid(
            self.org,
            plan="plus",
            interval=BillingInterval.MONTHLY,
            status=BillingStatus.ACTIVE,
            cancel_at_period_end=True,
        )
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_PLUS_MONTHLY)


class GroupOfferRulesTests(TestCase):
    def setUp(self):
        PlatformPromotionSettings.load()
        set_group_value(GROUP_NEW_BASIC, MODE_OFF)
        set_group_value(GROUP_PLUS_MONTHLY, "off")
        set_group_value(GROUP_BUSINESS_MONTHLY, "off")

    def test_group1_off_normal_big(self):
        off = promotion_payload_for_audience(AUDIENCE_PUBLIC)
        self.assertFalse(off["active"])
        self.assertEqual(off["group"], GROUP_NEW_BASIC)
        self.assertEqual(off["offers"], [])

        set_group_value(GROUP_NEW_BASIC, MODE_NORMAL)
        normal = promotion_payload_for_audience(AUDIENCE_BASIC)
        self.assertTrue(normal["active"])
        self.assertEqual(normal["mode"], MODE_NORMAL)
        by_key = {
            (o["target_plan"], o["target_interval"]): o for o in normal["offers"]
        }
        self.assertEqual(by_key[("plus", "monthly")]["discount_percent"], 50)
        self.assertEqual(by_key[("plus", "monthly")]["discount_type"], DISCOUNT_TYPE_FIXED_AMOUNT)
        self.assertEqual(by_key[("plus", "monthly")]["discount_amount_cents"], 500)
        self.assertEqual(by_key[("plus", "monthly")]["promotional_cents"], 499)
        self.assertEqual(by_key[("plus", "monthly")]["promotional_amount"], "4.99")
        self.assertEqual(by_key[("plus", "yearly")]["discount_percent"], 30)
        self.assertEqual(by_key[("plus", "yearly")]["promotional_cents"], 6999)
        self.assertEqual(by_key[("business", "monthly")]["promotional_cents"], 749)
        self.assertEqual(by_key[("business", "yearly")]["promotional_cents"], 10499)

        set_group_value(GROUP_NEW_BASIC, MODE_BIG)
        big = promotion_payload_for_audience(AUDIENCE_PUBLIC)
        by_key = {(o["target_plan"], o["target_interval"]): o for o in big["offers"]}
        self.assertEqual(by_key[("plus", "monthly")]["discount_percent"], 70)
        self.assertEqual(by_key[("plus", "monthly")]["promotional_cents"], 299)
        self.assertEqual(by_key[("plus", "yearly")]["discount_percent"], 50)
        self.assertEqual(by_key[("plus", "yearly")]["promotional_cents"], 4999)
        self.assertEqual(by_key[("plus", "yearly")]["promotional_formatted"], "$49.99")
        self.assertEqual(by_key[("business", "yearly")]["promotional_cents"], 7499)
        self.assertEqual(by_key[("business", "yearly")]["promotional_formatted"], "$74.99")
        self.assertEqual(by_key[("business", "monthly")]["promotional_cents"], 449)

    def test_group2_plus_monthly_offers_exactly_two(self):
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        # Even with Group 1 BIG, Plus Monthly audience must not get Group 1.
        set_group_value(GROUP_NEW_BASIC, MODE_BIG)
        payload = promotion_payload_for_audience(AUDIENCE_PLUS_MONTHLY)
        self.assertEqual(payload["group"], GROUP_PLUS_MONTHLY)
        self.assertEqual(len(payload["offers"]), 2)
        offer_ids = {o["id"] for o in payload["offers"]}
        self.assertEqual(
            offer_ids,
            {"plus_monthly_to_plus_yearly", "plus_monthly_to_business_yearly"},
        )
        # No Business Monthly intro / special offer.
        self.assertFalse(
            any(o["target_interval"] == "monthly" for o in payload["offers"])
        )
        by_id = {o["id"]: o for o in payload["offers"]}
        yearly_plus = by_id["plus_monthly_to_plus_yearly"]
        self.assertEqual(yearly_plus["discount_percent"], 30)
        self.assertEqual(yearly_plus["discount_amount_cents"], 3000)
        self.assertEqual(yearly_plus["promotional_cents"], 6999)
        self.assertEqual(yearly_plus["promotional_formatted"], "$69.99")
        self.assertEqual(yearly_plus["renews_at_formatted"], "$99.99")
        biz_year = by_id["plus_monthly_to_business_yearly"]
        self.assertEqual(biz_year["discount_percent"], 30)
        self.assertEqual(biz_year["discount_amount_cents"], 4500)
        self.assertEqual(biz_year["promotional_cents"], 10499)
        self.assertEqual(biz_year["promotional_formatted"], "$104.99")
        self.assertEqual(biz_year["renews_at_formatted"], "$149.99")
        self.assertEqual(biz_year["discount_type"], DISCOUNT_TYPE_FIXED_AMOUNT)

    def test_plus_yearly_has_no_promotion(self):
        set_group_value(GROUP_NEW_BASIC, MODE_BIG)
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        set_group_value(GROUP_BUSINESS_MONTHLY, "on")
        payload = promotion_payload_for_audience(AUDIENCE_PLUS_YEARLY)
        self.assertIsNone(payload["group"])
        self.assertFalse(payload["eligible"])
        self.assertFalse(payload["active"])
        self.assertEqual(payload["offers"], [])

    def test_group3_business_yearly_30(self):
        set_group_value(GROUP_BUSINESS_MONTHLY, "on")
        payload = promotion_payload_for_audience(AUDIENCE_BUSINESS_MONTHLY)
        self.assertEqual(len(payload["offers"]), 1)
        offer = payload["offers"][0]
        self.assertEqual(offer["discount_percent"], 30)
        self.assertEqual(offer["discount_amount_cents"], 4500)
        self.assertEqual(offer["promotional_cents"], 10499)

    def test_business_yearly_never_promoted(self):
        set_group_value(GROUP_NEW_BASIC, MODE_BIG)
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        set_group_value(GROUP_BUSINESS_MONTHLY, "on")
        payload = promotion_payload_for_audience(AUDIENCE_BUSINESS_YEARLY)
        self.assertIsNone(payload["group"])
        self.assertFalse(payload["eligible"])
        self.assertFalse(payload["active"])
        self.assertEqual(payload["offers"], [])

    def test_all_groups_on_isolation(self):
        set_group_value(GROUP_NEW_BASIC, MODE_NORMAL)
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        set_group_value(GROUP_BUSINESS_MONTHLY, "on")
        self.assertEqual(
            promotion_payload_for_audience(AUDIENCE_PUBLIC)["group"], GROUP_NEW_BASIC
        )
        self.assertEqual(
            promotion_payload_for_audience(AUDIENCE_PLUS_MONTHLY)["group"],
            GROUP_PLUS_MONTHLY,
        )
        self.assertIsNone(
            promotion_payload_for_audience(AUDIENCE_PLUS_YEARLY)["group"]
        )
        self.assertEqual(
            promotion_payload_for_audience(AUDIENCE_BUSINESS_MONTHLY)["group"],
            GROUP_BUSINESS_MONTHLY,
        )
        self.assertIsNone(
            promotion_payload_for_audience(AUDIENCE_BUSINESS_YEARLY)["group"]
        )

    def test_admin_snapshot_has_three_groups(self):
        cards = admin_groups_snapshot()
        self.assertEqual(
            [c["group"] for c in cards],
            [GROUP_NEW_BASIC, GROUP_PLUS_MONTHLY, GROUP_BUSINESS_MONTHLY],
        )
        plus_on = next(c for c in cards if c["group"] == GROUP_PLUS_MONTHLY)
        self.assertIn("Business Yearly: 30% off first year", plus_on["choices"][1]["summary"])
        self.assertNotIn("Business Monthly", plus_on["choices"][1]["summary"])
        self.assertNotIn("prorat", plus_on["choices"][1]["summary"].lower())

    def test_catalog_prices_unchanged(self):
        set_group_value(GROUP_NEW_BASIC, MODE_BIG)
        payload = catalog_public_payload()
        self.assertEqual(payload["plans"]["plus"]["intervals"]["monthly"]["cents"], 999)
        self.assertEqual(PRICE_CENTS["plus"]["monthly"], 999)
        self.assertFalse(CHECKOUT_APPLIES_PROMOTION)

    def test_catalog_exposes_entitlement_limits_for_display(self):
        from organizations.entitlements.catalog import get_plan_definition

        payload = catalog_public_payload()
        for plan_key in ("basic", "plus", "business"):
            self.assertEqual(
                payload["entitlements"][plan_key]["limits"],
                get_plan_definition(plan_key)["limits"],
            )
            self.assertEqual(
                payload["entitlements"][plan_key]["features"],
                get_plan_definition(plan_key)["features"],
            )

    def test_ten_fixed_coupon_promotional_amounts(self):
        """Exact first-period cents for all 10 Stripe fixed-amount coupons."""
        expected = {
            # Group 1 NORMAL
            ("new_basic", MODE_NORMAL, "plus", "monthly"): 499,
            ("new_basic", MODE_NORMAL, "business", "monthly"): 749,
            ("new_basic", MODE_NORMAL, "plus", "yearly"): 6999,
            ("new_basic", MODE_NORMAL, "business", "yearly"): 10499,
            # Group 1 BIG
            ("new_basic", MODE_BIG, "plus", "monthly"): 299,
            ("new_basic", MODE_BIG, "business", "monthly"): 449,
            ("new_basic", MODE_BIG, "plus", "yearly"): 4999,
            ("new_basic", MODE_BIG, "business", "yearly"): 7499,
            # Group 2 annual
            ("plus_monthly", "plus_monthly_to_plus_yearly"): 6999,
            ("plus_monthly", "plus_monthly_to_business_yearly"): 10499,
            # Group 3
            ("business_monthly", "business_monthly_to_business_yearly"): 10499,
        }

        set_group_value(GROUP_NEW_BASIC, MODE_NORMAL)
        normal = {
            (o["target_plan"], o["target_interval"]): o
            for o in promotion_payload_for_audience(AUDIENCE_PUBLIC)["offers"]
        }
        for plan, interval in (
            ("plus", "monthly"),
            ("business", "monthly"),
            ("plus", "yearly"),
            ("business", "yearly"),
        ):
            offer = normal[(plan, interval)]
            self.assertEqual(
                offer["promotional_cents"],
                expected[("new_basic", MODE_NORMAL, plan, interval)],
            )
            self.assertEqual(offer["discount_type"], DISCOUNT_TYPE_FIXED_AMOUNT)
            self.assertEqual(offer["renews_at_cents"], price_cents(plan, interval))
            self.assertIsInstance(offer["promotional_amount"], str)

        set_group_value(GROUP_NEW_BASIC, MODE_BIG)
        big = {
            (o["target_plan"], o["target_interval"]): o
            for o in promotion_payload_for_audience(AUDIENCE_PUBLIC)["offers"]
        }
        for plan, interval in (
            ("plus", "monthly"),
            ("business", "monthly"),
            ("plus", "yearly"),
            ("business", "yearly"),
        ):
            offer = big[(plan, interval)]
            self.assertEqual(
                offer["promotional_cents"],
                expected[("new_basic", MODE_BIG, plan, interval)],
            )
            if interval == "yearly":
                self.assertEqual(offer["marketing_discount_percent"], 50)
            else:
                self.assertEqual(offer["marketing_discount_percent"], 70)

        payload = catalog_public_payload()
        plus_y = payload["plans"]["plus"]["intervals"]["yearly"]["promotion"]
        biz_y = payload["plans"]["business"]["intervals"]["yearly"]["promotion"]
        self.assertEqual(plus_y["first_period_formatted"], "$49.99")
        self.assertEqual(biz_y["first_period_formatted"], "$74.99")

        set_group_value(GROUP_PLUS_MONTHLY, "on")
        g2 = {
            o["id"]: o
            for o in promotion_payload_for_audience(AUDIENCE_PLUS_MONTHLY)["offers"]
        }
        self.assertEqual(len(g2), 2)
        self.assertEqual(
            g2["plus_monthly_to_plus_yearly"]["promotional_cents"],
            expected[("plus_monthly", "plus_monthly_to_plus_yearly")],
        )
        self.assertEqual(
            g2["plus_monthly_to_business_yearly"]["promotional_cents"],
            expected[("plus_monthly", "plus_monthly_to_business_yearly")],
        )
        self.assertNotIn("plus_monthly_to_business_monthly_intro", g2)

        set_group_value(GROUP_BUSINESS_MONTHLY, "on")
        g3 = promotion_payload_for_audience(AUDIENCE_BUSINESS_MONTHLY)["offers"][0]
        self.assertEqual(
            g3["promotional_cents"],
            expected[("business_monthly", "business_monthly_to_business_yearly")],
        )

        # Dollar strings for the 10 mapped coupons (Business Yearly $104.99 shared)
        amounts = [
            "4.99",
            "7.49",
            "69.99",
            "104.99",
            "2.99",
            "4.49",
            "49.99",
            "74.99",
            "69.99",
            "104.99",
        ]
        got = [
            cents_to_amount_string(499),
            cents_to_amount_string(749),
            cents_to_amount_string(6999),
            cents_to_amount_string(10499),
            cents_to_amount_string(299),
            cents_to_amount_string(449),
            cents_to_amount_string(4999),
            cents_to_amount_string(7499),
            cents_to_amount_string(6999),
            cents_to_amount_string(10499),
        ]
        self.assertEqual(got, amounts)


class PromotionCatalogApiTests(TestCase):
    def setUp(self):
        PlatformPromotionSettings.load()
        set_group_value(GROUP_NEW_BASIC, MODE_OFF)
        set_group_value(GROUP_PLUS_MONTHLY, "off")
        self.client = APIClient()
        self.owner = User.objects.create_user(
            email="promo-api@example.com", password="password12345"
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.org = Organization.objects.create_with_owner(
            owner=self.owner, internal_label="Promo API Org"
        )

    def test_public_catalog_is_group1_only(self):
        set_group_value(GROUP_NEW_BASIC, MODE_NORMAL)
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        resp = self.client.get("/api/billing/catalog/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["promotion"]["audience"], AUDIENCE_PUBLIC)
        self.assertEqual(resp.data["promotion"]["group"], GROUP_NEW_BASIC)
        self.assertEqual(len(resp.data["promotion"]["offers"]), 4)
        self.assertEqual(
            resp.data["plans"]["plus"]["intervals"]["monthly"]["promotion"][
                "first_period_amount"
            ],
            "4.99",
        )
        self.assertEqual(
            resp.data["plans"]["plus"]["intervals"]["monthly"]["promotion"][
                "discount_type"
            ],
            DISCOUNT_TYPE_FIXED_AMOUNT,
        )
        self.assertEqual(
            resp.data["plans"]["plus"]["intervals"]["monthly"]["promotion"][
                "discount_amount_cents"
            ],
            500,
        )

    def test_owner_billing_uses_subscription_audience(self):
        set_group_value(GROUP_NEW_BASIC, MODE_BIG)
        set_group_value(GROUP_PLUS_MONTHLY, "on")
        _set_paid(self.org, plan="plus", interval=BillingInterval.MONTHLY)
        self.client.force_authenticate(user=self.owner)
        resp = self.client.get("/api/billing/")
        self.assertEqual(resp.status_code, 200)
        promo = resp.data["catalog"]["promotion"]
        self.assertEqual(promo["audience"], AUDIENCE_PLUS_MONTHLY)
        self.assertEqual(promo["group"], GROUP_PLUS_MONTHLY)
        self.assertEqual(len(promo["offers"]), 2)
        # Must not expose Group 1 interval acquisition overlay.
        self.assertFalse(
            resp.data["catalog"]["plans"]["plus"]["intervals"]["monthly"]["promotion"][
                "active"
            ]
        )
        by_id = {o["id"]: o for o in promo["offers"]}
        self.assertEqual(by_id["plus_monthly_to_plus_yearly"]["promotional_amount"], "69.99")
        self.assertEqual(
            by_id["plus_monthly_to_business_yearly"]["promotional_amount"], "104.99"
        )


class PromotionAdminTests(TestCase):
    def setUp(self):
        PlatformPromotionSettings.load()
        set_group_value(GROUP_NEW_BASIC, MODE_OFF)
        set_group_value(GROUP_PLUS_MONTHLY, "off")
        self.admin = User.objects.create_superuser(
            email="promo-admin@example.com",
            password="password12345",
        )
        self.owner = User.objects.create_user(
            email="promo-customer@example.com",
            password="password12345",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])

    def test_admin_can_change_each_group_with_audit(self):
        client = Client()
        force_platform_admin_login(client, self.admin)
        url = reverse("admin:core_platformpromotionsettings_set_group")

        confirm = client.post(
            url,
            {"group": GROUP_NEW_BASIC, "value": MODE_NORMAL, "confirm": "1"},
        )
        self.assertEqual(confirm.status_code, 302)
        settings_obj = PlatformPromotionSettings.load()
        self.assertEqual(settings_obj.new_basic_mode, MODE_NORMAL)

        confirm2 = client.post(
            url,
            {"group": GROUP_PLUS_MONTHLY, "value": "on", "confirm": "1"},
        )
        self.assertEqual(confirm2.status_code, 302)
        settings_obj.refresh_from_db()
        self.assertTrue(settings_obj.plus_monthly_enabled)

        changes = list(PlatformPromotionModeChange.objects.order_by("id"))
        self.assertEqual(changes[-2].group, GROUP_NEW_BASIC)
        self.assertEqual(changes[-2].old_value, MODE_OFF)
        self.assertEqual(changes[-2].new_value, MODE_NORMAL)
        self.assertEqual(changes[-1].group, GROUP_PLUS_MONTHLY)
        self.assertEqual(changes[-1].new_value, "on")
        self.assertTrue(
            LogEntry.objects.filter(
                content_type=ContentType.objects.get_for_model(
                    PlatformPromotionSettings
                ),
                action_flag=CHANGE,
            ).exists()
        )

    def test_change_form_has_single_review_button(self):
        client = Client()
        force_platform_admin_login(client, self.admin)
        settings_obj = PlatformPromotionSettings.load()
        response = client.get(
            reverse(
                "admin:core_platformpromotionsettings_change",
                args=[settings_obj.pk],
            )
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Review New Changes")
        self.assertContains(response, 'class="default cs-promotion-review-btn"')
        self.assertNotContains(response, "Review New / Basic change")
        self.assertNotContains(response, "Review Plus Monthly change")
        self.assertNotContains(response, "Review Business Monthly change")

    def test_review_includes_only_changed_groups(self):
        client = Client()
        force_platform_admin_login(client, self.admin)
        url = reverse("admin:core_platformpromotionsettings_set_group")
        response = client.post(
            url,
            {
                f"value__{GROUP_NEW_BASIC}": MODE_NORMAL,
                f"value__{GROUP_PLUS_MONTHLY}": "off",
                f"value__{GROUP_BUSINESS_MONTHLY}": "on",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Apply promotion changes?")
        self.assertContains(response, "New / Basic")
        self.assertContains(response, "Business Monthly")
        self.assertContains(response, f'name="group" value="{GROUP_NEW_BASIC}"')
        self.assertContains(response, f'name="group" value="{GROUP_BUSINESS_MONTHLY}"')
        self.assertNotContains(
            response, f'name="group" value="{GROUP_PLUS_MONTHLY}"'
        )
        settings_obj = PlatformPromotionSettings.load()
        self.assertEqual(settings_obj.new_basic_mode, MODE_OFF)
        self.assertFalse(settings_obj.business_monthly_enabled)

    def test_unchanged_groups_are_not_reviewed(self):
        client = Client()
        force_platform_admin_login(client, self.admin)
        response = client.post(
            reverse("admin:core_platformpromotionsettings_set_group"),
            {
                f"value__{GROUP_NEW_BASIC}": MODE_OFF,
                f"value__{GROUP_PLUS_MONTHLY}": "off",
                f"value__{GROUP_BUSINESS_MONTHLY}": "off",
            },
            follow=True,
        )
        self.assertContains(response, "No promotion changes to review.")

    def test_confirm_applies_changed_groups_together(self):
        client = Client()
        force_platform_admin_login(client, self.admin)
        confirm = client.post(
            reverse("admin:core_platformpromotionsettings_set_group"),
            {
                "group": [GROUP_NEW_BASIC, GROUP_BUSINESS_MONTHLY],
                "value": [MODE_NORMAL, "on"],
                "confirm": "1",
            },
        )
        self.assertEqual(confirm.status_code, 302)
        settings_obj = PlatformPromotionSettings.load()
        self.assertEqual(settings_obj.new_basic_mode, MODE_NORMAL)
        self.assertTrue(settings_obj.business_monthly_enabled)
        self.assertFalse(settings_obj.plus_monthly_enabled)

    def test_non_platform_user_cannot_change(self):
        before = PlatformPromotionSettings.load()
        app_client = Client()
        app_client.force_login(self.owner)
        admin_post = app_client.post(
            reverse("admin:core_platformpromotionsettings_set_group"),
            {"group": GROUP_NEW_BASIC, "value": MODE_BIG, "confirm": "1"},
        )
        self.assertIn(admin_post.status_code, (302, 403))
        if admin_post.status_code == 302:
            self.assertIn("/admin/login/", admin_post.url)
        before.refresh_from_db()
        self.assertEqual(before.new_basic_mode, MODE_OFF)

    def test_active_and_historical_group_keys(self):
        self.assertEqual(
            list(PromotionGroupKey.values),
            [
                "new_basic",
                "plus_monthly",
                "business_monthly",
                "plus_yearly",
            ],
        )
        self.assertEqual(
            list(NewBasicPromotionMode.values),
            ["off", "normal", "big"],
        )
        with self.assertRaises(ValueError):
            set_group_value("plus_yearly", "on")
