"""Automatic built-in 7-day Business trial — provider-neutral."""

from datetime import timedelta

from django.core.management import call_command
from django.db.models.signals import post_save
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from billing.builtin_trial import (
    BUILTIN_TRIAL_DAYS,
    billing_start_at_for_checkout,
    builtin_trial_is_active,
    expire_due_builtin_trial,
    expire_due_builtin_trials,
    grant_builtin_trial_for_new_workspace,
)
from billing.catalog import PLAN_BUSINESS, PLAN_PLUS
from billing.fake_provider import get_fake_provider
from billing.models import BillingStatus, PurchaseSource, WorkspaceBuiltinTrial
from billing.operations import start_paid_checkout
from billing.promotion import MODE_BIG, GROUP_NEW_BASIC, set_group_value
from billing.services import (
    activate_paid_subscription,
    apply_due_billing_transitions,
    finalize_subscription_end,
    record_deferred_paid_start,
    schedule_cancellation,
)
from billing.signals import grant_builtin_trial_on_organization_create
from billing.testing import simulate_migrated_existing_workspace
from core.models import PlatformPromotionSettings
from organizations.entitlements.transitions import apply_effective_plan
from organizations.lifecycle import turn_checkstation_account_on
from organizations.models import Organization, OrganizationPlan

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


def _owner(email):
    user = User.objects.create_user(email=email, password="password12345")
    user.mark_email_verified()
    return user


def _new_workspace(email):
    org = Organization.objects.create_with_owner(owner=_owner(email))
    org.refresh_from_db()
    return org


class BuiltinTrialGrantTests(TestCase):
    def test_new_workspace_receives_business_for_seven_days(self):
        before = timezone.now()
        org = _new_workspace("trial-new@example.com")
        org.refresh_from_db()
        trial = org.builtin_trial
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        self.assertTrue(trial.consumed)
        self.assertIsNotNone(trial.started_at)
        self.assertIsNotNone(trial.ends_at)
        self.assertIsNone(trial.expired_at)
        self.assertGreaterEqual(trial.started_at, before - timedelta(seconds=5))
        self.assertAlmostEqual(
            (trial.ends_at - trial.started_at).total_seconds(),
            timedelta(days=BUILTIN_TRIAL_DAYS).total_seconds(),
            delta=2,
        )
        self.assertTrue(builtin_trial_is_active(org))
        from billing.models import WorkspaceSubscription

        self.assertFalse(
            WorkspaceSubscription.objects.filter(organization=org).exists()
        )

    def test_grant_is_one_time_and_does_not_rewind(self):
        org = _new_workspace("trial-once@example.com")
        trial = org.builtin_trial
        started = trial.started_at
        ends = trial.ends_at
        apply_effective_plan(org, OrganizationPlan.BASIC, source="test")
        again = grant_builtin_trial_for_new_workspace(org)
        org.refresh_from_db()
        trial.refresh_from_db()
        self.assertEqual(again.pk, trial.pk)
        self.assertEqual(trial.started_at, started)
        self.assertEqual(trial.ends_at, ends)
        self.assertTrue(trial.consumed)
        self.assertEqual(org.plan, OrganizationPlan.BASIC)

    def test_existing_workspace_backfill_is_ineligible(self):
        org = _new_workspace("trial-existing@example.com")
        simulate_migrated_existing_workspace(org)
        org.refresh_from_db()
        trial = org.builtin_trial
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        self.assertTrue(trial.consumed)
        self.assertIsNone(trial.started_at)
        self.assertIsNone(trial.ends_at)
        self.assertFalse(builtin_trial_is_active(org))
        grant_builtin_trial_for_new_workspace(org)
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        self.assertIsNone(org.builtin_trial.started_at)

    def test_migration_backfill_without_signal_never_grants(self):
        post_save.disconnect(
            grant_builtin_trial_on_organization_create, sender=Organization
        )
        try:
            org = Organization.objects.create_with_owner(
                owner=_owner("trial-backfill@example.com")
            )
            self.assertFalse(
                WorkspaceBuiltinTrial.objects.filter(organization=org).exists()
            )
            self.assertEqual(org.plan, OrganizationPlan.BASIC)
            WorkspaceBuiltinTrial.objects.create(
                organization=org,
                consumed=True,
                started_at=None,
                ends_at=None,
            )
        finally:
            post_save.connect(
                grant_builtin_trial_on_organization_create, sender=Organization
            )
        grant_builtin_trial_for_new_workspace(org)
        org.refresh_from_db()
        trial = org.builtin_trial
        self.assertTrue(trial.consumed)
        self.assertIsNone(trial.started_at)
        self.assertEqual(org.plan, OrganizationPlan.BASIC)

    def test_checkstation_workspace_is_ineligible(self):
        owner = _owner("trial-cs@example.com")
        org = Organization.objects.create(
            owner=owner,
            is_checkstation_account=True,
            internal_label="CS",
        )
        org.refresh_from_db()
        trial = org.builtin_trial
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        self.assertTrue(trial.consumed)
        self.assertIsNone(trial.started_at)
        self.assertFalse(builtin_trial_is_active(org))

    def test_turning_checkstation_on_does_not_restore_eligibility(self):
        org = _new_workspace("trial-cs-on@example.com")
        self.assertTrue(builtin_trial_is_active(org))
        turn_checkstation_account_on(org)
        org.refresh_from_db()
        trial = org.builtin_trial
        self.assertTrue(org.is_checkstation_account)
        self.assertTrue(trial.consumed)
        self.assertIsNotNone(trial.started_at)
        self.assertIsNotNone(trial.expired_at)
        self.assertFalse(builtin_trial_is_active(org))


