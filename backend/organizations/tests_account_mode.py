from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from billing.exceptions import BillingStateError
from billing.fake_provider import get_fake_provider
from billing.models import PurchaseSource, WorkspaceSubscription
from billing.coupons import resolve_checkout_coupon
from billing.promotion import (
    AUDIENCE_NONE,
    AUDIENCE_PUBLIC,
    MODE_NORMAL,
    resolve_audience,
)
from core.models import PlatformPromotionSettings
from billing.services import activate_paid_subscription, get_workspace_billing, lock_workspace_billing
from billing.state import build_billing_state
from groups.models import Group, GroupType
from organizations.account_mode import ACCOUNT_MODE_CHECKSTATION, ACCOUNT_MODE_NORMAL
from organizations.entitlements.transitions import apply_effective_plan
from organizations.lifecycle import (
    change_checkstation_plan,
    turn_checkstation_account_off,
    turn_checkstation_account_on,
)
from organizations.models import Organization, OrganizationPlan, OrganizationStatus

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


def create_user(email, *, password="secure-password"):
    user = User.objects.create_user(email=email, password=password)
    user.mark_email_verified()
    return user


def login_owner(api, email, password="secure-password"):
    response = api.post(
        "/api/auth/login/",
        {"email": email, "password": password},
        format="json",
    )
    assert response.status_code == 200
    return api


class CheckStationAccountFieldTests(TestCase):
    def test_new_organization_defaults_off_and_active(self):
        owner = create_user("mode-default@example.com")
        org = Organization.objects.create_with_owner(owner=owner)
        org.refresh_from_db()
        self.assertFalse(org.is_checkstation_account)
        self.assertEqual(org.status, OrganizationStatus.ACTIVE)
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        self.assertIsNone(org.blocked_at)


