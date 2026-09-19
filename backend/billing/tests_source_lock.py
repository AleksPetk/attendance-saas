"""Phase 1 three-provider purchase_source lock foundation."""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from billing.exceptions import BillingStateError
from billing.models import (
    AppleSubscriptionDetails,
    BillingProvider,
    BillingStatus,
    GoogleSubscriptionDetails,
    ProviderEvent,
    ProviderEventStatus,
    PurchaseSource,
    WorkspaceSubscription,
)
from billing.services import finalize_subscription_end, schedule_cancellation
from billing.source_lock import (
    assert_can_activate_provider,
    assert_can_start_provider,
    can_start_provider,
    purchase_source_display_name,
)
from billing.state import build_billing_state
from billing.testing import (
    mark_builtin_trial_expired_for_tests,
    simulate_migrated_existing_workspace,
)
from organizations.models import Organization, OrganizationPlan
from organizations.entitlements.transitions import apply_effective_plan


def _owner_org(email):
    owner = User.objects.create_user(email=email, password="secure-password")
    owner.mark_email_verified()
    org = Organization.objects.create_with_owner(owner=owner)
    simulate_migrated_existing_workspace(org)
    return owner, org


class PurchaseSourceGoogleModelTests(TestCase):
    def test_google_is_valid_purchase_source(self):
        _owner, org = _owner_org("src-google@example.com")
        billing = WorkspaceSubscription.objects.create(
            organization=org,
            purchase_source=PurchaseSource.GOOGLE,
            status=BillingStatus.ACTIVE,
            subscribed_plan="plus",
            billing_interval="monthly",
        )
        billing.refresh_from_db()
        self.assertEqual(billing.purchase_source, PurchaseSource.GOOGLE)
        self.assertEqual(PurchaseSource.GOOGLE, "google")

    def test_provider_event_accepts_apple_and_google(self):
        for provider in (
            BillingProvider.STRIPE,
            BillingProvider.APPLE,
            BillingProvider.GOOGLE,
        ):
            event = ProviderEvent.objects.create(
                provider=provider,
                external_event_id=f"evt-{provider}-1",
                event_type="test.event",
                status=ProviderEventStatus.PROCESSED,
            )
            self.assertEqual(event.provider, provider)

    def test_provider_event_unique_per_provider(self):
        ProviderEvent.objects.create(
            provider=BillingProvider.STRIPE,
            external_event_id="shared-id",
            event_type="stripe.a",
        )
        ProviderEvent.objects.create(
            provider=BillingProvider.APPLE,
            external_event_id="shared-id",
            event_type="apple.a",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ProviderEvent.objects.create(
                    provider=BillingProvider.STRIPE,
                    external_event_id="shared-id",
                    event_type="stripe.b",
                )


class SourceLockHelperTests(TestCase):
    def setUp(self):
        self.owner, self.org = _owner_org("lock@example.com")

    def _billing(self, source=PurchaseSource.NONE, **extra):
        defaults = {
            "organization": self.org,
            "purchase_source": source,
            "status": BillingStatus.NONE,
        }
        defaults.update(extra)
        return WorkspaceSubscription.objects.create(**defaults)

    def test_none_allows_all_providers(self):
        billing = self._billing(PurchaseSource.NONE)
        for provider in (
            PurchaseSource.STRIPE,
            PurchaseSource.APPLE,
            PurchaseSource.GOOGLE,
        ):
            self.assertTrue(
                can_start_provider(billing=billing, provider=provider)
            )
            self.assertEqual(
                assert_can_start_provider(billing=billing, provider=provider),
                provider,
            )

    def test_stripe_blocks_apple_and_google(self):
        billing = self._billing(
            PurchaseSource.STRIPE,
            status=BillingStatus.ACTIVE,
            subscribed_plan="plus",
            billing_interval="monthly",
        )
        self.assertTrue(
            can_start_provider(billing=billing, provider=PurchaseSource.STRIPE)
        )
        with self.assertRaises(BillingStateError) as apple_ctx:
            assert_can_activate_provider(
                billing=billing, provider=PurchaseSource.APPLE
            )
        self.assertEqual(apple_ctx.exception.code, "purchase_source_locked")
        with self.assertRaises(BillingStateError) as google_ctx:
            assert_can_activate_provider(
                billing=billing, provider=PurchaseSource.GOOGLE
            )
        self.assertEqual(google_ctx.exception.code, "purchase_source_locked")

    def test_apple_blocks_stripe_and_google(self):
        billing = self._billing(
            PurchaseSource.APPLE,
            status=BillingStatus.ACTIVE,
            subscribed_plan="plus",
            billing_interval="monthly",
        )
        with self.assertRaises(BillingStateError) as stripe_ctx:
            assert_can_start_provider(
                billing=billing, provider=PurchaseSource.STRIPE
            )
        self.assertEqual(stripe_ctx.exception.code, "purchase_source_apple")
        with self.assertRaises(BillingStateError) as google_ctx:
            assert_can_activate_provider(
                billing=billing, provider=PurchaseSource.GOOGLE
            )
        self.assertEqual(google_ctx.exception.code, "purchase_source_locked")

    def test_google_blocks_stripe_and_apple(self):
        billing = self._billing(
            PurchaseSource.GOOGLE,
            status=BillingStatus.ACTIVE,
            subscribed_plan="business",
            billing_interval="yearly",
        )
        with self.assertRaises(BillingStateError) as stripe_ctx:
            assert_can_start_provider(
                billing=billing, provider=PurchaseSource.STRIPE
            )
        self.assertEqual(stripe_ctx.exception.code, "purchase_source_google")
        with self.assertRaises(BillingStateError) as apple_ctx:
            assert_can_activate_provider(
                billing=billing, provider=PurchaseSource.APPLE
            )
        self.assertEqual(apple_ctx.exception.code, "purchase_source_locked")

    def test_same_source_activation_allowed(self):
        billing = self._billing(
            PurchaseSource.STRIPE,
            status=BillingStatus.ACTIVE,
            subscribed_plan="plus",
            billing_interval="monthly",
        )
        self.assertEqual(
            assert_can_activate_provider(
                billing=billing, provider=PurchaseSource.STRIPE
            ),
            PurchaseSource.STRIPE,
        )

    def test_cancel_at_period_end_keeps_source_locked(self):
        billing = self._billing(
            PurchaseSource.STRIPE,
            status=BillingStatus.ACTIVE,
            subscribed_plan="plus",
            billing_interval="monthly",
            current_period_end=timezone.now() + timedelta(days=10),
        )
        schedule_cancellation(self.org, effective_at=billing.current_period_end)
        billing.refresh_from_db()
        self.assertTrue(billing.cancel_at_period_end)
        self.assertEqual(billing.purchase_source, PurchaseSource.STRIPE)
        with self.assertRaises(BillingStateError) as ctx:
            assert_can_start_provider(
                billing=billing, provider=PurchaseSource.APPLE
            )
        self.assertEqual(ctx.exception.code, "purchase_source_locked")
        with self.assertRaises(BillingStateError) as stripe_ctx:
            assert_can_start_provider(
                billing=billing, provider=PurchaseSource.GOOGLE
            )
        self.assertEqual(stripe_ctx.exception.code, "purchase_source_locked")
        self.assertFalse(
            can_start_provider(billing=billing, provider=PurchaseSource.APPLE)
        )
        self.assertTrue(
            can_start_provider(billing=billing, provider=PurchaseSource.STRIPE)
        )

    def test_finalize_unlocks_to_none(self):
        mark_builtin_trial_expired_for_tests(self.org)
        apply_effective_plan(
            self.org, OrganizationPlan.PLUS, source="test.source_lock"
        )
        billing = self._billing(
            PurchaseSource.STRIPE,
            status=BillingStatus.ACTIVE,
            subscribed_plan="plus",
            billing_interval="monthly",
            cancel_at_period_end=True,
            current_period_end=timezone.now() - timedelta(minutes=1),
        )
        finalize_subscription_end(self.org)
        billing.refresh_from_db()
        self.org.refresh_from_db()
        self.assertEqual(billing.purchase_source, PurchaseSource.NONE)
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)
        self.assertTrue(
            can_start_provider(billing=billing, provider=PurchaseSource.APPLE)
        )

    def test_display_names(self):
        self.assertEqual(
            purchase_source_display_name(PurchaseSource.STRIPE), "CheckStation"
        )
        self.assertEqual(
            purchase_source_display_name(PurchaseSource.APPLE), "Apple"
        )
        self.assertEqual(
            purchase_source_display_name(PurchaseSource.GOOGLE), "Google Play"
        )
        self.assertEqual(
            purchase_source_display_name(PurchaseSource.NONE),
            "No billing provider",
        )

    def test_billing_state_exposes_source_flags(self):
        mark_builtin_trial_expired_for_tests(self.org)
        apply_effective_plan(
            self.org, OrganizationPlan.PLUS, source="test.source_lock"
        )
        self._billing(
            PurchaseSource.GOOGLE,
            status=BillingStatus.ACTIVE,
            subscribed_plan="plus",
            billing_interval="monthly",
        )
        state = build_billing_state(self.org)
        self.assertEqual(state["purchase_source"], "google")
        self.assertEqual(state["purchase_source_display"], "Google Play")
        self.assertTrue(state["source_locked"])
        self.assertFalse(state["can_start_stripe"])
        self.assertFalse(state["can_start_apple"])
        self.assertTrue(state["can_start_google"])
        self.assertFalse(state["can_manage_stripe"])
        self.assertFalse(state["actions"]["can_checkout_plus"])
        self.assertFalse(state["actions"]["can_open_portal"])


