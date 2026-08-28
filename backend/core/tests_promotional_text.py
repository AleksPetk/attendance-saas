from copy import deepcopy

from django.forms.models import model_to_dict
from django.test import Client, TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from accounts.testing import force_platform_admin_login
from billing.catalog import PRICE_CENTS, catalog_public_payload
from billing.promotion import GROUP_NEW_BASIC, MODE_NORMAL, set_group_value
from billing.state import build_billing_state
from core.models import (
    PlatformPricingTemplateSettings,
    PlatformPromotionalTextSettings,
    PlatformPromotionSettings,
)
from core.pricing_templates import set_pricing_template
from core.promotional_text import (
    normalize_promotional_text_style,
    promotional_text_payload,
)
from organizations.models import Organization


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
        self.assertContains(response, 'name="text_style"')
        self.assertContains(response, "Christmas &amp; New Year")
        self.assertContains(response, "Luxury Gold")
        self.assertContains(response, "Arcade")

        saved = self.client.post(
            change_url,
            {
                "enabled": "on",
                "text": "100% OFF",
                "text_style": "arcade",
                "_save": "Save",
            },
        )
        self.assertEqual(saved.status_code, 302)
        settings_obj.refresh_from_db()
        self.assertTrue(settings_obj.enabled)
        self.assertEqual(settings_obj.text, "100% OFF")
        self.assertEqual(settings_obj.text_style, "arcade")
        self.assertEqual(settings_obj.changed_by, self.admin)
