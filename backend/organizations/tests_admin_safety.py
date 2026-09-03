from datetime import timedelta

from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from accounts.testing import force_platform_admin_login
from billing.fake_provider import get_fake_provider
from billing.models import PurchaseSource, WorkspaceSubscription
from billing.services import activate_paid_subscription, get_workspace_billing
from billing.testing import simulate_migrated_existing_workspace
from core.models import PlatformAdminAction, PlatformAdminActionType
from organizations.lifecycle import turn_checkstation_account_on
from organizations.models import (
    BillingMarketOverride,
    Organization,
    OrganizationPlan,
    OrganizationStatus,
)

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

REASON = "Platform support confirmed this change."
PASSWORD = "secure-password"


def create_user(email, *, password=PASSWORD):
    user = User.objects.create_user(email=email, password=password)
    user.mark_email_verified()
    return user


class OrganizationAdminSafetyTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="platform-admin@example.com",
            password=PASSWORD,
        )
        self.client = Client()
        force_platform_admin_login(self.client, self.admin)
        self.owner = create_user("safety-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        simulate_migrated_existing_workspace(self.org)

    def _confirm(self, url, extra=None):
        payload = {
            "admin_password": PASSWORD,
            "reason": REASON,
            "confirm": "1",
        }
        if extra:
            payload.update(extra)
        return self.client.post(url, payload)

    def test_change_form_shows_lifecycle_sections(self):
        url = reverse("admin:organizations_organization_change", args=[self.org.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Account type")
        self.assertContains(response, "Normal customer")
        self.assertContains(response, "Danger zone")
        self.assertContains(response, "Change account type")
        self.assertContains(response, "Block workspace")
        self.assertContains(response, "Billing market")
        self.assertContains(response, "Auto")
        self.assertContains(response, "Global (USD)")

    def test_raw_plan_status_owner_not_casually_editable(self):
        other = create_user("other-owner@example.com")
        url = reverse("admin:organizations_organization_change", args=[self.org.pk])
        response = self.client.post(
            url,
            {
                "internal_label": "support-label",
                "plan": OrganizationPlan.BUSINESS,
                "status": OrganizationStatus.BLOCKED,
                "owner": other.pk,
                "is_checkstation_account": "on",
                "billing_market_override": BillingMarketOverride.JP,
                "staff_accounts-TOTAL_FORMS": "0",
                "staff_accounts-INITIAL_FORMS": "0",
                "staff_accounts-MIN_NUM_FORMS": "0",
                "staff_accounts-MAX_NUM_FORMS": "1000",
                "_save": "Save",
            },
        )
        self.assertIn(response.status_code, (200, 302))
        self.org.refresh_from_db()
        self.assertEqual(self.org.internal_label, "support-label")
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)
        self.assertEqual(self.org.status, OrganizationStatus.ACTIVE)
        self.assertEqual(self.org.owner_id, self.owner.pk)
        self.assertFalse(self.org.is_checkstation_account)
        self.assertEqual(
            self.org.billing_market_override,
            BillingMarketOverride.AUTO,
        )

    def test_platform_admin_changes_override_with_audit(self):
        url = reverse(
            "admin:organizations_organization_billing_market",
            args=[self.org.pk],
        )
        page = self.client.get(url)
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, "Billing Market Override")
        self.assertContains(page, "Japan")

        missing_confirmation = self.client.post(
            url,
            {"target_billing_market": BillingMarketOverride.JP},
        )
        self.assertEqual(missing_confirmation.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.billing_market_override, BillingMarketOverride.AUTO)

        changed = self._confirm(
            url,
            {"target_billing_market": BillingMarketOverride.JP},
        )
        self.assertEqual(changed.status_code, 302)
        self.org.refresh_from_db()
        self.assertEqual(self.org.billing_market_override, BillingMarketOverride.JP)
        action = PlatformAdminAction.objects.get(
            action_type=PlatformAdminActionType.BILLING_MARKET_OVERRIDE_CHANGE,
            workspace_id_snapshot=self.org.workspace_id,
        )
        self.assertEqual(action.actor, self.admin)
        self.assertEqual(action.old_value, BillingMarketOverride.AUTO)
        self.assertEqual(action.new_value, "jp (effective: jp)")
        self.assertEqual(action.reason, REASON)

    def test_customer_cannot_change_override_through_workspace_api_or_admin(self):
        api = APIClient()
        api.force_authenticate(user=self.owner)
        response = api.patch(
            reverse("current-workspace"),
            {"billing_market_override": BillingMarketOverride.JP},
            format="json",
        )
        self.assertEqual(response.status_code, 405)
        self.org.refresh_from_db()
        self.assertEqual(self.org.billing_market_override, BillingMarketOverride.AUTO)

        customer_admin = Client()
        customer_admin.force_login(self.owner)
        admin_response = customer_admin.get(
            reverse(
                "admin:organizations_organization_billing_market",
                args=[self.org.pk],
            )
        )
        self.assertEqual(admin_response.status_code, 302)
        self.assertIn("/admin/login/", admin_response.url)

    def test_active_subscription_override_warns_without_mutating_subscription(self):
        start = timezone.now()
        billing = activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=start,
            current_period_end=start + timedelta(days=30),
            external_customer_id="cus_market_safe",
            external_subscription_id="sub_market_safe",
            currency="usd",
        )
        url = reverse(
            "admin:organizations_organization_billing_market",
            args=[self.org.pk],
        )
        changed = self._confirm(
            url,
            {"target_billing_market": BillingMarketOverride.JP},
        )
        self.assertEqual(changed.status_code, 302)
        billing.refresh_from_db()
        self.assertEqual(billing.currency, "usd")
        self.assertEqual(billing.external_subscription_id, "sub_market_safe")

        detail = self.client.get(
            reverse("admin:organizations_organization_change", args=[self.org.pk])
        )
        self.assertContains(detail, "Forced billing market")
        self.assertContains(detail, "Active subscription remains Global (USD)")
        self.assertContains(detail, "Japan (JPY)")

    def test_turn_on_requires_password_and_reason(self):
        url = reverse(
            "admin:organizations_organization_account_type", args=[self.org.pk]
        )
        get_page = self.client.get(url)
        self.assertEqual(get_page.status_code, 200)
        self.assertContains(get_page, "CheckStation Account")

        missing = self.client.post(url, {"confirm": "1"})
        self.assertEqual(missing.status_code, 200)
        self.org.refresh_from_db()
        self.assertFalse(self.org.is_checkstation_account)

        ok = self._confirm(url)
        self.assertEqual(ok.status_code, 302)
        self.org.refresh_from_db()
        self.assertTrue(self.org.is_checkstation_account)
        self.assertTrue(
            PlatformAdminAction.objects.filter(
                action_type=PlatformAdminActionType.CHECKSTATION_ACCOUNT_ON,
                workspace_id_snapshot=self.org.workspace_id,
                reason=REASON,
            ).exists()
        )

    def test_turn_on_refuses_live_subscription_from_admin(self):
        start = timezone.now()
        activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=start,
            current_period_end=start + timedelta(days=30),
            external_subscription_id="sub_admin",
        )
        url = reverse(
            "admin:organizations_organization_account_type", args=[self.org.pk]
        )
        response = self._confirm(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "live")
        self.org.refresh_from_db()
        self.assertFalse(self.org.is_checkstation_account)

    def test_plan_change_requires_password_reason_and_checkstation(self):
        url = reverse("admin:organizations_organization_plan", args=[self.org.pk])
        denied = self.client.get(url)
        self.assertEqual(denied.status_code, 302)

        turn_checkstation_account_on(self.org)
        get_page = self.client.get(url)
        self.assertEqual(get_page.status_code, 200)
        missing = self.client.post(url, {"target_plan": "business", "confirm": "1"})
        self.assertEqual(missing.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)

        ok = self._confirm(url, {"target_plan": "business"})
        self.assertEqual(ok.status_code, 302)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
        self.assertIsNone(get_workspace_billing(self.org))

    def test_block_and_unblock_require_password_and_reason(self):
        block_url = reverse(
            "admin:organizations_organization_block", args=[self.org.pk]
        )
        get_page = self.client.get(block_url)
        self.assertEqual(get_page.status_code, 200)
        self.assertContains(get_page, "Block this workspace")
        missing = self.client.post(block_url, {"confirm": "1"})
        self.assertEqual(missing.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.status, OrganizationStatus.ACTIVE)

        blocked = self._confirm(block_url)
        self.assertEqual(blocked.status_code, 302)
        self.org.refresh_from_db()
        self.assertEqual(self.org.status, OrganizationStatus.BLOCKED)

        unblock_url = reverse(
            "admin:organizations_organization_unblock", args=[self.org.pk]
        )
        reactivated = self._confirm(unblock_url)
        self.assertEqual(reactivated.status_code, 302)
        self.org.refresh_from_db()
        self.assertEqual(self.org.status, OrganizationStatus.ACTIVE)