class BuiltinTrialExpiryTests(TestCase):
    def test_expiry_to_basic_when_no_paid_subscription(self):
        org = _new_workspace("trial-expire-basic@example.com")
        trial = org.builtin_trial
        later = trial.ends_at
        expire_due_builtin_trial(org, now=later)
        org.refresh_from_db()
        trial.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        self.assertIsNotNone(trial.expired_at)
        self.assertFalse(builtin_trial_is_active(org, now=later))

    def test_lazy_expiry_on_workspace_read(self):
        org = _new_workspace("trial-lazy@example.com")
        owner = org.owner
        trial = org.builtin_trial
        now = timezone.now()
        WorkspaceBuiltinTrial.objects.filter(pk=trial.pk).update(
            started_at=now - timedelta(days=8),
            ends_at=now - timedelta(minutes=1),
        )
        api = APIClient()
        api.force_authenticate(user=owner)
        response = api.get("/api/workspace/")
        self.assertEqual(response.status_code, 200)
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        self.assertFalse(response.data["builtin_trial"]["active"])
        self.assertEqual(response.data["entitlements"]["plan"]["key"], "basic")

    def test_management_command_expires_due_trials(self):
        org = _new_workspace("trial-cmd@example.com")
        trial = org.builtin_trial
        now = timezone.now()
        WorkspaceBuiltinTrial.objects.filter(pk=trial.pk).update(
            started_at=now - timedelta(days=8),
            ends_at=now - timedelta(minutes=1),
        )
        call_command("expire_builtin_trials")
        org.refresh_from_db()
        trial.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        self.assertIsNotNone(trial.expired_at)

    def test_batch_expire_keeps_business_while_paid_start_is_deferred(self):
        org = _new_workspace("trial-cmd-deferred@example.com")
        trial = org.builtin_trial
        record_deferred_paid_start(
            org,
            subscribed_plan=PLAN_PLUS,
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            trial_started_at=trial.started_at,
            trial_ends_at=trial.ends_at,
        )
        result = expire_due_builtin_trials(now=trial.ends_at)
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        self.assertIsNone(org.builtin_trial.expired_at)
        self.assertEqual(result["skipped"], 1)


class BuiltinTrialDeferredPaidTests(TestCase):
    def test_plus_deferred_until_trial_end_then_plus(self):
        org = _new_workspace("trial-plus@example.com")
        trial = org.builtin_trial
        record_deferred_paid_start(
            org,
            subscribed_plan=PLAN_PLUS,
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            trial_started_at=trial.started_at,
            trial_ends_at=trial.ends_at,
        )
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        apply_due_billing_transitions(org, now=trial.ends_at - timedelta(seconds=1))
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        apply_due_billing_transitions(org, now=trial.ends_at)
        org.refresh_from_db()
        from billing.services import get_workspace_billing

        billing = get_workspace_billing(org)
        self.assertEqual(billing.status, BillingStatus.ACTIVE)
        self.assertEqual(billing.subscribed_plan, PLAN_PLUS)
        expire_due_builtin_trial(org, now=trial.ends_at)
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.PLUS)

    def test_business_deferred_until_trial_end_stays_business(self):
        org = _new_workspace("trial-biz-paid@example.com")
        trial = org.builtin_trial
        record_deferred_paid_start(
            org,
            subscribed_plan=PLAN_BUSINESS,
            billing_interval="yearly",
            purchase_source=PurchaseSource.STRIPE,
            trial_started_at=trial.started_at,
            trial_ends_at=trial.ends_at,
        )
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        apply_due_billing_transitions(org, now=trial.ends_at)
        expire_due_builtin_trial(org, now=trial.ends_at)
        org.refresh_from_db()
        from billing.services import get_workspace_billing

        billing = get_workspace_billing(org)
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        self.assertEqual(billing.status, BillingStatus.ACTIVE)
        self.assertEqual(billing.subscribed_plan, PLAN_BUSINESS)

    def test_purchase_does_not_shorten_free_week(self):
        org = _new_workspace("trial-no-shorten@example.com")
        trial = org.builtin_trial
        original_end = trial.ends_at
        record_deferred_paid_start(
            org,
            subscribed_plan=PLAN_PLUS,
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            trial_started_at=trial.started_at,
            trial_ends_at=original_end,
        )
        trial.refresh_from_db()
        self.assertEqual(trial.ends_at, original_end)
        self.assertEqual(
            billing_start_at_for_checkout(org),
            original_end,
        )
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)

    def test_deferred_start_does_not_require_a_card_flag(self):
        org = _new_workspace("trial-no-card@example.com")
        trial = org.builtin_trial
        billing = record_deferred_paid_start(
            org,
            subscribed_plan=PLAN_BUSINESS,
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            trial_started_at=trial.started_at,
            trial_ends_at=trial.ends_at,
        )
        self.assertEqual(billing.status, BillingStatus.TRIALING)
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)


