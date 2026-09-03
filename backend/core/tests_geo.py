"""Trusted Cloudflare geo → market / locale defaults."""

from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from accounts.services import provision_verified_owner
from billing.markets import MARKET_GLOBAL, MARKET_JP
from core.geo import (
    TRUSTED_COUNTRY_HEADER,
    public_geo_payload,
    resolve_request_geo,
)
from organizations.models import BillingMarketOverride, Organization


def _request_with_country(country: str):
    factory = RequestFactory()
    request = factory.get("/api/geo/")
    if country is not None:
        request.META[TRUSTED_COUNTRY_HEADER] = country
    return request


class GeoHelperTests(SimpleTestCase):
    def test_jp_resolves_jp_market_and_ja_locale(self):
        geo = resolve_request_geo(_request_with_country("JP"))
        self.assertEqual(geo.country_code, "JP")
        self.assertEqual(geo.billing_market, MARKET_JP)
        self.assertEqual(geo.default_locale, "ja")

    def test_us_resolves_global_and_en(self):
        geo = resolve_request_geo(_request_with_country("US"))
        self.assertEqual(geo.country_code, "US")
        self.assertEqual(geo.billing_market, MARKET_GLOBAL)
        self.assertEqual(geo.default_locale, "en")

    def test_missing_xx_and_t1_fall_back_global_en(self):
        for raw in ("", "XX", "T1", "xx", "bogus", "J"):
            with self.subTest(raw=raw):
                geo = resolve_request_geo(_request_with_country(raw))
                self.assertEqual(geo.billing_market, MARKET_GLOBAL)
                self.assertEqual(geo.default_locale, "en")

    def test_raw_cf_ipcountry_is_ignored(self):
        factory = RequestFactory()
        request = factory.get("/api/geo/", HTTP_CF_IPCOUNTRY="JP")
        geo = resolve_request_geo(request)
        self.assertEqual(geo.billing_market, MARKET_GLOBAL)
        self.assertEqual(geo.country_code, "")

    def test_payload_omits_ip_fields(self):
        payload = public_geo_payload(_request_with_country("JP"))
        self.assertEqual(
            set(payload.keys()),
            {"country_code", "billing_market", "default_locale"},
        )
        self.assertNotIn("ip", payload)
        self.assertNotIn("remote_addr", payload)


