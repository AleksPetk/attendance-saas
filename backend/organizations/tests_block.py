from datetime import timedelta

from django.contrib.sessions.models import Session
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from attendance.models import ActionRecord
from billing.fake_provider import get_fake_provider
from billing.models import BillingStatus, PurchaseSource, WorkspaceSubscription
from billing.prices import price_id_for
from billing.services import (
    activate_paid_subscription,
    finalize_subscription_end,
    get_workspace_billing,
)
from billing.testing import simulate_migrated_existing_workspace
from billing.snapshots import SubscriptionSnapshot
from groups.models import Group, GroupMembership
from kiosk_builder.testing import configure_group_kiosk_for_launch
from members.models import Member
from organizations.entitlements.transitions import apply_effective_plan
from organizations.lifecycle import (
    block_organization,
    turn_checkstation_account_on,
    unblock_organization,
)
from organizations.models import (
    Organization,
    OrganizationPlan,
    OrganizationStatus,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
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


def create_user(email, *, password="secure-password"):
    user = User.objects.create_user(email=email, password=password)
    user.mark_email_verified()
    return user


def seed_stripe_subscription(org, *, plan="plus", interval="monthly", sub_id="sub_block"):
    start = timezone.now()
    end = start + timedelta(days=30)
    fake = get_fake_provider()
    fake.subscriptions[sub_id] = SubscriptionSnapshot(
        subscription_id=sub_id,
        customer_id="cus_block",
        status="active",
        price_id=price_id_for(plan, interval),
        cancel_at_period_end=False,
        current_period_start=start,
        current_period_end=end,
        trial_start=None,
        trial_end=None,
        metadata={"organization_id": str(org.pk), "workspace_id": org.workspace_id},
    )
    activate_paid_subscription(
        org,
        subscribed_plan=plan,
        billing_interval=interval,
        purchase_source=PurchaseSource.STRIPE,
        current_period_start=start,
        current_period_end=end,
        external_customer_id="cus_block",
        external_subscription_id=sub_id,
    )
    return get_workspace_billing(org)


class ArchiveVersusBlockedTests(TestCase):
    def test_blocked_is_not_archived(self):
        owner = create_user("states@example.com")
        org = Organization.objects.create_with_owner(owner=owner)
        org.block()
        self.assertEqual(org.status, OrganizationStatus.BLOCKED)
        self.assertIsNotNone(org.blocked_at)
        self.assertIsNone(org.archived_at)

        org.unblock()
        self.assertEqual(org.status, OrganizationStatus.ACTIVE)
        self.assertIsNone(org.blocked_at)

        org.archive()
        self.assertEqual(org.status, OrganizationStatus.ARCHIVED)
        self.assertIsNotNone(org.archived_at)
        self.assertIsNone(org.blocked_at)

    def test_archived_cannot_be_blocked(self):
        owner = create_user("archived-block@example.com")
        org = Organization.objects.create_with_owner(owner=owner)
        org.archive()
        from billing.exceptions import BillingStateError

        with self.assertRaises(BillingStateError):
            block_organization(org)
        org.refresh_from_db()
        self.assertEqual(org.status, OrganizationStatus.ARCHIVED)


@override_settings(**STRIPE_TEST_SETTINGS)
class BlockAccessTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.password = "secure-password"
        self.owner = create_user("block-owner@example.com", password=self.password)
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        apply_effective_plan(self.org, OrganizationPlan.PLUS, source="test")
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.org,
            username="blockstaff",
            password="staff-password",
            role=WorkspaceStaffRole.ADMIN,
            email="blockstaff@example.com",
        )
        self.member = Member.objects.create_member(
            organization=self.org, name="Pat Member"
        )
        self.group = Group.objects.create_group(organization=self.org, name="Club")
        GroupMembership.objects.create(
            organization=self.org, group=self.group, member=self.member
        )
        configure_group_kiosk_for_launch(self.group)
        self.owner_api = APIClient()
        login = self.owner_api.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.staff_api = APIClient()
        staff_login = self.staff_api.post(
            "/api/auth/staff-login/",
            {
                "workspace_id": self.org.workspace_id,
                "username": "blockstaff",
                "password": "staff-password",
            },
            format="json",
        )
        self.assertEqual(staff_login.status_code, 200)

    def test_block_stops_owner_staff_kiosk_and_preserves_data(self):
        start = self.owner_api.post(f"/api/groups/{self.group.pk}/kiosk/")
        self.assertEqual(start.status_code, 200)

        block_organization(self.org)
        self.org.refresh_from_db()
        self.assertEqual(self.org.status, OrganizationStatus.BLOCKED)
        self.assertTrue(Member.objects.filter(pk=self.member.pk).exists())
        self.assertTrue(Group.objects.filter(pk=self.group.pk).exists())

        workspace = self.owner_api.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 404)

        relogin = APIClient().post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": self.password},
            format="json",
        )
        self.assertEqual(relogin.status_code, 404)

        staff_workspace = self.staff_api.get("/api/workspace/")
        self.assertIn(staff_workspace.status_code, (401, 403, 404))

        staff_relogin = APIClient().post(
            "/api/auth/staff-login/",
            {
                "workspace_id": self.org.workspace_id,
                "username": "blockstaff",
                "password": "staff-password",
            },
            format="json",
        )
        self.assertEqual(staff_relogin.status_code, 401)

        kiosk = self.owner_api.post(f"/api/groups/{self.group.pk}/kiosk/")
        self.assertIn(kiosk.status_code, (401, 403, 404))
        perform = self.owner_api.post(
            f"/api/groups/{self.group.pk}/kiosk/perform/",
            {"member_id": self.member.pk, "action_type": "check_in"},
            format="json",
        )
        self.assertIn(perform.status_code, (401, 403, 404))
        self.assertEqual(ActionRecord.objects.filter(organization=self.org).count(), 0)

        staff_ids = {str(self.staff.pk)}
        remaining = 0
        for session in Session.objects.all():
            data = session.get_decoded()
            if str(data.get("_auth_user_id") or "") in staff_ids:
                remaining += 1
        self.assertEqual(remaining, 0)

    def test_checkstation_block_does_not_call_provider(self):
        turn_checkstation_account_on(self.org)
        fake = get_fake_provider()
        block_organization(self.org)
        self.org.refresh_from_db()
        self.assertEqual(self.org.status, OrganizationStatus.BLOCKED)
        self.assertEqual(fake.cancel_calls, [])