@override_settings(**STRIPE_TEST_SETTINGS)
class CheckStationAccountOnOffTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = create_user("checkstation-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.api = login_owner(APIClient(), "checkstation-owner@example.com")

    def test_on_refuses_live_subscription(self):
        start = timezone.now()
        activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=start,
            current_period_end=start + timedelta(days=30),
            external_subscription_id="sub_live",
            external_customer_id="cus_live",
        )
        with self.assertRaises(BillingStateError) as ctx:
            turn_checkstation_account_on(self.org)
        self.assertEqual(ctx.exception.code, "live_subscription")
        self.org.refresh_from_db()
        self.assertFalse(self.org.is_checkstation_account)
        self.assertTrue(
            WorkspaceSubscription.objects.filter(organization=self.org).exists()
        )

    def test_on_with_no_billing_succeeds_and_hides_commercial_state(self):
        apply_effective_plan(self.org, OrganizationPlan.PLUS, source="test")
        org = turn_checkstation_account_on(self.org)
        self.assertTrue(org.is_checkstation_account)
        self.assertEqual(org.plan, OrganizationPlan.PLUS)
        self.assertIsNone(get_workspace_billing(org))

        workspace = self.api.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        caps = workspace.data["capabilities"]
        self.assertEqual(caps["account_mode"], ACCOUNT_MODE_CHECKSTATION)
        self.assertFalse(caps["can_view_billing"])
        self.assertFalse(caps["can_manage_subscription"])

        billing = self.api.get("/api/billing/")
        self.assertEqual(billing.status_code, 200)
        self.assertTrue(billing.data["managed_by_platform"])
        self.assertFalse(billing.data["commercial_billing_available"])
        self.assertFalse(billing.data["actions"]["can_checkout_plus"])
        self.assertEqual(billing.data["effective_plan"]["key"], "plus")
        self.assertIsNone(billing.data["subscribed_plan"]["key"])

        checkout = self.api.post(
            "/api/billing/checkout/",
            {"plan": "plus", "interval": "monthly"},
            format="json",
        )
        self.assertEqual(checkout.status_code, 400)
        self.assertEqual(checkout.data["code"], "checkstation_managed_account")

        with self.assertRaises(BillingStateError) as ctx:
            lock_workspace_billing(org)
        self.assertEqual(ctx.exception.code, "checkstation_managed_account")

    def test_on_disables_promotions(self):
        settings_obj = PlatformPromotionSettings.load()
        settings_obj.new_basic_mode = MODE_NORMAL
        settings_obj.save(update_fields=["new_basic_mode", "updated_at"])
        turn_checkstation_account_on(self.org)
        self.org.refresh_from_db()
        self.assertEqual(resolve_audience(organization=self.org), AUDIENCE_NONE)
        state = build_billing_state(self.org)
        self.assertEqual(state["catalog"]["promotion"]["audience"], AUDIENCE_NONE)
        self.assertFalse(state["catalog"]["promotion"]["eligible"])
        self.assertEqual(state["catalog"]["promotion"]["offers"], [])
        coupon, slot = resolve_checkout_coupon(
            organization=self.org, plan_key="plus", interval="monthly"
        )
        self.assertIsNone(coupon)
        self.assertIsNone(slot)

    def test_public_catalog_unchanged(self):
        turn_checkstation_account_on(self.org)
        response = APIClient().get("/api/billing/catalog/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["promotion"]["audience"], AUDIENCE_PUBLIC)

    def test_off_resets_to_basic_and_restores_billing(self):
        turn_checkstation_account_on(self.org)
        change_checkstation_plan(self.org, OrganizationPlan.BUSINESS)
        org = turn_checkstation_account_off(self.org)
        self.assertFalse(org.is_checkstation_account)
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        self.assertIsNone(get_workspace_billing(org))

        workspace = self.api.get("/api/workspace/")
        caps = workspace.data["capabilities"]
        self.assertEqual(caps["account_mode"], ACCOUNT_MODE_NORMAL)
        self.assertTrue(caps["can_view_billing"])
        self.assertTrue(caps["can_manage_subscription"])

        billing = self.api.get("/api/billing/")
        self.assertFalse(billing.data["managed_by_platform"])
        self.assertTrue(billing.data["commercial_billing_available"])
        self.assertTrue(billing.data["actions"]["can_checkout_plus"])

    def test_plan_change_only_for_checkstation_via_canonical_flow(self):
        with self.assertRaises(BillingStateError):
            change_checkstation_plan(self.org, OrganizationPlan.BUSINESS)
        turn_checkstation_account_on(self.org)
        change_checkstation_plan(self.org, OrganizationPlan.BUSINESS)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
        self.assertIsNone(get_workspace_billing(self.org))

        change_checkstation_plan(self.org, OrganizationPlan.BASIC)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)

    def test_internal_business_to_basic_applies_plan_locks(self):
        turn_checkstation_account_on(self.org)
        change_checkstation_plan(self.org, OrganizationPlan.BUSINESS)
        extras = [
            Group.objects.create_group(
                organization=self.org,
                name=f"Group {i}",
                group_type=GroupType.STANDARD,
            )
            for i in range(4)
        ]
        change_checkstation_plan(self.org, OrganizationPlan.BASIC)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)
        locked = Group.objects.filter(organization=self.org, plan_unlocked=False).count()
        self.assertGreaterEqual(locked, 2)


@override_settings(**STRIPE_TEST_SETTINGS)
class CheckStationWebhookGuardTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = create_user("cs-webhook@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)

    def test_late_webhook_does_not_restore_billing_or_plan(self):
        turn_checkstation_account_on(self.org)
        change_checkstation_plan(self.org, OrganizationPlan.BUSINESS)
        fake = get_fake_provider()
        checkout = fake.create_checkout_session(
            organization=self.org,
            owner=self.owner,
            plan_key="plus",
            interval="monthly",
            success_url="http://localhost/s",
            cancel_url="http://localhost/c",
        )
        snapshot = fake.complete_checkout(checkout.session_id)
        from django.test import Client
        import json
        from billing.fake_provider import FAKE_SIGNATURE_OK

        payload = json.dumps(
            {
                "id": "evt_cs_late",
                "type": "checkout.session.completed",
                "data": {
                    "object": {
                        "id": checkout.session_id,
                        "object": "checkout.session",
                        "subscription": snapshot.subscription_id,
                        "customer": snapshot.customer_id,
                        "client_reference_id": str(self.org.pk),
                        "metadata": {"organization_id": str(self.org.pk)},
                    }
                },
            }
        ).encode("utf-8")
        response = Client().post(
            "/api/billing/webhooks/stripe",
            data=payload,
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE=FAKE_SIGNATURE_OK,
        )
        self.assertEqual(response.status_code, 200)
        self.org.refresh_from_db()
        self.assertTrue(self.org.is_checkstation_account)
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
        self.assertFalse(
            WorkspaceSubscription.objects.filter(organization=self.org).exists()
        )
