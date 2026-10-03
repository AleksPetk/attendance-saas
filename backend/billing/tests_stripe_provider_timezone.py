"""Cover naive-datetime branches in StripeProvider (Django 5 timezone.utc fix)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone as dj_timezone

from billing.stripe_provider import StripeProvider
from organizations.models import Organization

User = get_user_model()


@override_settings(
    STRIPE_SECRET_KEY="sk_test_batch1_timezone",
    STRIPE_PRICE_PLUS_MONTHLY="price_plus_m",
    STRIPE_PRICE_PLUS_YEARLY="price_plus_y",
    STRIPE_PRICE_BUSINESS_MONTHLY="price_biz_m",
    STRIPE_PRICE_BUSINESS_YEARLY="price_biz_y",
    STRIPE_PRICE_JP_PLUS_MONTHLY="price_jp_plus_m",
    STRIPE_PRICE_JP_PLUS_YEARLY="price_jp_plus_y",
    STRIPE_PRICE_JP_BUSINESS_MONTHLY="price_jp_biz_m",
    STRIPE_PRICE_JP_BUSINESS_YEARLY="price_jp_biz_y",
)
class StripeProviderTimezoneTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="stripe-tz@example.com",
            password="secure-password",
        )
        self.owner.mark_email_verified()
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.provider = StripeProvider()

    def test_create_checkout_session_naive_billing_start_becomes_utc_aware(self):
        naive = datetime.utcnow() + timedelta(days=3)
        self.assertTrue(dj_timezone.is_naive(naive))

        fake_session = MagicMock()
        fake_session.id = "cs_test_naive"
        fake_session.url = "https://checkout.example/session"
        captured = {}

        def _create(**kwargs):
            captured.update(kwargs)
            return fake_session

        with patch.object(self.provider, "_client") as client_factory:
            stripe = MagicMock()
            stripe.checkout.Session.create.side_effect = _create
            client_factory.return_value = stripe
            result = self.provider.create_checkout_session(
                organization=self.organization,
                owner=self.owner,
                plan_key="plus",
                interval="monthly",
                market="global",
                success_url="https://example.com/ok",
                cancel_url="https://example.com/cancel",
                billing_start_at=naive,
            )

        self.assertEqual(result.session_id, "cs_test_naive")
        trial_end = captured["subscription_data"]["trial_end"]
        self.assertIsInstance(trial_end, int)
        aware = datetime.fromtimestamp(trial_end, tz=dt_timezone.utc)
        self.assertFalse(dj_timezone.is_naive(aware))
        self.assertEqual(aware.tzinfo, dt_timezone.utc)

    def test_create_checkout_session_aware_billing_start_unchanged(self):
        aware = dj_timezone.now() + timedelta(days=5)
        self.assertFalse(dj_timezone.is_naive(aware))
        fake_session = MagicMock()
        fake_session.id = "cs_test_aware"
        fake_session.url = "https://checkout.example/session"
        captured = {}

        def _create(**kwargs):
            captured.update(kwargs)
            return fake_session

        with patch.object(self.provider, "_client") as client_factory:
            stripe = MagicMock()
            stripe.checkout.Session.create.side_effect = _create
            client_factory.return_value = stripe
            self.provider.create_checkout_session(
                organization=self.organization,
                owner=self.owner,
                plan_key="plus",
                interval="monthly",
                market="global",
                success_url="https://example.com/ok",
                cancel_url="https://example.com/cancel",
                billing_start_at=aware,
            )

        self.assertEqual(
            captured["subscription_data"]["trial_end"],
            int(aware.timestamp()),
        )

    def test_retarget_deferred_subscription_naive_trial_end(self):
        naive = datetime.utcnow() + timedelta(days=2)
        self.assertTrue(dj_timezone.is_naive(naive))
        captured = {}
        expected_ts = int(
            dj_timezone.make_aware(naive, dt_timezone.utc).timestamp()
        )

        snapshot = MagicMock()
        snapshot.status = "trialing"
        snapshot.trial_end = datetime.fromtimestamp(expected_ts, tz=dt_timezone.utc)

        with patch.object(self.provider, "_client") as client_factory, patch.object(
            self.provider, "_item_id", return_value="si_test"
        ), patch.object(
            self.provider, "retrieve_subscription", return_value=snapshot
        ):
            stripe = MagicMock()

            def _modify(subscription_id, **kwargs):
                captured["subscription_id"] = subscription_id
                captured.update(kwargs)
                return MagicMock()

            stripe.Subscription.modify.side_effect = _modify
            client_factory.return_value = stripe
            self.provider.retarget_deferred_subscription(
                subscription_id="sub_test",
                target_plan="plus",
                target_interval="monthly",
                market="global",
                trial_end=naive,
            )

        self.assertEqual(captured["subscription_id"], "sub_test")
        self.assertEqual(captured["trial_end"], expected_ts)
        end = datetime.fromtimestamp(captured["trial_end"], tz=dt_timezone.utc)
        self.assertFalse(dj_timezone.is_naive(end))
        self.assertEqual(end.tzinfo, dt_timezone.utc)
