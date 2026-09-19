"""Apple IAP verify + ASN V2 tests (Phase 1 Apple billing)."""

from __future__ import annotations

import base64
import json
import uuid
from datetime import timedelta

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from billing.apple_products import (
    PRODUCT_BUSINESS_MONTHLY,
    PRODUCT_BUSINESS_YEARLY,
    PRODUCT_PLUS_MONTHLY,
    PRODUCT_PLUS_YEARLY,
)
from billing.apple_verify import (
    apply_apple_entitlement,
    parse_verified_transaction_claims,
    verify_and_activate_apple_subscription,
)
from billing.exceptions import BillingStateError
from billing.models import (
    AppleSubscriptionDetails,
    BillingProvider,
    BillingStatus,
    ProviderEvent,
    ProviderEventStatus,
    PurchaseSource,
    WorkspaceSubscription,
)
from billing.services import activate_paid_subscription, get_workspace_billing
from billing.testing import simulate_migrated_existing_workspace
from organizations.models import Organization, OrganizationPlan


def _owner_org(email):
    owner = User.objects.create_user(email=email, password="secure-password")
    owner.mark_email_verified()
    org = Organization.objects.create_with_owner(owner=owner)
    simulate_migrated_existing_workspace(org)
    return owner, org


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _fake_jws(payload: dict) -> str:
    header = _b64url(json.dumps({"alg": "ES256", "typ": "JWT"}).encode("utf-8"))
    body = _b64url(json.dumps(payload).encode("utf-8"))
    return f"{header}.{body}.fakesig"


def _txn(
    *,
    product_id: str,
    original_transaction_id: str = "1000000001",
    transaction_id: str = "2000000001",
    bundle_id: str = "app.checkstation.client",
    environment: str = "Sandbox",
    app_account_token: str = "",
    expires_in_days: int = 30,
    revoked: bool = False,
):
    now = timezone.now()
    expires = now + timedelta(days=expires_in_days)
    payload = {
        "transactionId": transaction_id,
        "originalTransactionId": original_transaction_id,
        "bundleId": bundle_id,
        "productId": product_id,
        "purchaseDate": int(now.timestamp() * 1000),
        "originalPurchaseDate": int(now.timestamp() * 1000),
        "expiresDate": int(expires.timestamp() * 1000),
        "environment": environment,
        "type": "Auto-Renewable Subscription",
        "currency": "USD",
    }
    if app_account_token:
        payload["appAccountToken"] = app_account_token
    if revoked:
        payload["revocationDate"] = int(now.timestamp() * 1000)
    return payload


