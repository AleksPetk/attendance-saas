"""Google Play Billing verify + RTDN tests."""

from __future__ import annotations

import base64
import json
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from billing.google_products import (
    BASE_PLAN_MONTHLY,
    BASE_PLAN_YEARLY,
    PRODUCT_BUSINESS,
    PRODUCT_PLUS,
)
from billing.google_verify import (
    apply_google_entitlement,
    parse_subscription_purchase_v2,
    verify_and_activate_google_subscription,
)
from billing.models import (
    BillingProvider,
    BillingStatus,
    GoogleSubscriptionDetails,
    ProviderEvent,
    ProviderEventStatus,
    PurchaseSource,
)
from billing.services import activate_paid_subscription, get_workspace_billing
from billing.source_lock import billing_source_flags
from billing.testing import simulate_migrated_existing_workspace
from organizations.models import Organization, OrganizationPlan


def _owner_org(email):
    owner = User.objects.create_user(email=email, password="secure-password")
    owner.mark_email_verified()
    org = Organization.objects.create_with_owner(owner=owner)
    simulate_migrated_existing_workspace(org)
    return owner, org


def _google_payload(
    *,
    product_id: str = PRODUCT_PLUS,
    base_plan_id: str = BASE_PLAN_MONTHLY,
    state: str = "SUBSCRIPTION_STATE_ACTIVE",
    expires_in_days: int = 30,
    auto_renew: bool = True,
    ack: str = "ACKNOWLEDGEMENT_STATE_PENDING",
    linked: str = "",
    region: str = "US",
    start_offset_days: int = -1,
):
    now = timezone.now()
    start = now + timedelta(days=start_offset_days)
    expires = now + timedelta(days=expires_in_days)
    item = {
        "productId": product_id,
        "expiryTime": expires.isoformat().replace("+00:00", "Z"),
        "offerDetails": {"basePlanId": base_plan_id},
        "autoRenewingPlan": {"autoRenewEnabled": auto_renew},
    }
    payload = {
        "subscriptionState": state,
        "acknowledgementState": ack,
        "startTime": start.isoformat().replace("+00:00", "Z"),
        "regionCode": region,
        "latestOrderId": "GPA.1234-5678",
        "lineItems": [item],
    }
    if linked:
        payload["linkedPurchaseToken"] = linked
    return payload


