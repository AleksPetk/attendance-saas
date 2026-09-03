from copy import deepcopy

from django.core.exceptions import ValidationError
from django.forms.models import model_to_dict
from django.contrib.admin.models import LogEntry
from django.test import Client, TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from accounts.testing import force_platform_admin_login
from billing.catalog import PRICE_CENTS, catalog_public_payload
from billing.markets import MARKET_GLOBAL, MARKET_JP
from billing.promotion import GROUP_NEW_BASIC, MODE_NORMAL, set_group_value
from billing.state import build_billing_state
from core.models import (
    PlatformPricingTemplateSettings,
    PlatformPromotionalTextSettings,
    PlatformPromotionSettings,
    PromotionalTextMarketMode,
)
from core.pricing_templates import set_pricing_template
from core.promotional_text import (
    get_promotional_display_for_market,
    normalize_promotional_text_style,
    promotional_text_payload,
)
from organizations.models import BillingMarketOverride, Organization


def _promotion_snapshot():
    return model_to_dict(PlatformPromotionSettings.load())


def _style(key, label):
    return {"key": key, "display_name": label}


class PromotionalTextCatalogTests(TestCase):
    def setUp(self):
        PlatformPromotionalTextSettings.load()
        PlatformPricingTemplateSettings.load()
        PlatformPromotionSettings.load()
        set_group_value(GROUP_NEW_BASIC, MODE_NORMAL)

    def test_enabled_and_disabled_payload(self):
        settings_obj = PlatformPromotionalTextSettings.load()
        self.assertEqual(settings_obj.mode, PromotionalTextMarketMode.TOGETHER)
        self.assertEqual(
            promotional_text_payload(settings_obj=settings_obj),
            {
                "enabled": False,
                "text": "",
                "style": _style("normal", "Normal"),
            },
        )
        settings_obj.enabled = True
        settings_obj.text = "100% OFF"
        settings_obj.save(update_fields=["enabled", "text", "updated_at"])
        self.assertEqual(
            promotional_text_payload(),
            {
                "enabled": True,
                "text": "100% OFF",
                "style": _style("normal", "Normal"),
            },
        )
        settings_obj.enabled = False
        settings_obj.save(update_fields=["enabled", "updated_at"])
        self.assertEqual(
            promotional_text_payload(),
            {
                "enabled": False,
                "text": "100% OFF",
                "style": _style("normal", "Normal"),
            },
        )

    def test_market_mode_choices_are_validated(self):
        settings_obj = PlatformPromotionalTextSettings.load()
        self.assertEqual(
            set(PromotionalTextMarketMode.values),
            {"together", "separate"},
        )
        settings_obj.mode = "language_based"
        with self.assertRaises(ValidationError):
            settings_obj.full_clean()

    def test_together_mode_preserves_shared_configuration_for_both_markets(self):
        settings_obj = PlatformPromotionalTextSettings.load()
        settings_obj.mode = PromotionalTextMarketMode.TOGETHER
        settings_obj.enabled = True
        settings_obj.text = "Shared Campaign"
        settings_obj.text_style = "dark_fantasy"
        settings_obj.global_enabled = False
        settings_obj.jp_enabled = False
        settings_obj.save()

        expected = {
            "enabled": True,
            "text": "Shared Campaign",
            "style": _style("dark_fantasy", "Dark Fantasy"),
        }
        self.assertEqual(get_promotional_display_for_market(MARKET_GLOBAL), expected)
        self.assertEqual(get_promotional_display_for_market(MARKET_JP), expected)

        settings_obj.enabled = False
        settings_obj.save(update_fields=["enabled", "updated_at"])
        self.assertFalse(get_promotional_display_for_market(MARKET_GLOBAL)["enabled"])
        self.assertFalse(get_promotional_display_for_market(MARKET_JP)["enabled"])

    def test_separate_mode_supports_independent_status_message_and_style(self):
        settings_obj = PlatformPromotionalTextSettings.load()
        settings_obj.mode = PromotionalTextMarketMode.SEPARATE
        settings_obj.global_text = "Summer Sale"
        settings_obj.global_text_style = "dark_fantasy"
        settings_obj.jp_text = "Golden Week Discount"
        settings_obj.jp_text_style = "arcade"

        for global_enabled, jp_enabled in (
            (True, False),
            (False, True),
            (True, True),
            (False, False),
        ):
            with self.subTest(global_enabled=global_enabled, jp_enabled=jp_enabled):
                settings_obj.global_enabled = global_enabled
                settings_obj.jp_enabled = jp_enabled
                settings_obj.save()
                self.assertEqual(
                    get_promotional_display_for_market(MARKET_GLOBAL),
                    {
                        "enabled": global_enabled,
                        "text": "Summer Sale",
                        "style": _style("dark_fantasy", "Dark Fantasy"),
                    },
                )
                self.assertEqual(
                    get_promotional_display_for_market(MARKET_JP),
                    {
                        "enabled": jp_enabled,
                        "text": "Golden Week Discount",
                        "style": _style("arcade", "Arcade"),
                    },
                )

    def test_style_keys_and_safe_fallback(self):
        labels = {
            "normal": "Normal",
            "spring": "Spring",
            "summer": "Summer",
            "autumn": "Autumn",
            "winter": "Winter",
            "halloween": "Halloween",
            "christmas_new_year": "Christmas & New Year",
            "black_friday": "Black Friday",
            "luxury_gold": "Luxury Gold",
            "cyberpunk": "Cyberpunk",
            "retro_sale": "Retro Sale",
            "dark_fantasy": "Dark Fantasy",
            "editorial": "Editorial",
            "impact_sale": "Impact Sale",
            "arcade": "Arcade",
        }
        settings_obj = PlatformPromotionalTextSettings.load()
        for key, label in labels.items():
            with self.subTest(style=key):
                settings_obj.text_style = key
                self.assertEqual(
                    promotional_text_payload(settings_obj=settings_obj)["style"],
                    _style(key, label),
                )

        self.assertEqual(normalize_promotional_text_style("unknown"), "normal")
        settings_obj.text_style = "unknown"
        self.assertEqual(
            promotional_text_payload(settings_obj=settings_obj)["style"],
            _style("normal", "Normal"),
        )

    def test_custom_text_is_shared_by_public_and_workspace_catalogs(self):
        owner = User.objects.create_user(
            email="promotional-text-owner@example.com",
            password="password12345",
        )
        owner.email_verified = True
        owner.save(update_fields=["email_verified"])
        organization = Organization.objects.create_with_owner(
            owner=owner,
            internal_label="Promotional Text Workspace",
        )
        settings_obj = PlatformPromotionalTextSettings.load()
        settings_obj.enabled = True
        settings_obj.text = "Autumn Sale"
        settings_obj.text_style = "summer"
        settings_obj.save(
            update_fields=["enabled", "text", "text_style", "updated_at"]
        )

        public_response = APIClient().get("/api/billing/catalog/")
        workspace_state = build_billing_state(organization)

        self.assertEqual(public_response.status_code, 200)
        self.assertEqual(
            public_response.data["promotional_text"],
            {
                "enabled": True,
                "text": "Autumn Sale",
                "style": _style("summer", "Summer"),
            },
        )
        self.assertEqual(
            workspace_state["catalog"]["promotional_text"],
            {
                "enabled": True,
                "text": "Autumn Sale",
                "style": _style("summer", "Summer"),
            },
        )

    def test_catalog_resolves_separate_text_by_effective_market_not_language(self):
        owner = User.objects.create_user(
            email="promotional-market-owner@example.com",
            password="password12345",
            preferred_language="ja",
        )
        owner.email_verified = True
        owner.save(update_fields=["email_verified"])
        organization = Organization.objects.create_with_owner(
            owner=owner,
            internal_label="Promotional Market Workspace",
        )
        settings_obj = PlatformPromotionalTextSettings.load()
        settings_obj.mode = PromotionalTextMarketMode.SEPARATE
        settings_obj.global_enabled = True
        settings_obj.global_text = "Global Campaign"
        settings_obj.global_text_style = "summer"
        settings_obj.jp_enabled = True
        settings_obj.jp_text = "Japan Campaign"
        settings_obj.jp_text_style = "spring"
        settings_obj.save()

        organization.billing_market_override = BillingMarketOverride.GLOBAL
        organization.save(update_fields=["billing_market_override", "updated_at"])
        global_state = build_billing_state(organization)
        self.assertEqual(global_state["catalog"]["promotional_text"]["text"], "Global Campaign")
        self.assertEqual(global_state["catalog"]["currency"], "usd")

        owner.preferred_language = "en"
        owner.save(update_fields=["preferred_language"])
        organization.billing_market_override = BillingMarketOverride.JP
        organization.save(update_fields=["billing_market_override", "updated_at"])
        jp_state = build_billing_state(organization)
        self.assertEqual(jp_state["catalog"]["promotional_text"]["text"], "Japan Campaign")
        self.assertEqual(jp_state["catalog"]["currency"], "jpy")

    def test_anonymous_public_catalog_always_uses_global_display_text(self):
        settings_obj = PlatformPromotionalTextSettings.load()
        settings_obj.mode = PromotionalTextMarketMode.SEPARATE
        settings_obj.global_enabled = True
        settings_obj.global_text = "Global Public Campaign"
        settings_obj.jp_enabled = True
        settings_obj.jp_text = "Japan Campaign"
        settings_obj.save()

        client = APIClient()
        for query, language in (("", "en"), ("?language=ja", "ja")):
            with self.subTest(query=query, language=language):
                response = client.get(
                    f"/api/billing/catalog/{query}",
                    HTTP_ACCEPT_LANGUAGE=language,
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data["market"], MARKET_GLOBAL)
                self.assertEqual(
                    response.data["promotional_text"]["text"],
                    "Global Public Campaign",
                )
    def test_text_change_does_not_change_pricing_promotions_or_template(self):
        set_pricing_template("christmas_new_year")
        before_catalog = catalog_public_payload()
        before_prices = deepcopy(PRICE_CENTS)
        before_promotions = _promotion_snapshot()

        settings_obj = PlatformPromotionalTextSettings.load()
        settings_obj.enabled = True
        settings_obj.text = "100% OFF"
        settings_obj.text_style = "cyberpunk"
        settings_obj.save(
            update_fields=["enabled", "text", "text_style", "updated_at"]
        )

        after_catalog = catalog_public_payload()
        self.assertEqual(
            after_catalog["promotional_text"],
            {
                "enabled": True,
                "text": "100% OFF",
                "style": _style("cyberpunk", "Cyberpunk"),
            },
        )
        before_without_text = deepcopy(before_catalog)
        after_without_text = deepcopy(after_catalog)
        before_without_text.pop("promotional_text")
        after_without_text.pop("promotional_text")
        self.assertEqual(after_without_text, before_without_text)
        self.assertEqual(PRICE_CENTS, before_prices)
        self.assertEqual(after_catalog["plans"], before_catalog["plans"])
        self.assertEqual(after_catalog["promotion"], before_catalog["promotion"])
        self.assertEqual(_promotion_snapshot(), before_promotions)
        self.assertEqual(
            after_catalog["pricing_template"],
            {
                "key": "christmas_new_year",
                "display_name": "Christmas & New Year",
            },
        )

    def test_separate_text_does_not_change_either_market_catalog_economics(self):
        before = {
            market: catalog_public_payload(market=market)
            for market in (MARKET_GLOBAL, MARKET_JP)
        }
        settings_obj = PlatformPromotionalTextSettings.load()
        settings_obj.mode = PromotionalTextMarketMode.SEPARATE
        settings_obj.global_enabled = True
        settings_obj.global_text = "Global Display Only"
        settings_obj.global_text_style = "luxury_gold"
        settings_obj.jp_enabled = True
        settings_obj.jp_text = "Japan Display Only"
        settings_obj.jp_text_style = "editorial"
        settings_obj.save()

        for market in (MARKET_GLOBAL, MARKET_JP):
            with self.subTest(market=market):
                after = catalog_public_payload(market=market)
                before_without_text = deepcopy(before[market])
                after_without_text = deepcopy(after)
                before_without_text.pop("promotional_text")
                after_without_text.pop("promotional_text")
                self.assertEqual(after_without_text, before_without_text)
