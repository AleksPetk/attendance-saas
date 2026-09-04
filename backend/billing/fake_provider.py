"""In-memory Stripe stand-in. Tests must not open a network connection."""

from __future__ import annotations

import json
from datetime import timedelta
from uuid import uuid4

from django.utils import timezone

from billing.catalog import price_amount_minor
from billing.exceptions import StripeSignatureError
from billing.prices import price_id_for
from billing.snapshots import (
    CheckoutSessionResult,
    InvoiceSnapshot,
    PortalSessionResult,
    ProviderEventPayload,
    SubscriptionSnapshot,
    UpgradePreview,
)

FAKE_SIGNATURE_OK = "fake-valid"


class FakeStripeProvider:
    def __init__(self):
        self.checkouts = {}
        self.subscriptions = {}
        self.customers = {}
        self.portal_calls = []
        self.preview_amount_cents = 237
        self.upgrade_calls = []
        self.downgrade_calls = []
        self.cancel_calls = []
        self.resume_calls = []
        self.cancel_downgrade_calls = []
        self.scheduled_downgrades = {}
        self.schedule_change_calls = []
        self.invoices = {}
        self.list_invoices_calls = []
        self.fail_next_list_invoices = False
        self.fail_next_schedule_change = False
        self.fail_next_upgrade = False
        self.fail_next_resume = False
        self.fail_next_cancel_downgrade = False
        self.health_calls = []
        self.fail_next_health = False

    def reset(self):
        self.__init__()

    def create_checkout_session(
        self,
        *,
        organization,
        owner,
        plan_key,
        interval,
        market="global",
        success_url,
        cancel_url,
        billing_start_at=None,
        coupon_id=None,
        coupon_slot=None,
    ) -> CheckoutSessionResult:
        session_id = f"cs_test_{uuid4().hex[:16]}"
        customer_id = self.customers.get(organization.pk) or f"cus_test_{organization.pk}"
        self.customers[organization.pk] = customer_id
        price_id = price_id_for(plan_key, interval, market=market)
        self.checkouts[session_id] = {
            "organization_id": organization.pk,
            "owner_id": owner.pk,
            "plan_key": plan_key,
            "interval": interval,
            "price_id": price_id,
            "market": market,
            "customer_id": customer_id,
            "billing_start_at": billing_start_at,
            "success_url": success_url,
            "cancel_url": cancel_url,
            "coupon_id": str(coupon_id or "").strip() or None,
            "coupon_slot": str(coupon_slot or "").strip() or None,
        }
        return CheckoutSessionResult(
            checkout_url=f"https://checkout.stripe.test/pay/{session_id}",
            session_id=session_id,
        )

    def complete_checkout(self, session_id: str) -> SubscriptionSnapshot:
        checkout = self.checkouts[session_id]
        now = timezone.now()
        billing_start_at = checkout.get("billing_start_at")
        sub_id = f"sub_test_{uuid4().hex[:16]}"
        if billing_start_at and billing_start_at > now:
            status = "trialing"
            trial_end = billing_start_at
            period_end = trial_end
            trial_start = now
        else:
            status = "active"
            trial_end = None
            trial_start = None
            period_end = now + timedelta(days=30)
        snapshot = SubscriptionSnapshot(
            subscription_id=sub_id,
            customer_id=checkout["customer_id"],
            status=status,
            price_id=checkout["price_id"],
            cancel_at_period_end=False,
            current_period_start=now,
            current_period_end=period_end,
            trial_start=trial_start,
            trial_end=trial_end,
            metadata={
                "organization_id": str(checkout["organization_id"]),
            },
        )
        self.subscriptions[sub_id] = snapshot
        checkout["subscription_id"] = sub_id
        return snapshot

    def create_portal_session(self, *, customer_id, return_url) -> PortalSessionResult:
        self.portal_calls.append({"customer_id": customer_id, "return_url": return_url})
        return PortalSessionResult(
            portal_url=f"https://billing.stripe.test/session/{customer_id}"
        )

    def seed_invoice(self, customer_id, **kwargs) -> InvoiceSnapshot:
        invoice_id = kwargs.get("invoice_id") or f"in_test_{uuid4().hex[:12]}"
        snapshot = InvoiceSnapshot(
            invoice_id=str(invoice_id),
            created_at=kwargs.get("created_at") or timezone.now(),
            amount_cents=int(kwargs.get("amount_cents", 999)),
            currency=str(kwargs.get("currency") or "usd").lower(),
            status=str(kwargs.get("status") or "paid").lower(),
            description=str(kwargs.get("description") or "Plus (monthly)"),
            hosted_url=kwargs.get(
                "hosted_url",
                f"https://invoice.stripe.test/i/{invoice_id}",
            ),
        )
        self.invoices.setdefault(customer_id, []).insert(0, snapshot)
        return snapshot

    def list_invoices(self, *, customer_id, limit=10) -> list[InvoiceSnapshot]:
        self.list_invoices_calls.append(
            {"customer_id": customer_id, "limit": int(limit)}
        )
        if self.fail_next_list_invoices:
            self.fail_next_list_invoices = False
            from billing.exceptions import StripeProviderError

            raise StripeProviderError("Stripe invoices could not be retrieved.")
        rows = self.invoices.get(customer_id, [])
        return list(rows[: int(limit)])

    def check_health(self):
        self.health_calls.append({"method": "balance.retrieve"})
        if self.fail_next_health:
            self.fail_next_health = False
            from billing.exceptions import StripeProviderError

            raise StripeProviderError("Stripe could not be reached.")
        return True

    def retrieve_subscription(self, subscription_id: str) -> SubscriptionSnapshot:
        return self.subscriptions[subscription_id]

    def retrieve_checkout_session(self, session_id: str):
        checkout = self.checkouts[session_id]
        return {
            "id": session_id,
            "subscription": checkout.get("subscription_id"),
            "customer": checkout["customer_id"],
            "metadata": {"organization_id": str(checkout["organization_id"])},
            "client_reference_id": str(checkout["organization_id"]),
        }

    def preview_upgrade(self, *, subscription_id, target_plan, target_interval, market="global"):
        snapshot = self.retrieve_subscription(subscription_id)
        return UpgradePreview(
            amount_due_cents=int(self.preview_amount_cents),
            currency="jpy" if market == "jp" else "usd",
            recurring_cents=price_amount_minor(target_plan, target_interval, market=market),
            recurring_interval=target_interval,
            target_plan=target_plan,
            next_renewal_at=snapshot.current_period_end,
        )

    def apply_upgrade(self, *, subscription_id, target_plan, target_interval, market="global"):
        if self.fail_next_upgrade:
            self.fail_next_upgrade = False
            from billing.exceptions import StripeProviderError

            raise StripeProviderError("Stripe could not apply the upgrade.")
        self.upgrade_calls.append(
            {
                "subscription_id": subscription_id,
                "target_plan": target_plan,
                "target_interval": target_interval,
                "market": market,
            }
        )
        current = self.subscriptions[subscription_id]
        updated = SubscriptionSnapshot(
            subscription_id=current.subscription_id,
            customer_id=current.customer_id,
            status="active",
            price_id=price_id_for(target_plan, target_interval, market=market),
            cancel_at_period_end=False,
            current_period_start=current.current_period_start,
            current_period_end=current.current_period_end,
            trial_start=current.trial_start,
            trial_end=current.trial_end,
            metadata=current.metadata,
        )
        self.subscriptions[subscription_id] = updated
        return updated

    def retarget_deferred_subscription(
        self,
        *,
        subscription_id,
        target_plan,
        target_interval,
        market="global",
        trial_end,
    ):
        current = self.subscriptions[subscription_id]
        if current.status != "trialing":
            from billing.exceptions import StripeProviderError

            raise StripeProviderError(
                "Deferred retarget left the subscription outside trialing.",
                code="deferred_retarget_not_trialing",
            )
        if trial_end is None:
            from billing.exceptions import StripeProviderError

            raise StripeProviderError("Deferred retarget requires a trial_end.")
        # Preserve the caller's trial_end exactly (do not shorten).
        preserved_end = trial_end
        updated = SubscriptionSnapshot(
            subscription_id=current.subscription_id,
            customer_id=current.customer_id,
            status="trialing",
            price_id=price_id_for(target_plan, target_interval, market=market),
            cancel_at_period_end=False,
            current_period_start=current.current_period_start,
            current_period_end=preserved_end,
            trial_start=current.trial_start,
            trial_end=preserved_end,
            metadata=current.metadata,
        )
        self.subscriptions[subscription_id] = updated
        self.schedule_change_calls.append(
            {
                "kind": "deferred_retarget",
                "subscription_id": subscription_id,
                "target_plan": target_plan,
                "target_interval": target_interval,
                "trial_end": preserved_end,
                "market": market,
            }
        )
        return updated

    def cancel_subscription_immediately(self, *, subscription_id):
        self.cancel_calls.append(("immediate", subscription_id))
        return self.mark_deleted(subscription_id)

    def schedule_downgrade(
        self,
        *,
        subscription_id,
        target_plan,
        target_interval,
        market="global",
        coupon_id=None,
        coupon_slot=None,
    ):
        if self.fail_next_schedule_change:
            self.fail_next_schedule_change = False
            from billing.exceptions import StripeProviderError

            raise StripeProviderError("Stripe could not schedule the billing change.")
        record = {
            "subscription_id": subscription_id,
            "target_plan": target_plan,
            "target_interval": target_interval,
            "coupon_id": str(coupon_id or "").strip() or None,
            "coupon_slot": str(coupon_slot or "").strip() or None,
            "market": market,
        }
        self.downgrade_calls.append(record)
        self.schedule_change_calls.append(record)
        self.scheduled_downgrades[subscription_id] = {
            "target_plan": target_plan,
            "target_interval": target_interval,
            "coupon_id": record["coupon_id"],
            "coupon_slot": record["coupon_slot"],
            "market": market,
        }
        return self.retrieve_subscription(subscription_id)

    def apply_scheduled_price(self, subscription_id: str, plan_key: str, interval: str, market=None):
        current = self.subscriptions[subscription_id]
        scheduled = self.scheduled_downgrades.get(subscription_id) or {}
        effective_market = market or scheduled.get("market") or "global"
        updated = SubscriptionSnapshot(
            subscription_id=current.subscription_id,
            customer_id=current.customer_id,
            status="active",
            price_id=price_id_for(plan_key, interval, market=effective_market),
            cancel_at_period_end=current.cancel_at_period_end,
            current_period_start=current.current_period_end or timezone.now(),
            current_period_end=(current.current_period_end or timezone.now())
            + timedelta(days=30),
            trial_start=None,
            trial_end=None,
            metadata=current.metadata,
        )
        self.subscriptions[subscription_id] = updated
        return updated

    def cancel_at_period_end(self, *, subscription_id):
        self.cancel_calls.append(subscription_id)
        current = self.subscriptions[subscription_id]
        updated = SubscriptionSnapshot(
            subscription_id=current.subscription_id,
            customer_id=current.customer_id,
            status=current.status,
            price_id=current.price_id,
            cancel_at_period_end=True,
            current_period_start=current.current_period_start,
            current_period_end=current.current_period_end,
            trial_start=current.trial_start,
            trial_end=current.trial_end,
            metadata=current.metadata,
        )
        self.subscriptions[subscription_id] = updated
        return updated

    def resume_subscription(self, *, subscription_id):
        self.resume_calls.append(subscription_id)
        if self.fail_next_resume:
            self.fail_next_resume = False
            from billing.exceptions import StripeProviderError

            raise StripeProviderError("Stripe could not resume the subscription.")
        current = self.subscriptions[subscription_id]
        if not current.cancel_at_period_end:
            return current
        updated = SubscriptionSnapshot(
            subscription_id=current.subscription_id,
            customer_id=current.customer_id,
            status=current.status,
            price_id=current.price_id,
            cancel_at_period_end=False,
            current_period_start=current.current_period_start,
            current_period_end=current.current_period_end,
            trial_start=current.trial_start,
            trial_end=current.trial_end,
            metadata=current.metadata,
        )
        self.subscriptions[subscription_id] = updated
        return updated

    def cancel_scheduled_downgrade(self, *, subscription_id):
        self.cancel_downgrade_calls.append(subscription_id)
        if self.fail_next_cancel_downgrade:
            self.fail_next_cancel_downgrade = False
            from billing.exceptions import StripeProviderError

            raise StripeProviderError("Stripe could not cancel the scheduled downgrade.")
        self.scheduled_downgrades.pop(subscription_id, None)
        return self.retrieve_subscription(subscription_id)

    def mark_past_due(self, subscription_id: str):
        current = self.subscriptions[subscription_id]
        updated = SubscriptionSnapshot(
            subscription_id=current.subscription_id,
            customer_id=current.customer_id,
            status="past_due",
            price_id=current.price_id,
            cancel_at_period_end=current.cancel_at_period_end,
            current_period_start=current.current_period_start,
            current_period_end=current.current_period_end,
            trial_start=current.trial_start,
            trial_end=current.trial_end,
            metadata=current.metadata,
        )
        self.subscriptions[subscription_id] = updated
        return updated

    def mark_deleted(self, subscription_id: str):
        current = self.subscriptions[subscription_id]
        updated = SubscriptionSnapshot(
            subscription_id=current.subscription_id,
            customer_id=current.customer_id,
            status="canceled",
            price_id=current.price_id,
            cancel_at_period_end=False,
            current_period_start=current.current_period_start,
            current_period_end=current.current_period_end,
            trial_start=current.trial_start,
            trial_end=current.trial_end,
            metadata=current.metadata,
        )
        self.subscriptions[subscription_id] = updated
        return updated

    def construct_webhook_event(self, payload: bytes, signature: str) -> ProviderEventPayload:
        if signature != FAKE_SIGNATURE_OK:
            raise StripeSignatureError()
        data = json.loads(payload.decode("utf-8"))
        return ProviderEventPayload(
            event_id=str(data["id"]),
            event_type=str(data["type"]),
            data_object=data.get("data", {}).get("object") or {},
        )


_FAKE = FakeStripeProvider()


def get_fake_provider() -> FakeStripeProvider:
    return _FAKE
