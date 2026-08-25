"""Internal billing domain and canonical plan-transition tests."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory, TestCase
from django.utils import timezone

from accounts.models import User
from billing.catalog import (
    PAYMENT_GRACE_DAYS,
    PLAN_BUSINESS,
    PLAN_PLUS,
    PRICE_CENTS,
    YEARLY_MONTHS_CHARGED,
    price_cents,
    price_decimal,
)
from billing.exceptions import BillingStateError
from billing.models import (
    BillingInterval,
    BillingStatus,
    PurchaseSource,
    WorkspaceSubscription,
)
from billing.services import (
    activate_paid_subscription,
    apply_due_billing_transitions,
    apply_successful_upgrade,
    clear_pending_cancellation,
    clear_pending_downgrade,
    finalize_subscription_end,
    get_workspace_billing,
    mark_payment_failure,
    mark_payment_recovered,
    record_payment_warning,
    schedule_cancellation,
    schedule_downgrade,
    start_trial,
)
from groups.models import Group, GroupType
from organizations.admin import OrganizationAdmin
from organizations.entitlements.transitions import (
    InvalidPlanError,
    apply_effective_plan,
)
from organizations.models import Organization, OrganizationPlan


def _create_workspace(email="billing-owner@example.com"):
    owner = User.objects.create_user(email=email, password="password12345")
    return Organization.objects.create_with_owner(owner=owner)


class BillingCatalogTests(TestCase):
    def test_yearly_is_ten_times_monthly(self):
        for plan in (PLAN_PLUS, PLAN_BUSINESS):
            monthly = price_cents(plan, "monthly")
            yearly = price_cents(plan, "yearly")
            self.assertEqual(yearly, monthly * YEARLY_MONTHS_CHARGED)
        self.assertEqual(PRICE_CENTS[PLAN_PLUS]["monthly"], 999)
        self.assertEqual(PRICE_CENTS[PLAN_PLUS]["yearly"], 9990)
        self.assertEqual(PRICE_CENTS[PLAN_BUSINESS]["monthly"], 1499)
        self.assertEqual(PRICE_CENTS[PLAN_BUSINESS]["yearly"], 14990)
        self.assertEqual(price_decimal(PLAN_PLUS, "monthly"), Decimal("9.99"))
        self.assertIsInstance(price_decimal(PLAN_BUSINESS, "yearly"), Decimal)


class CanonicalPlanTransitionTests(TestCase):
    def test_workspace_without_billing_row_is_valid_basic(self):
        org = _create_workspace()
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        self.assertIsNone(get_workspace_billing(org))
        self.assertFalse(
            WorkspaceSubscription.objects.filter(organization=org).exists()
        )

    def test_apply_effective_plan_is_idempotent(self):
        org = _create_workspace()
        first = apply_effective_plan(org, OrganizationPlan.PLUS, source="test")
        second = apply_effective_plan(first, OrganizationPlan.PLUS, source="test")
        self.assertEqual(first.plan, OrganizationPlan.PLUS)
        self.assertEqual(second.plan, OrganizationPlan.PLUS)

    def test_apply_effective_plan_rejects_invalid_plan(self):
        org = _create_workspace()
        with self.assertRaises(InvalidPlanError):
            apply_effective_plan(org, "enterprise")


class WorkspaceBillingPersistenceTests(TestCase):
    def test_purchase_source_and_interval_persist(self):
        org = _create_workspace()
        start = timezone.now()
        end = start + timedelta(days=30)
        billing = activate_paid_subscription(
            org,
            subscribed_plan=PLAN_PLUS,
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=start,
            current_period_end=end,
            external_customer_id="provider-customer-1",
            external_subscription_id="provider-sub-1",
        )
        billing.refresh_from_db()
        self.assertEqual(billing.purchase_source, PurchaseSource.STRIPE)
        self.assertEqual(billing.billing_interval, BillingInterval.MONTHLY)
        self.assertEqual(billing.external_customer_id, "provider-customer-1")
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.PLUS)

    def test_yearly_interval_persists(self):
        org = _create_workspace("yearly@example.com")
        start = timezone.now()
        billing = activate_paid_subscription(
            org,
            subscribed_plan=PLAN_BUSINESS,
            billing_interval="yearly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=start,
            current_period_end=start + timedelta(days=365),
        )
        self.assertEqual(billing.billing_interval, BillingInterval.YEARLY)
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)


class TrialBillingTests(TestCase):
    def test_trial_requires_payment_method_and_sets_business(self):
        org = _create_workspace()
        start = timezone.now()
        end = start + timedelta(days=11)
        with self.assertRaises(BillingStateError):
            start_trial(
                org,
                billing_interval="monthly",
                trial_started_at=start,
                trial_ends_at=end,
                purchase_source=PurchaseSource.STRIPE,
                payment_method_recorded=False,
            )
        billing = start_trial(
            org,
            billing_interval="monthly",
            trial_started_at=start,
            trial_ends_at=end,
            purchase_source=PurchaseSource.STRIPE,
            payment_method_recorded=True,
        )
        org.refresh_from_db()
        self.assertEqual(billing.status, BillingStatus.TRIALING)
        self.assertEqual(billing.trial_started_at, start)
        self.assertEqual(billing.trial_ends_at, end)
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)

    def test_canceled_trial_keeps_business_until_trial_end(self):
        org = _create_workspace()
        start = timezone.now()
        end = start + timedelta(days=11)
        start_trial(
            org,
            billing_interval="monthly",
            trial_started_at=start,
            trial_ends_at=end,
            purchase_source=PurchaseSource.STRIPE,
            payment_method_recorded=True,
        )
        schedule_cancellation(org, effective_at=end)
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        apply_due_billing_transitions(org, now=start + timedelta(days=1))
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        apply_due_billing_transitions(org, now=end)
        org.refresh_from_db()
        billing = get_workspace_billing(org)
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        self.assertEqual(billing.status, BillingStatus.CANCELED)
        apply_due_billing_transitions(org, now=end + timedelta(days=1))
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BASIC)

    def test_uncanceled_trial_converts_to_paid_business(self):
        org = _create_workspace("trial-convert@example.com")
        start = timezone.now()
        end = start + timedelta(days=11)
        start_trial(
            org,
            billing_interval="yearly",
            trial_started_at=start,
            trial_ends_at=end,
            purchase_source=PurchaseSource.STRIPE,
            payment_method_recorded=True,
        )
        apply_due_billing_transitions(org, now=end)
        org.refresh_from_db()
        billing = get_workspace_billing(org)
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        self.assertEqual(billing.status, BillingStatus.ACTIVE)
        self.assertEqual(billing.subscribed_plan, PLAN_BUSINESS)
        self.assertEqual(billing.billing_interval, BillingInterval.YEARLY)


class PaidChangeTests(TestCase):
    def _paid(self, org, plan=PLAN_BUSINESS, interval="monthly"):
        start = timezone.now()
        end = start + timedelta(days=30)
        return activate_paid_subscription(
            org,
            subscribed_plan=plan,
            billing_interval=interval,
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=start,
            current_period_end=end,
        )

    def test_pending_downgrade_does_not_change_plan(self):
        org = _create_workspace()
        billing = self._paid(org, PLAN_BUSINESS)
        schedule_downgrade(org, target_plan=PLAN_PLUS)
        org.refresh_from_db()
        billing.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        self.assertEqual(billing.pending_plan, PLAN_PLUS)
        self.assertFalse(billing.cancel_at_period_end)
        schedule_downgrade(org, target_plan=PLAN_PLUS)
        billing.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)

    def test_scheduled_cancellation_does_not_change_plan(self):
        org = _create_workspace("cancel@example.com")
        billing = self._paid(org, PLAN_PLUS)
        schedule_cancellation(org)
        org.refresh_from_db()
        billing.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.PLUS)
        self.assertTrue(billing.cancel_at_period_end)
        apply_due_billing_transitions(org, now=billing.current_period_start)
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.PLUS)

    def test_effective_cancellation_transitions_to_basic(self):
        org = _create_workspace("cancel-end@example.com")
        billing = self._paid(org, PLAN_PLUS)
        schedule_cancellation(org)
        apply_due_billing_transitions(org, now=billing.current_period_end)
        org.refresh_from_db()
        billing.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        self.assertEqual(billing.status, BillingStatus.CANCELED)
        self.assertEqual(billing.purchase_source, PurchaseSource.NONE)
        finalize_subscription_end(org)
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BASIC)

    def test_effective_downgrade_uses_canonical_transition_and_locks(self):
        org = _create_workspace("downgrade@example.com")
        billing = self._paid(org, PLAN_BUSINESS)
        groups = [
            Group.objects.create_group(
                organization=org,
                name=f"Group {index}",
                group_type=GroupType.STANDARD,
            )
            for index in range(11)
        ]
        self.assertTrue(all(group.plan_unlocked for group in groups))
        schedule_downgrade(org, target_plan=PLAN_PLUS)
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        self.assertTrue(
            Group.objects.filter(
                organization=org, plan_unlocked=True
            ).count()
            == 11
        )
        apply_due_billing_transitions(org, now=billing.current_period_end)
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.PLUS)
        org.refresh_from_db()
        self.assertFalse(org.active_standard_groups_slots_resolved)
        self.assertFalse(
            Group.objects.filter(organization=org, plan_unlocked=True).exists()
        )

    def test_immediate_upgrade_changes_effective_plan(self):
        org = _create_workspace("upgrade@example.com")
        billing = self._paid(org, PLAN_PLUS)
        period_end = billing.current_period_end
        apply_successful_upgrade(org, target_plan=PLAN_BUSINESS)
        apply_successful_upgrade(org, target_plan=PLAN_BUSINESS)
        org.refresh_from_db()
        billing.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        self.assertEqual(billing.subscribed_plan, PLAN_BUSINESS)
        self.assertEqual(billing.current_period_end, period_end)

    def test_clear_pending_cancellation_keeps_paid_plan(self):
        org = _create_workspace("uncancel@example.com")
        self._paid(org, PLAN_PLUS)
        schedule_cancellation(org)
        clear_pending_cancellation(org)
        org.refresh_from_db()
        billing = get_workspace_billing(org)
        self.assertEqual(org.plan, OrganizationPlan.PLUS)
        self.assertFalse(billing.cancel_at_period_end)

    def test_clear_pending_downgrade_keeps_business(self):
        org = _create_workspace("clear-downgrade@example.com")
        self._paid(org, PLAN_BUSINESS)
        schedule_downgrade(org, target_plan=PLAN_PLUS)
        billing = get_workspace_billing(org)
        self.assertEqual(billing.pending_plan, PLAN_PLUS)
        clear_pending_downgrade(org)
        clear_pending_downgrade(org)
        org.refresh_from_db()
        billing = get_workspace_billing(org)
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        self.assertEqual(billing.pending_plan, "")
        self.assertIsNone(billing.pending_change_effective_at)


class PaymentFailureTests(TestCase):
    def test_grace_does_not_downgrade_and_recovery_clears_state(self):
        org = _create_workspace()
        start = timezone.now()
        end = start + timedelta(days=30)
        activate_paid_subscription(
            org,
            subscribed_plan=PLAN_PLUS,
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=start,
            current_period_end=end,
        )
        failed_at = start + timedelta(days=1)
        billing = mark_payment_failure(org, failed_at=failed_at)
        mark_payment_failure(org, failed_at=failed_at + timedelta(hours=3))
        org.refresh_from_db()
        billing.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.PLUS)
        self.assertEqual(billing.status, BillingStatus.PAST_DUE)
        self.assertEqual(billing.payment_failure_started_at, failed_at)
        self.assertEqual(
            billing.payment_grace_deadline,
            failed_at + timedelta(days=PAYMENT_GRACE_DAYS),
        )
        record_payment_warning(org, warned_at=failed_at + timedelta(days=1))
        mark_payment_recovered(org, recovered_at=failed_at + timedelta(days=2))
        billing.refresh_from_db()
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.PLUS)
        self.assertEqual(billing.status, BillingStatus.ACTIVE)
        self.assertIsNone(billing.payment_failure_started_at)
        self.assertIsNone(billing.payment_grace_deadline)
        self.assertEqual(billing.payment_warning_count, 0)
        self.assertIsNotNone(billing.payment_recovered_at)

    def test_unresolved_grace_finalizes_to_basic(self):
        org = _create_workspace("grace-end@example.com")
        start = timezone.now()
        activate_paid_subscription(
            org,
            subscribed_plan=PLAN_BUSINESS,
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=start,
            current_period_end=start + timedelta(days=30),
        )
        billing = mark_payment_failure(org, failed_at=start)
        apply_due_billing_transitions(
            org, now=billing.payment_grace_deadline
        )
        org.refresh_from_db()
        billing.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.BASIC)
        self.assertEqual(billing.status, BillingStatus.CANCELED)


class PlatformAdminPlanChangeTests(TestCase):
    def test_admin_save_uses_canonical_plan_transition(self):
        org = _create_workspace("admin-plan@example.com")
        request = RequestFactory().post("/admin/")
        request.user = User.objects.create_superuser(
            email="platform@example.com",
            password="secure-password",
        )

        class FakeForm:
            changed_data = ["plan"]
            initial = {"plan": OrganizationPlan.BASIC}
            cleaned_data = {}

        org.plan = OrganizationPlan.PLUS
        OrganizationAdmin(Organization, AdminSite()).save_model(
            request, org, FakeForm(), change=True
        )
        org.refresh_from_db()
        self.assertEqual(org.plan, OrganizationPlan.PLUS)
        self.assertIsNone(get_workspace_billing(org))