@override_settings(**STRIPE_TEST_SETTINGS)
class BlockBillingTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = create_user("paid-block@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        simulate_migrated_existing_workspace(self.org)

    def test_block_schedules_cancel_at_period_end_without_refund(self):
        billing = seed_stripe_subscription(self.org)
        fake = get_fake_provider()
        block_organization(self.org)
        billing.refresh_from_db()
        self.org.refresh_from_db()
        self.assertEqual(self.org.status, OrganizationStatus.BLOCKED)
        self.assertTrue(billing.cancel_at_period_end)
        self.assertEqual(billing.status, BillingStatus.ACTIVE)
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        self.assertEqual(fake.cancel_calls, [billing.external_subscription_id])
        self.assertEqual(fake.resume_calls, [])

    def test_unblock_before_period_end_resumes_subscription(self):
        billing = seed_stripe_subscription(self.org)
        block_organization(self.org)
        fake = get_fake_provider()
        unblock_organization(self.org)
        billing.refresh_from_db()
        self.org.refresh_from_db()
        self.assertEqual(self.org.status, OrganizationStatus.ACTIVE)
        self.assertFalse(billing.cancel_at_period_end)
        self.assertEqual(billing.status, BillingStatus.ACTIVE)
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        self.assertEqual(fake.resume_calls, [billing.external_subscription_id])

    def test_unblock_after_subscription_ended_returns_to_basic(self):
        seed_stripe_subscription(self.org)
        block_organization(self.org)
        finalize_subscription_end(self.org)
        unblock_organization(self.org)
        self.org.refresh_from_db()
        billing = get_workspace_billing(self.org)
        self.assertEqual(self.org.status, OrganizationStatus.ACTIVE)
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)
        if billing is not None:
            self.assertNotIn(
                billing.status,
                {BillingStatus.ACTIVE, BillingStatus.TRIALING, BillingStatus.PAST_DUE},
            )

        api = APIClient()
        owner = self.org.owner
        owner.set_password("secure-password")
        owner.save()
        login = api.post(
            "/api/auth/login/",
            {"email": owner.email, "password": "secure-password"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        checkout = api.post(
            "/api/billing/checkout/",
            {"plan": "plus", "interval": "monthly"},
            format="json",
        )
        self.assertEqual(checkout.status_code, 200)

    def test_checkstation_unblock_preserves_plan(self):
        turn_checkstation_account_on(self.org)
        from organizations.lifecycle import change_checkstation_plan

        change_checkstation_plan(self.org, OrganizationPlan.BUSINESS)
        block_organization(self.org)
        unblock_organization(self.org)
        self.org.refresh_from_db()
        self.assertEqual(self.org.status, OrganizationStatus.ACTIVE)
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)
        self.assertTrue(self.org.is_checkstation_account)


@override_settings(**STRIPE_TEST_SETTINGS)
class BlockedWebhookTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = create_user("blocked-hook@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)

    def test_webhook_does_not_unblock_organization(self):
        billing = seed_stripe_subscription(self.org, sub_id="sub_blocked_hook")
        block_organization(self.org)
        fake = get_fake_provider()
        snapshot = fake.retrieve_subscription(billing.external_subscription_id)
        obj = {
            "id": snapshot.subscription_id,
            "object": "subscription",
            "customer": snapshot.customer_id,
            "status": "active",
            "cancel_at_period_end": False,
            "metadata": {"organization_id": str(self.org.pk)},
        }
        import json
        from django.test import Client
        from billing.fake_provider import FAKE_SIGNATURE_OK

        payload = json.dumps(
            {
                "id": "evt_blocked_update",
                "type": "customer.subscription.updated",
                "data": {"object": obj},
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
        self.assertEqual(self.org.status, OrganizationStatus.BLOCKED)
        billing.refresh_from_db()
        self.assertTrue(billing.cancel_at_period_end)
