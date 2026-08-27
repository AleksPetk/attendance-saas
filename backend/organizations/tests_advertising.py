"""Effective advertising state, payload, and platform kill switch."""

from django.contrib.admin.models import CHANGE, LogEntry
from django.test import Client, TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from accounts.testing import force_platform_admin_login
from core.models import PlatformAdvertisingSettings
from organizations.entitlements import (
    FEATURE_ADS_REQUIRED,
    PLAN_BASIC,
    PLAN_PLUS,
    advertising_is_active,
    ads_globally_enabled,
    build_advertising_payload,
    build_entitlement_payload,
    workspace_requires_ads,
)
from organizations.entitlements.advertising import AD_PLACEMENTS, AD_PROVIDER_MOCK
from organizations.entitlements.transitions import apply_effective_plan
from organizations.models import Organization, OrganizationPlan


class AdvertisingEffectiveStateTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="ads-owner@example.com",
            password="password12345",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.org = Organization.objects.create_with_owner(
            owner=self.owner,
            internal_label="Ads Org",
        )
        apply_effective_plan(self.org, PLAN_BASIC, source="test")
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        PlatformAdvertisingSettings.load()

    def test_ads_required_remains_on_basic_entitlements(self):
        payload = build_entitlement_payload(self.org)
        self.assertEqual(payload["plan"]["key"], PLAN_BASIC)
        self.assertTrue(payload["features"][FEATURE_ADS_REQUIRED])
        self.assertTrue(workspace_requires_ads(self.org))

    def test_effective_ads_on_when_required_and_switch_on(self):
        settings_obj = PlatformAdvertisingSettings.load()
        settings_obj.ads_globally_enabled = True
        settings_obj.save()
        self.assertTrue(ads_globally_enabled())
        self.assertTrue(advertising_is_active(self.org))
        advertising = build_advertising_payload(self.org)
        self.assertTrue(advertising["enabled"])
        self.assertEqual(advertising["provider"], AD_PROVIDER_MOCK)
        self.assertEqual(advertising["placements"], list(AD_PLACEMENTS))

    def test_effective_ads_off_when_global_switch_off(self):
        settings_obj = PlatformAdvertisingSettings.load()
        settings_obj.ads_globally_enabled = False
        settings_obj.save()
        self.assertTrue(workspace_requires_ads(self.org))
        self.assertFalse(advertising_is_active(self.org))
        advertising = build_advertising_payload(self.org)
        self.assertFalse(advertising["enabled"])
        self.assertEqual(advertising["placements"], [])

    def test_plus_workspace_stays_ad_free(self):
        self.org.plan = OrganizationPlan.PLUS
        self.org.save(update_fields=["plan", "updated_at"])
        self.assertFalse(workspace_requires_ads(self.org))
        self.assertFalse(advertising_is_active(self.org))
        self.assertEqual(build_entitlement_payload(self.org)["plan"]["key"], PLAN_PLUS)
        self.assertFalse(
            build_entitlement_payload(self.org)["features"][FEATURE_ADS_REQUIRED]
        )

    def test_workspace_payload_includes_advertising(self):
        resp = self.client.get("/api/workspace/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["entitlements"]["features"]["ads_required"])
        self.assertTrue(resp.data["advertising"]["enabled"])
        self.assertEqual(resp.data["advertising"]["provider"], "mock")
        settings_obj = PlatformAdvertisingSettings.load()
        settings_obj.ads_globally_enabled = False
        settings_obj.save()
        resp = self.client.get("/api/workspace/")
        self.assertTrue(resp.data["entitlements"]["features"]["ads_required"])
        self.assertFalse(resp.data["advertising"]["enabled"])

    def test_workspace_user_cannot_change_global_switch(self):
        before = PlatformAdvertisingSettings.load()
        self.assertTrue(before.ads_globally_enabled)
        denied = self.client.post(
            "/api/workspace/",
            {"ads_globally_enabled": False},
            format="json",
        )
        self.assertEqual(denied.status_code, 405)
        missing = self.client.post(
            "/api/advertising/",
            {"ads_globally_enabled": False},
            format="json",
        )
        self.assertEqual(missing.status_code, 404)
        before.refresh_from_db()
        self.assertTrue(before.ads_globally_enabled)

        app_client = Client()
        app_client.force_login(self.owner)
        admin_post = app_client.post(
            reverse("admin:core_platformadvertisingsettings_toggle"),
            {"confirm": "1"},
        )
        self.assertIn(admin_post.status_code, (302, 403))
        if admin_post.status_code == 302:
            self.assertIn("/admin/login/", admin_post.url)
        before.refresh_from_db()
        self.assertTrue(before.ads_globally_enabled)

    def test_singleton_cannot_fork(self):
        first = PlatformAdvertisingSettings.load()
        second = PlatformAdvertisingSettings(ads_globally_enabled=False)
        second.save()
        self.assertEqual(PlatformAdvertisingSettings.objects.count(), 1)
        self.assertEqual(first.pk, second.pk)
        first.refresh_from_db()
        self.assertFalse(first.ads_globally_enabled)


class PlatformAdvertisingAdminTests(TestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser(
            email="ads-admin@example.com",
            password="secure-password",
        )
        self.client = Client()
        force_platform_admin_login(self.client, self.superuser)
        self.settings_obj = PlatformAdvertisingSettings.load()

    def test_dashboard_shows_advertising_control(self):
        response = self.client.get("/admin/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Advertising")
        self.assertContains(response, "Enabled")
        self.assertContains(response, "Disable advertising")
        self.assertContains(
            response, reverse("admin:core_platformadvertisingsettings_toggle")
        )

    def test_toggle_requires_confirmation_then_persists(self):
        get_page = self.client.get(
            reverse("admin:core_platformadvertisingsettings_toggle")
        )
        self.assertEqual(get_page.status_code, 200)
        self.assertContains(get_page, "Disable all advertising?")
        self.assertContains(
            get_page,
            "Advertising will temporarily disappear from workspaces that normally require it.",
        )

        unconfirmed = self.client.post(
            reverse("admin:core_platformadvertisingsettings_toggle"),
            {},
        )
        self.assertEqual(unconfirmed.status_code, 200)
        self.settings_obj.refresh_from_db()
        self.assertTrue(self.settings_obj.ads_globally_enabled)

        confirmed = self.client.post(
            reverse("admin:core_platformadvertisingsettings_toggle"),
            {"confirm": "1"},
        )
        self.assertEqual(confirmed.status_code, 302)
        self.settings_obj.refresh_from_db()
        self.assertFalse(self.settings_obj.ads_globally_enabled)
        self.assertEqual(self.settings_obj.changed_by_id, self.superuser.pk)
        self.assertTrue(
            LogEntry.objects.filter(
                user=self.superuser,
                action_flag=CHANGE,
                object_id=str(self.settings_obj.pk),
            ).exists()
        )
