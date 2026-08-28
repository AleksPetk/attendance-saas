from copy import deepcopy
from types import SimpleNamespace

from django.forms.models import model_to_dict
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from accounts.testing import force_platform_admin_login
from billing.catalog import PRICE_CENTS, catalog_public_payload
from billing.coupons import ALL_COUPON_SETTING_NAMES, coupon_id_for_setting
from billing.prices import price_id_for
from billing.promotion import GROUP_NEW_BASIC, MODE_NORMAL, set_group_value
from billing.state import build_billing_state
from core.models import PlatformPricingTemplateSettings, PlatformPromotionSettings
from core.pricing_templates import (
    normalize_pricing_template,
    pricing_template_payload,
    set_pricing_template,
)
from organizations.models import Organization


STRIPE_PRICE_SETTINGS = {
    "STRIPE_PRICE_PLUS_MONTHLY": "price_plus_monthly",
    "STRIPE_PRICE_PLUS_YEARLY": "price_plus_yearly",
    "STRIPE_PRICE_BUSINESS_MONTHLY": "price_business_monthly",
    "STRIPE_PRICE_BUSINESS_YEARLY": "price_business_yearly",
}


def _promotion_snapshot():
    return model_to_dict(PlatformPromotionSettings.load())


class PricingTemplateCatalogTests(TestCase):
    def setUp(self):
        PlatformPricingTemplateSettings.load()
        PlatformPromotionSettings.load()
        set_group_value(GROUP_NEW_BASIC, MODE_NORMAL)

    def test_normal_is_the_safe_default_and_fallback(self):
        self.assertEqual(
            PlatformPricingTemplateSettings.load().active_template,
            "normal",
        )
        self.assertEqual(pricing_template_payload()["key"], "normal")
        self.assertEqual(normalize_pricing_template("not-a-template"), "normal")
        self.assertEqual(
            pricing_template_payload(
                settings_obj=SimpleNamespace(active_template="not-a-template")
            ),
            {"key": "normal", "display_name": "Normal"},
        )

    @override_settings(**STRIPE_PRICE_SETTINGS)
    def test_switching_changes_only_the_presentation_field(self):
        before_catalog = catalog_public_payload()
        before_prices = deepcopy(PRICE_CENTS)
        before_promotions = _promotion_snapshot()
        before_coupon_ids = {
            name: coupon_id_for_setting(name) for name in ALL_COUPON_SETTING_NAMES
        }
        before_stripe_prices = {
            (plan, interval): price_id_for(plan, interval)
            for plan in ("plus", "business")
            for interval in ("monthly", "yearly")
        }

        settings_obj, changed = set_pricing_template("autumn")

        self.assertTrue(changed)
        self.assertEqual(settings_obj.active_template, "autumn")
        after_catalog = catalog_public_payload()
        self.assertEqual(after_catalog["pricing_template"]["key"], "autumn")

        before_without_template = deepcopy(before_catalog)
        after_without_template = deepcopy(after_catalog)
        before_without_template.pop("pricing_template")
        after_without_template.pop("pricing_template")
        self.assertEqual(after_without_template, before_without_template)

        self.assertEqual(PRICE_CENTS, before_prices, "canonical prices changed")
        self.assertEqual(
            after_catalog["plans"],
            before_catalog["plans"],
            "discounted/list prices changed",
        )
        self.assertEqual(
            after_catalog["promotion"],
            before_catalog["promotion"],
            "promotion state changed",
        )
        self.assertEqual(
            after_catalog["entitlements"],
            before_catalog["entitlements"],
            "plan limits or entitlements changed",
        )
        self.assertEqual(_promotion_snapshot(), before_promotions)
        self.assertEqual(
            {
                name: coupon_id_for_setting(name)
                for name in ALL_COUPON_SETTING_NAMES
            },
            before_coupon_ids,
            "Stripe coupon mappings changed",
        )
        self.assertEqual(
            {
                (plan, interval): price_id_for(plan, interval)
                for plan in ("plus", "business")
                for interval in ("monthly", "yearly")
            },
            before_stripe_prices,
            "Stripe price mappings changed",
        )

        normal_settings, changed_back = set_pricing_template("normal")
        self.assertTrue(changed_back)
        self.assertEqual(normal_settings.active_template, "normal")
        self.assertEqual(catalog_public_payload(), before_catalog)

    def test_every_registered_template_preserves_live_catalog_data(self):
        baseline = catalog_public_payload()
        baseline_without_template = deepcopy(baseline)
        baseline_without_template.pop("pricing_template")

        for template in (
            "spring",
            "summer",
            "autumn",
            "winter",
            "halloween",
            "christmas_new_year",
            "black_friday",
        ):
            with self.subTest(template=template):
                set_pricing_template(template)
                current = catalog_public_payload()
                self.assertEqual(current["pricing_template"]["key"], template)
                current_without_template = deepcopy(current)
                current_without_template.pop("pricing_template")
                self.assertEqual(current_without_template, baseline_without_template)

        set_pricing_template("normal")
        self.assertEqual(catalog_public_payload(), baseline)

    def test_public_and_workspace_catalogs_share_the_active_template(self):
        owner = User.objects.create_user(
            email="template-owner@example.com", password="password12345"
        )
        owner.email_verified = True
        owner.save(update_fields=["email_verified"])
        organization = Organization.objects.create_with_owner(
            owner=owner, internal_label="Template Workspace"
        )
        set_pricing_template("black_friday")

        api_response = APIClient().get("/api/billing/catalog/")
        workspace_state = build_billing_state(organization)

        self.assertEqual(api_response.status_code, 200)
        self.assertEqual(
            api_response.data["pricing_template"]["key"],
            "black_friday",
        )
        self.assertEqual(
            workspace_state["catalog"]["pricing_template"]["key"],
            "black_friday",
        )