class ProviderDetailsConstraintTests(TestCase):
    def setUp(self):
        self.owner, self.org = _owner_org("details@example.com")
        self.billing = WorkspaceSubscription.objects.create(
            organization=self.org,
            purchase_source=PurchaseSource.NONE,
        )

    def test_apple_original_transaction_unique_when_set(self):
        AppleSubscriptionDetails.objects.create(
            billing=self.billing,
            original_transaction_id="txn-1",
        )
        _, org2 = _owner_org("details2@example.com")
        billing2 = WorkspaceSubscription.objects.create(organization=org2)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AppleSubscriptionDetails.objects.create(
                    billing=billing2,
                    original_transaction_id="txn-1",
                )

    def test_google_purchase_token_unique_when_set(self):
        GoogleSubscriptionDetails.objects.create(
            billing=self.billing,
            purchase_token="token-1",
        )
        _, org2 = _owner_org("details3@example.com")
        billing2 = WorkspaceSubscription.objects.create(organization=org2)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                GoogleSubscriptionDetails.objects.create(
                    billing=billing2,
                    purchase_token="token-1",
                )

    def test_blank_provider_ids_allowed_on_multiple_rows(self):
        AppleSubscriptionDetails.objects.create(billing=self.billing)
        _, org2 = _owner_org("details4@example.com")
        billing2 = WorkspaceSubscription.objects.create(organization=org2)
        AppleSubscriptionDetails.objects.create(billing=billing2)
        self.assertEqual(AppleSubscriptionDetails.objects.count(), 2)