@override_settings(
    DEBUG=True,
    GOOGLE_PLAY_PACKAGE_NAME="app.checkstation.mobile",
    GOOGLE_PLAY_RTDN_SKIP_AUTH=True,
    GOOGLE_PLAY_RTDN_AUDIENCE="https://workspace.checkstation.app/api/billing/google/notifications/",
)
class GoogleBillingTests(TestCase):
    def setUp(self):
        self.owner, self.org = _owner_org("google-owner@example.com")
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.other, self.other_org = _owner_org("other-google@example.com")
        self._ack_calls = []

    def _activate(self, token: str, payload: dict | None = None, **kwargs):
        body = payload or _google_payload(**kwargs)

        def fake_get(_token):
            return body

        def fake_ack(*, product_id, purchase_token):
            self._ack_calls.append((product_id, purchase_token))

        with (
            patch("billing.google_verify.get_subscription_purchase_v2", side_effect=fake_get),
            patch(
                "billing.google_verify.acknowledge_subscription_purchase",
                side_effect=fake_ack,
            ),
        ):
            return verify_and_activate_google_subscription(
                self.org,
                purchase_token=token,
            )

    def test_valid_plus_monthly(self):
        billing = self._activate("tok-plus-m")
        self.assertEqual(billing.purchase_source, PurchaseSource.GOOGLE)
        self.assertEqual(billing.subscribed_plan, "plus")
        self.assertEqual(billing.billing_interval, "monthly")
        self.assertEqual(billing.status, BillingStatus.ACTIVE)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        details = GoogleSubscriptionDetails.objects.get(billing=billing)
        self.assertEqual(details.product_id, PRODUCT_PLUS)
        self.assertEqual(details.base_plan_id, BASE_PLAN_MONTHLY)
        self.assertEqual(details.purchase_token, "tok-plus-m")
        self.assertEqual(len(self._ack_calls), 1)

    def test_valid_plus_yearly(self):
        billing = self._activate(
            "tok-plus-y",
            product_id=PRODUCT_PLUS,
            base_plan_id=BASE_PLAN_YEARLY,
        )
        self.assertEqual(billing.subscribed_plan, "plus")
        self.assertEqual(billing.billing_interval, "yearly")

    def test_valid_business_monthly(self):
        billing = self._activate(
            "tok-biz-m",
            product_id=PRODUCT_BUSINESS,
            base_plan_id=BASE_PLAN_MONTHLY,
        )
        self.assertEqual(billing.subscribed_plan, "business")
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)

    def test_valid_business_yearly(self):
        billing = self._activate(
            "tok-biz-y",
            product_id=PRODUCT_BUSINESS,
            base_plan_id=BASE_PLAN_YEARLY,
        )
        self.assertEqual(billing.billing_interval, "yearly")
        self.assertEqual(billing.subscribed_plan, "business")

    def test_unknown_product_rejected(self):
        with self.assertRaises(Exception) as ctx:
            self._activate(
                "tok-bad-prod",
                product_id="checkstation.unknown",
                base_plan_id=BASE_PLAN_MONTHLY,
            )
        self.assertEqual(ctx.exception.code, "google_unknown_product")

    def test_unknown_base_plan_rejected(self):
        with self.assertRaises(Exception) as ctx:
            self._activate(
                "tok-bad-base",
                product_id=PRODUCT_PLUS,
                base_plan_id="weekly",
            )
        self.assertEqual(ctx.exception.code, "google_unknown_base_plan")

    def test_malformed_token_rejected(self):
        url = reverse("billing-google-verify")
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "google_purchase_token_missing")

    def test_idempotent_same_workspace(self):
        self._activate("tok-same")
        billing = self._activate("tok-same")
        self.assertEqual(billing.purchase_source, PurchaseSource.GOOGLE)
        self.assertEqual(
            GoogleSubscriptionDetails.objects.filter(purchase_token="tok-same").count(),
            1,
        )

    def test_token_bound_elsewhere_rejected(self):
        self._activate("tok-shared")
        payload = _google_payload()
        with (
            patch(
                "billing.google_verify.get_subscription_purchase_v2",
                return_value=payload,
            ),
            patch("billing.google_verify.acknowledge_subscription_purchase"),
        ):
            with self.assertRaises(Exception) as ctx:
                verify_and_activate_google_subscription(
                    self.other_org,
                    purchase_token="tok-shared",
                )
        self.assertEqual(ctx.exception.code, "google_purchase_bound_elsewhere")

    def test_stripe_provider_lock(self):
        activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timedelta(days=30),
            external_subscription_id="sub_stripe",
        )
        with self.assertRaises(Exception) as ctx:
            self._activate("tok-vs-stripe")
        self.assertEqual(ctx.exception.code, "purchase_source_locked")

    def test_apple_provider_lock(self):
        activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.APPLE,
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timedelta(days=30),
            external_subscription_id="otxn",
        )
        with self.assertRaises(Exception) as ctx:
            self._activate("tok-vs-apple")
        self.assertEqual(ctx.exception.code, "purchase_source_locked")

    def test_google_owned_reconcile_accepted(self):
        self._activate("tok-owned")
        billing = self._activate("tok-owned")
        self.assertEqual(billing.purchase_source, PurchaseSource.GOOGLE)

    def test_cancel_until_expiry_keeps_paid(self):
        billing = self._activate(
            "tok-cancel",
            state="SUBSCRIPTION_STATE_CANCELED",
            auto_renew=False,
            expires_in_days=20,
        )
        self.assertEqual(billing.status, BillingStatus.ACTIVE)
        self.assertTrue(billing.cancel_at_period_end)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)

    def test_expired_falls_to_basic(self):
        self._activate("tok-exp")
        payload = _google_payload(
            state="SUBSCRIPTION_STATE_EXPIRED",
            expires_in_days=-1,
            auto_renew=False,
        )
        with (
            patch(
                "billing.google_verify.get_subscription_purchase_v2",
                return_value=payload,
            ),
            patch("billing.google_verify.acknowledge_subscription_purchase"),
        ):
            billing = verify_and_activate_google_subscription(
                self.org,
                purchase_token="tok-exp",
            )
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)
        self.assertEqual(billing.purchase_source, PurchaseSource.NONE)

    def test_grace_preserves_commercial_access(self):
        billing = self._activate(
            "tok-grace",
            state="SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
            expires_in_days=2,
        )
        self.assertEqual(billing.status, BillingStatus.PAST_DUE)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)

    def test_account_hold_removes_paid_access(self):
        self._activate("tok-hold")
        payload = _google_payload(
            state="SUBSCRIPTION_STATE_ON_HOLD",
            expires_in_days=40,
            auto_renew=True,
        )
        with (
            patch(
                "billing.google_verify.get_subscription_purchase_v2",
                return_value=payload,
            ),
            patch("billing.google_verify.acknowledge_subscription_purchase"),
        ):
            verify_and_activate_google_subscription(
                self.org,
                purchase_token="tok-hold",
            )
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)

    def test_refund_revoke_removes_paid_access(self):
        self._activate("tok-rev")
        payload = _google_payload(
            state="SUBSCRIPTION_STATE_EXPIRED",
            expires_in_days=-1,
            auto_renew=False,
        )
        with (
            patch(
                "billing.google_verify.get_subscription_purchase_v2",
                return_value=payload,
            ),
            patch("billing.google_verify.acknowledge_subscription_purchase"),
        ):
            from billing.google_verify import reconcile_google_from_purchase_token

            reconcile_google_from_purchase_token("tok-rev")
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)

    def test_recovery_restores_paid_state(self):
        self._activate(
            "tok-rec",
            state="SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
            expires_in_days=2,
        )
        payload = _google_payload(
            state="SUBSCRIPTION_STATE_ACTIVE",
            expires_in_days=30,
            auto_renew=True,
        )
        with (
            patch(
                "billing.google_verify.get_subscription_purchase_v2",
                return_value=payload,
            ),
            patch("billing.google_verify.acknowledge_subscription_purchase"),
        ):
            billing = verify_and_activate_google_subscription(
                self.org,
                purchase_token="tok-rec",
            )
        self.assertEqual(billing.status, BillingStatus.ACTIVE)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)

    def test_ack_only_after_verify(self):
        self._ack_calls.clear()
        self._activate("tok-ack", ack="ACKNOWLEDGEMENT_STATE_PENDING")
        self.assertEqual(len(self._ack_calls), 1)
        self.assertEqual(self._ack_calls[0][1], "tok-ack")

    def test_already_acknowledged_safe(self):
        self._activate("tok-acked", ack="ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED")
        # No ack call when already acknowledged
        self.assertEqual(len(self._ack_calls), 0)

    def test_can_manage_google_exposed(self):
        self._activate("tok-flags")
        flags = billing_source_flags(organization=self.org)
        self.assertTrue(flags["can_manage_google"])
        self.assertFalse(flags["can_manage_apple"])
        self.assertFalse(flags["can_manage_stripe"])
        state = self.client.get(reverse("billing-current")).data
        self.assertTrue(state["can_manage_google"])

    def test_rtdn_test_notification_no_entitlement_change(self):
        url = reverse("billing-google-notifications")
        payload = {"version": "1.0", "packageName": "app.checkstation.mobile", "testNotification": {"version": "1.0"}}
        data = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
        envelope = {
            "message": {
                "data": data,
                "messageId": "msg-test-1",
                "publishTime": "2026-01-01T00:00:00Z",
            }
        }
        response = self.client.post(
            url,
            data=json.dumps(envelope),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["event"], "testNotification")
        billing = get_workspace_billing(self.org)
        self.assertTrue(billing is None or billing.purchase_source == PurchaseSource.NONE)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)

    def test_rtdn_subscription_idempotent(self):
        self._activate("tok-rtdn")
        url = reverse("billing-google-notifications")
        note = {
            "version": "1.0",
            "packageName": "app.checkstation.mobile",
            "subscriptionNotification": {
                "version": "1.0",
                "notificationType": 2,
                "purchaseToken": "tok-rtdn",
                "subscriptionId": PRODUCT_PLUS,
            },
        }
        data = base64.b64encode(json.dumps(note).encode("utf-8")).decode("ascii")
        envelope = {"message": {"data": data, "messageId": "msg-sub-1"}}
        payload = _google_payload(expires_in_days=40)
        with (
            patch(
                "billing.google_verify.get_subscription_purchase_v2",
                return_value=payload,
            ),
            patch("billing.google_verify.acknowledge_subscription_purchase"),
        ):
            r1 = self.client.post(url, data=json.dumps(envelope), content_type="application/json")
            r2 = self.client.post(url, data=json.dumps(envelope), content_type="application/json")
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.json()["status"], "duplicate")
        self.assertEqual(
            ProviderEvent.objects.filter(
                provider=BillingProvider.GOOGLE,
                external_event_id="msg-sub-1",
            ).count(),
            1,
        )

    def test_rtdn_voided_purchase(self):
        self._activate("tok-void")
        url = reverse("billing-google-notifications")
        note = {
            "version": "1.0",
            "packageName": "app.checkstation.mobile",
            "voidedPurchaseNotification": {
                "purchaseToken": "tok-void",
                "orderId": "GPA.1",
                "productType": 1,
                "refundType": 1,
            },
        }
        data = base64.b64encode(json.dumps(note).encode("utf-8")).decode("ascii")
        envelope = {"message": {"data": data, "messageId": "msg-void-1"}}
        expired = _google_payload(
            state="SUBSCRIPTION_STATE_EXPIRED",
            expires_in_days=-1,
            auto_renew=False,
        )
        with (
            patch(
                "billing.google_verify.get_subscription_purchase_v2",
                return_value=expired,
            ),
            patch("billing.google_verify.acknowledge_subscription_purchase"),
        ):
            response = self.client.post(
                url, data=json.dumps(envelope), content_type="application/json"
            )
        self.assertEqual(response.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)

    def test_rtdn_rejects_untrusted_without_skip(self):
        url = reverse("billing-google-notifications")
        with override_settings(GOOGLE_PLAY_RTDN_SKIP_AUTH=False, GOOGLE_PLAY_RTDN_AUDIENCE="https://example/audience"):
            response = self.client.post(
                url,
                data=json.dumps({"message": {"data": "e30=", "messageId": "x"}}),
                content_type="application/json",
            )
        self.assertEqual(response.status_code, 401)

    def test_parse_rejects_offer_id_for_mapping(self):
        # offerId present must not affect plan mapping — basePlanId remains authority.
        payload = _google_payload(product_id=PRODUCT_BUSINESS, base_plan_id=BASE_PLAN_YEARLY)
        payload["lineItems"][0]["offerDetails"]["offerId"] = "promo-ignore"
        normalized = parse_subscription_purchase_v2(payload)
        self.assertEqual(normalized["plan"], "business")
        self.assertEqual(normalized["interval"], "yearly")

    def test_verify_endpoint_success(self):
        url = reverse("billing-google-verify")
        payload = _google_payload()
        with (
            patch(
                "billing.google_verify.get_subscription_purchase_v2",
                return_value=payload,
            ),
            patch("billing.google_verify.acknowledge_subscription_purchase"),
        ):
            response = self.client.post(
                url, {"purchase_token": "tok-api"}, format="json"
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["purchase_source"], "google")
        self.assertTrue(response.data["can_manage_google"])