@override_settings(APPLE_IAP_SKIP_JWS_CHAIN_VERIFY=True)
class AppleBillingTests(TestCase):
    def setUp(self):
        self.owner, self.org = _owner_org("apple-owner@example.com")
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.other, self.other_org = _owner_org("other-apple@example.com")

    def _activate(self, product_id: str, **kwargs):
        claims = _txn(product_id=product_id, **kwargs)
        return verify_and_activate_apple_subscription(
            self.org,
            signed_transaction=_fake_jws(claims),
        )

    def test_valid_plus_monthly(self):
        billing = self._activate(PRODUCT_PLUS_MONTHLY)
        self.assertEqual(billing.purchase_source, PurchaseSource.APPLE)
        self.assertEqual(billing.subscribed_plan, "plus")
        self.assertEqual(billing.billing_interval, "monthly")
        self.assertEqual(billing.status, BillingStatus.ACTIVE)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.PLUS)
        details = AppleSubscriptionDetails.objects.get(billing=billing)
        self.assertEqual(details.product_id, PRODUCT_PLUS_MONTHLY)
        self.assertEqual(details.environment, "sandbox")

    def test_valid_plus_yearly(self):
        billing = self._activate(PRODUCT_PLUS_YEARLY, original_transaction_id="oty")
        self.assertEqual(billing.subscribed_plan, "plus")
        self.assertEqual(billing.billing_interval, "yearly")

    def test_valid_business_monthly(self):
        billing = self._activate(PRODUCT_BUSINESS_MONTHLY, original_transaction_id="obm")
        self.assertEqual(billing.subscribed_plan, "business")
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)

    def test_valid_business_yearly(self):
        billing = self._activate(PRODUCT_BUSINESS_YEARLY, original_transaction_id="oby")
        self.assertEqual(billing.subscribed_plan, "business")
        self.assertEqual(billing.billing_interval, "yearly")

    def test_unknown_product_reject(self):
        with self.assertRaises(BillingStateError) as ctx:
            self._activate("app.checkstation.unknown.monthly")
        self.assertEqual(ctx.exception.code, "apple_unknown_product")

    def test_wrong_bundle_reject(self):
        with self.assertRaises(BillingStateError) as ctx:
            self._activate(PRODUCT_PLUS_MONTHLY, bundle_id="com.evil.app")
        self.assertEqual(ctx.exception.code, "apple_bundle_mismatch")

    def test_bad_jws_reject(self):
        with self.assertRaises(BillingStateError) as ctx:
            verify_and_activate_apple_subscription(
                self.org, signed_transaction="not-a-jws"
            )
        self.assertEqual(ctx.exception.code, "apple_jws_invalid")

    def test_source_none_activates_apple(self):
        billing = get_workspace_billing(self.org)
        self.assertTrue(billing is None or billing.purchase_source == PurchaseSource.NONE)
        billing = self._activate(PRODUCT_PLUS_MONTHLY)
        self.assertEqual(billing.purchase_source, PurchaseSource.APPLE)

    def test_source_apple_idempotent_sync(self):
        first = self._activate(PRODUCT_PLUS_MONTHLY)
        second = self._activate(
            PRODUCT_PLUS_MONTHLY,
            transaction_id="2000000099",
        )
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(
            AppleSubscriptionDetails.objects.filter(
                original_transaction_id="1000000001"
            ).count(),
            1,
        )

    def test_stripe_source_blocks_apple(self):
        now = timezone.now()
        activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
        )
        with self.assertRaises(BillingStateError) as ctx:
            self._activate(PRODUCT_PLUS_MONTHLY, original_transaction_id="stripe-block")
        self.assertIn(ctx.exception.code, {"purchase_source_locked", "purchase_source_apple"})

    def test_google_source_blocks_apple(self):
        billing, _ = WorkspaceSubscription.objects.get_or_create(organization=self.org)
        billing.purchase_source = PurchaseSource.GOOGLE
        billing.status = BillingStatus.ACTIVE
        billing.subscribed_plan = "plus"
        billing.billing_interval = "monthly"
        billing.current_period_start = timezone.now()
        billing.current_period_end = timezone.now() + timedelta(days=30)
        billing.save()
        with self.assertRaises(BillingStateError) as ctx:
            self._activate(PRODUCT_PLUS_MONTHLY, original_transaction_id="google-block")
        self.assertEqual(ctx.exception.code, "purchase_source_locked")

    def test_original_transaction_unique_across_workspaces(self):
        self._activate(PRODUCT_PLUS_MONTHLY, original_transaction_id="shared-txn")
        with self.assertRaises(BillingStateError) as ctx:
            verify_and_activate_apple_subscription(
                self.other_org,
                signed_transaction=_fake_jws(
                    _txn(
                        product_id=PRODUCT_PLUS_MONTHLY,
                        original_transaction_id="shared-txn",
                        transaction_id="x2",
                    )
                ),
            )
        self.assertEqual(ctx.exception.code, "apple_transaction_bound_elsewhere")

    def test_restore_same_workspace(self):
        self._activate(PRODUCT_PLUS_MONTHLY, original_transaction_id="restore-same")
        again = self._activate(
            PRODUCT_PLUS_MONTHLY,
            original_transaction_id="restore-same",
            transaction_id="restore-same-2",
        )
        self.assertEqual(again.purchase_source, PurchaseSource.APPLE)

    def test_restore_wrong_workspace_reject(self):
        self.test_original_transaction_unique_across_workspaces()

    def test_auto_renew_false_keeps_entitlement_until_expiry(self):
        claims = _txn(product_id=PRODUCT_BUSINESS_MONTHLY, original_transaction_id="ar-off")
        normalized = parse_verified_transaction_claims(claims)
        billing = apply_apple_entitlement(
            self.org, normalized=normalized, auto_renew=False
        )
        self.assertEqual(billing.purchase_source, PurchaseSource.APPLE)
        self.assertTrue(billing.cancel_at_period_end)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BUSINESS)

    def test_actual_expiry_finalizes_to_basic(self):
        claims = _txn(
            product_id=PRODUCT_PLUS_MONTHLY,
            original_transaction_id="exp1",
            expires_in_days=-1,
        )
        # First activate as active, then expire
        active = _txn(product_id=PRODUCT_PLUS_MONTHLY, original_transaction_id="exp1")
        apply_apple_entitlement(
            self.org,
            normalized=parse_verified_transaction_claims(active),
            auto_renew=True,
        )
        billing = apply_apple_entitlement(
            self.org,
            normalized=parse_verified_transaction_claims(claims),
            auto_renew=False,
        )
        self.assertEqual(billing.purchase_source, PurchaseSource.NONE)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)

    def test_refund_revoke_reconciliation(self):
        active = _txn(product_id=PRODUCT_PLUS_MONTHLY, original_transaction_id="ref1")
        apply_apple_entitlement(
            self.org,
            normalized=parse_verified_transaction_claims(active),
        )
        revoked = _txn(
            product_id=PRODUCT_PLUS_MONTHLY,
            original_transaction_id="ref1",
            revoked=True,
        )
        billing = apply_apple_entitlement(
            self.org,
            normalized=parse_verified_transaction_claims(revoked),
            auto_renew=False,
        )
        self.assertEqual(billing.purchase_source, PurchaseSource.NONE)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan, OrganizationPlan.BASIC)

    def test_provider_event_apple_idempotency(self):
        from billing.apple_notifications import process_apple_notification_signed_payload

        active = _txn(product_id=PRODUCT_PLUS_MONTHLY, original_transaction_id="notif1")
        apply_apple_entitlement(
            self.org,
            normalized=parse_verified_transaction_claims(active),
            auto_renew=True,
        )
        notification_uuid = str(uuid.uuid4())
        data_payload = {
            "signedTransactionInfo": _fake_jws(active),
            "signedRenewalInfo": _fake_jws({"autoRenewStatus": 1}),
        }
        outer = {
            "notificationType": "DID_RENEW",
            "notificationUUID": notification_uuid,
            "data": data_payload,
        }
        signed = _fake_jws(outer)
        # nested signed fields need verify_apple_jws to decode - with skip it works
        first = process_apple_notification_signed_payload(signed)
        second = process_apple_notification_signed_payload(signed)
        self.assertEqual(first["status"], "processed")
        self.assertEqual(second["status"], "duplicate")
        self.assertEqual(
            ProviderEvent.objects.filter(
                provider=BillingProvider.APPLE,
                external_event_id=notification_uuid,
            ).count(),
            1,
        )
        row = ProviderEvent.objects.get(external_event_id=notification_uuid)
        self.assertEqual(row.status, ProviderEventStatus.PROCESSED)

    def test_sandbox_vs_production_stored(self):
        billing = self._activate(
            PRODUCT_PLUS_MONTHLY,
            original_transaction_id="prod-env",
            environment="Production",
        )
        details = AppleSubscriptionDetails.objects.get(billing=billing)
        self.assertEqual(details.environment, "production")

    def test_verify_endpoint_success(self):
        claims = _txn(product_id=PRODUCT_PLUS_MONTHLY, original_transaction_id="api1")
        url = reverse("billing-apple-verify")
        response = self.client.post(
            url,
            {"signed_transaction": _fake_jws(claims)},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["purchase_source"], "apple")
        self.assertEqual(response.data["purchase_source_display"], "Apple")
        self.assertTrue(response.data["can_manage_apple"])
        self.assertTrue(response.data["apple_app_account_token"])

    def test_verify_endpoint_stripe_block(self):
        now = timezone.now()
        activate_paid_subscription(
            self.org,
            subscribed_plan="plus",
            billing_interval="monthly",
            purchase_source=PurchaseSource.STRIPE,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
        )
        response = self.client.post(
            reverse("billing-apple-verify"),
            {
                "signed_transaction": _fake_jws(
                    _txn(product_id=PRODUCT_PLUS_MONTHLY, original_transaction_id="api-stripe")
                )
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn(response.data["code"], {"purchase_source_locked", "purchase_source_apple"})