class BuiltinTrialIndependenceTests(TestCase):
    def test_promotions_do_not_control_grant(self):
        PlatformPromotionSettings.load()
        set_group_value(GROUP_NEW_BASIC, MODE_BIG)
        org = _new_workspace("trial-promo@example.com")
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        self.assertTrue(org.builtin_trial.consumed)
        self.assertTrue(builtin_trial_is_active(org))

    def test_cancellation_does_not_restore_eligibility(self):
        org = _new_workspace("trial-cancel@example.com")
        trial = org.builtin_trial
        record_deferred_paid_start(
            org,
            subscribed_plan=PLAN_BUSINESS,
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            trial_started_at=trial.started_at,
            trial_ends_at=trial.ends_at,
        )
        schedule_cancellation(org, effective_at=trial.ends_at)
        apply_due_billing_transitions(org, now=trial.ends_at)
        expire_due_builtin_trial(org, now=trial.ends_at)
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        self.assertTrue(org.builtin_trial.consumed)
        grant_builtin_trial_for_new_workspace(org)
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        self.assertFalse(builtin_trial_is_active(org, now=trial.ends_at + timedelta(days=1)))

    def test_provider_change_does_not_restore_eligibility(self):
        org = _new_workspace("trial-provider@example.com")
        trial = org.builtin_trial
        expire_due_builtin_trial(org, now=trial.ends_at)
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        activate_paid_subscription(
            org,
            subscribed_plan=PLAN_PLUS,
            billing_interval="monthly",
            purchase_source=PurchaseSource.APPLE,
            current_period_start=trial.ends_at,
            current_period_end=trial.ends_at + timedelta(days=30),
        )
        finalize_subscription_end(org, ended_at=trial.ends_at + timedelta(days=30))
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        grant_builtin_trial_for_new_workspace(org)
        org.refresh_from_db()
        trial.refresh_from_db()
        self.assertIsNotNone(trial.started_at)
        self.assertTrue(trial.consumed)
        self.assertFalse(builtin_trial_is_active(org))


@override_settings(**STRIPE_TEST_SETTINGS)
class BuiltinTrialCheckoutApiTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.owner = _owner("trial-api@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.api = APIClient()
        self.api.force_authenticate(user=self.owner)

    def test_old_trial_checkout_endpoint_is_gone(self):
        response = self.api.post(
            "/api/billing/trial-checkout/",
            {"interval": "monthly"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_billing_state_shows_active_builtin_trial_and_allows_checkout(self):
        response = self.api.get("/api/billing/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["effective_plan"]["key"], "business")
        self.assertTrue(response.data["builtin_trial"]["active"])
        self.assertEqual(response.data["builtin_trial"]["days"], 7)
        self.assertTrue(response.data["actions"]["can_checkout_plus"])
        self.assertTrue(response.data["actions"]["can_checkout_business"])
        self.assertNotIn("can_start_trial", response.data["actions"])
        self.assertNotIn("trial_available", response.data)

    def test_paid_checkout_during_builtin_trial_defers_to_trial_end(self):
        response = self.api.post(
            "/api/billing/checkout/",
            {"plan": "plus", "interval": "monthly"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        session = get_fake_provider().checkouts[response.data["session_id"]]
        self.assertEqual(session["plan_key"], "plus")
        self.assertEqual(session["billing_start_at"], self.org.builtin_trial.ends_at)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)

    def test_start_paid_checkout_uses_billing_start_at_not_old_trial_days(self):
        result = start_paid_checkout(
            self.org, self.owner, plan_key="business", interval="yearly"
        )
        session = get_fake_provider().checkouts[result.session_id]
        self.assertIsNone(session.get("trial_days"))
        self.assertEqual(session["billing_start_at"], self.org.builtin_trial.ends_at)

    def test_checkstation_cannot_checkout(self):
        turn_checkstation_account_on(self.org)
        response = self.api.post(
            "/api/billing/checkout/",
            {"plan": "plus", "interval": "monthly"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get("code"), "checkstation_managed_account")