class PromotionalTextAdminTests(TestCase):
    def setUp(self):
        PlatformPromotionalTextSettings.load()
        self.admin = User.objects.create_superuser(
            email="promotional-text-admin@example.com",
            password="password12345",
        )
        self.client = Client()
        force_platform_admin_login(self.client, self.admin)

    def test_admin_labels_and_updates_display_only_setting(self):
        settings_obj = PlatformPromotionalTextSettings.load()
        change_url = reverse(
            "admin:core_platformpromotionaltextsettings_change",
            args=[settings_obj.pk],
        )

        response = self.client.get(change_url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Display text only")
        self.assertContains(response, "does not change prices")
        self.assertContains(response, 'name="mode"')
        self.assertContains(response, "Markets Together")
        self.assertContains(response, "Markets Separate")
        self.assertContains(response, 'name="text_style"')
        self.assertContains(response, 'name="global_text_style"')
        self.assertContains(response, 'name="jp_text_style"')
        self.assertContains(response, "Christmas &amp; New Year")
        self.assertContains(response, "Luxury Gold")
        self.assertContains(response, "Arcade")

        saved = self.client.post(
            change_url,
            {
                "mode": "separate",
                "enabled": "on",
                "text": "100% OFF",
                "text_style": "arcade",
                "global_enabled": "on",
                "global_text": "Summer Sale",
                "global_text_style": "dark_fantasy",
                "jp_text": "Golden Week Discount",
                "jp_text_style": "editorial",
                "_save": "Save",
            },
        )
        self.assertEqual(saved.status_code, 302)
        settings_obj.refresh_from_db()
        self.assertEqual(settings_obj.mode, PromotionalTextMarketMode.SEPARATE)
        self.assertTrue(settings_obj.enabled)
        self.assertEqual(settings_obj.text, "100% OFF")
        self.assertEqual(settings_obj.text_style, "arcade")
        self.assertTrue(settings_obj.global_enabled)
        self.assertEqual(settings_obj.global_text, "Summer Sale")
        self.assertFalse(settings_obj.jp_enabled)
        self.assertEqual(settings_obj.jp_text, "Golden Week Discount")
        self.assertEqual(settings_obj.jp_text_style, "editorial")
        self.assertEqual(settings_obj.changed_by, self.admin)
        history = LogEntry.objects.filter(
            object_id=str(settings_obj.pk),
            content_type__app_label="core",
            content_type__model="platformpromotionaltextsettings",
        ).latest("action_time")
        self.assertIn("Market Mode", history.change_message)
        self.assertIn("Global Message", history.change_message)
        self.assertIn("Japan Message", history.change_message)