class PricingTemplateAdminTests(TestCase):
    def setUp(self):
        PlatformPricingTemplateSettings.load()
        PlatformPromotionSettings.load()
        set_group_value(GROUP_NEW_BASIC, MODE_NORMAL)
        self.admin = User.objects.create_superuser(
            email="template-admin@example.com", password="password12345"
        )
        self.client = Client()
        force_platform_admin_login(self.client, self.admin)

    def test_dashboard_exposes_price_template_control(self):
        response = self.client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Price Templates")
        self.assertContains(response, "Review change")
        content = response.content.decode()
        positions = [
            content.index(f'option value="{template}"')
            for template in (
                "normal",
                "spring",
                "summer",
                "autumn",
                "winter",
                "halloween",
                "christmas_new_year",
                "black_friday",
            )
        ]
        self.assertEqual(positions, sorted(positions))

    def test_change_requires_confirmation_and_does_not_touch_promotions(self):
        url = reverse("admin:core_platformpricingtemplatesettings_set_template")
        before_promotions = _promotion_snapshot()

        review = self.client.get(url, {"template": "autumn"})
        self.assertEqual(review.status_code, 200)
        self.assertContains(review, "Use the Autumn pricing card template?")
        self.assertEqual(
            PlatformPricingTemplateSettings.load().active_template,
            "normal",
        )

        saved = self.client.post(
            url,
            {"template": "autumn", "confirm": "1"},
        )
        self.assertEqual(saved.status_code, 302)
        settings_obj = PlatformPricingTemplateSettings.load()
        self.assertEqual(settings_obj.active_template, "autumn")
        self.assertEqual(settings_obj.changed_by, self.admin)
        self.assertEqual(_promotion_snapshot(), before_promotions)

    def test_invalid_template_keeps_normal(self):
        response = self.client.post(
            reverse("admin:core_platformpricingtemplatesettings_set_template"),
            {"template": "made-up", "confirm": "1"},
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            PlatformPricingTemplateSettings.load().active_template,
            "normal",
        )