@override_settings(
    BILLING_PROVIDER="fake",
    STRIPE_SECRET_KEY="sk_test_fake",
    STRIPE_PRICE_PLUS_MONTHLY="price_global_plus_monthly",
    STRIPE_PRICE_PLUS_YEARLY="price_global_plus_yearly",
    STRIPE_PRICE_BUSINESS_MONTHLY="price_global_business_monthly",
    STRIPE_PRICE_BUSINESS_YEARLY="price_global_business_yearly",
    STRIPE_PRICE_JP_PLUS_MONTHLY="price_jp_plus_monthly",
    STRIPE_PRICE_JP_PLUS_YEARLY="price_jp_plus_yearly",
    STRIPE_PRICE_JP_BUSINESS_MONTHLY="price_jp_business_monthly",
    STRIPE_PRICE_JP_BUSINESS_YEARLY="price_jp_business_yearly",
)
class GeoCatalogAndRegistrationTests(TestCase):
    def test_anonymous_catalog_follows_trusted_geo(self):
        client = APIClient()
        jp = client.get("/api/billing/catalog/", **{TRUSTED_COUNTRY_HEADER: "JP"})
        self.assertEqual(jp.status_code, 200)
        self.assertEqual(jp.data["market"], MARKET_JP)
        self.assertEqual(jp.data["currency"], "jpy")
        self.assertEqual(jp.data["geo"]["default_locale"], "ja")
        self.assertEqual(
            jp.data["plans"]["plus"]["intervals"]["monthly"]["formatted"],
            "¥980",
        )

        us = client.get("/api/billing/catalog/", **{TRUSTED_COUNTRY_HEADER: "US"})
        self.assertEqual(us.data["market"], MARKET_GLOBAL)
        self.assertEqual(us.data["currency"], "usd")
        self.assertEqual(us.data["geo"]["default_locale"], "en")

    def test_anonymous_catalog_ignores_market_query_and_spoofed_cf_header(self):
        client = APIClient()
        spoofed = client.get(
            "/api/billing/catalog/?market=jp",
            HTTP_CF_IPCOUNTRY="JP",
            HTTP_ACCEPT_LANGUAGE="ja",
        )
        self.assertEqual(spoofed.data["market"], MARKET_GLOBAL)
        self.assertEqual(spoofed.data["currency"], "usd")

    def test_public_geo_endpoint(self):
        client = APIClient()
        response = client.get("/api/geo/", **{TRUSTED_COUNTRY_HEADER: "JP"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data,
            {
                "country_code": "JP",
                "billing_market": MARKET_JP,
                "default_locale": "ja",
            },
        )

    def test_registration_locks_jp_and_client_cannot_override(self):
        client = APIClient()
        response = client.post(
            "/api/auth/register/",
            {
                "email": "jp-lock@example.com",
                "password": "secure-password-12",
                "password_confirm": "secure-password-12",
                "legal_acknowledgement": True,
                "locale": "en",
                "billing_market": "global",
                "market": "global",
            },
            format="json",
            **{TRUSTED_COUNTRY_HEADER: "JP"},
        )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email="jp-lock@example.com")
        self.assertEqual(user.signup_billing_market, MARKET_JP)
        self.assertEqual(user.preferred_language, "en")
        provision_verified_owner(user)
        org = Organization.objects.get(owner=user)
        self.assertEqual(org.billing_market_override, BillingMarketOverride.JP)

    def test_registration_locks_global_outside_japan(self):
        client = APIClient()
        response = client.post(
            "/api/auth/register/",
            {
                "email": "us-lock@example.com",
                "password": "secure-password-12",
                "password_confirm": "secure-password-12",
                "legal_acknowledgement": True,
                "locale": "ja",
            },
            format="json",
            **{TRUSTED_COUNTRY_HEADER: "US"},
        )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email="us-lock@example.com")
        self.assertEqual(user.signup_billing_market, MARKET_GLOBAL)
        self.assertEqual(user.preferred_language, "ja")
        provision_verified_owner(user)
        org = Organization.objects.get(owner=user)
        self.assertEqual(org.billing_market_override, BillingMarketOverride.GLOBAL)

    def test_existing_auto_org_unaffected_by_request_geo(self):
        owner = User.objects.create_user(
            email="auto-owner@example.com", password="secure-password-12"
        )
        owner.mark_email_verified()
        org = Organization.objects.create_with_owner(owner=owner)
        self.assertEqual(org.billing_market_override, BillingMarketOverride.AUTO)
        client = APIClient()
        client.force_authenticate(user=owner)
        response = client.get(
            "/api/billing/catalog/",
            **{TRUSTED_COUNTRY_HEADER: "JP"},
        )
        self.assertEqual(response.data["market"], MARKET_GLOBAL)
        org.refresh_from_db()
        self.assertEqual(org.billing_market_override, BillingMarketOverride.AUTO)

    def test_language_does_not_select_market(self):
        client = APIClient()
        ja_ui_us = client.get(
            "/api/billing/catalog/",
            HTTP_ACCEPT_LANGUAGE="ja",
            **{TRUSTED_COUNTRY_HEADER: "US"},
        )
        self.assertEqual(ja_ui_us.data["market"], MARKET_GLOBAL)
        en_ui_jp = client.get(
            "/api/billing/catalog/",
            HTTP_ACCEPT_LANGUAGE="en",
            **{TRUSTED_COUNTRY_HEADER: "JP"},
        )
        self.assertEqual(en_ui_jp.data["market"], MARKET_JP)