@override_settings(**STRIPE_TEST_SETTINGS)
class WorkspaceSubscriptionAdminReadOnlyTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.admin = User.objects.create_superuser(
            email="sub-admin@example.com",
            password=PASSWORD,
        )
        self.client = Client()
        force_platform_admin_login(self.client, self.admin)
        owner = create_user("sub-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=owner)
        start = timezone.now()
        activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=start,
            current_period_end=start + timedelta(days=30),
            external_customer_id="cus_ro",
            external_subscription_id="sub_ro",
        )
        self.billing = WorkspaceSubscription.objects.get(organization=self.org)

    def test_commercial_fields_are_read_only(self):
        url = reverse(
            "admin:billing_workspacesubscription_change", args=[self.billing.pk]
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, 'name="status"')
        self.assertNotContains(response, 'name="external_subscription_id"')
        post = self.client.post(
            url,
            {
                "status": "canceled",
                "subscribed_plan": "business",
                "billing_interval": "yearly",
                "external_subscription_id": "sub_hacked",
                "cancel_at_period_end": "on",
            },
        )
        self.assertIn(post.status_code, (200, 302))
        self.billing.refresh_from_db()
        self.assertEqual(self.billing.status, "active")
        self.assertEqual(self.billing.subscribed_plan, "plus")
        self.assertEqual(self.billing.external_subscription_id, "sub_ro")
        self.assertFalse(self.billing.cancel_at_period_end)


class UserAdminPrivilegeTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="priv-admin@example.com",
            password=PASSWORD,
        )
        self.client = Client()
        force_platform_admin_login(self.client, self.admin)
        self.owner = create_user("priv-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)

    def test_customer_owner_cannot_receive_platform_flags_from_form(self):
        url = reverse("admin:accounts_user_change", args=[self.owner.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "owns a workspace")
        post = self.client.post(
            url,
            {
                "email": self.owner.email,
                "is_active": "on",
                "is_staff": "on",
                "is_superuser": "on",
            },
        )
        self.assertIn(post.status_code, (200, 302))
        self.owner.refresh_from_db()
        self.assertFalse(self.owner.is_staff)
        self.assertFalse(self.owner.is_superuser)


@override_settings(**STRIPE_TEST_SETTINGS)
class OrganizationPermanentDeleteGuardTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.admin = User.objects.create_superuser(
            email="del-admin@example.com",
            password=PASSWORD,
        )
        self.client = Client()
        force_platform_admin_login(self.client, self.admin)
        self.owner = create_user("del-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)

    def test_live_subscription_blocks_permanent_delete(self):
        start = timezone.now()
        activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=start,
            current_period_end=start + timedelta(days=30),
            external_subscription_id="sub_del",
        )
        url = reverse(
            "admin:organizations_organization_permanent_delete", args=[self.org.pk]
        )
        response = self.client.post(
            url,
            {
                "confirmation": "DELETE",
                "admin_password": PASSWORD,
                "reason": REASON,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "live")
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())
        self.assertTrue(Organization.objects.filter(pk=self.org.pk).exists())
        self.assertTrue(
            WorkspaceSubscription.objects.filter(organization=self.org).exists()
        )
