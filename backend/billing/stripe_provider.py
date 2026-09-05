"""Stripe provider adapter. The only module that calls the Stripe SDK."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone as dt_timezone

from django.conf import settings

from billing.exceptions import (
    StripeConfigurationError,
    StripeProviderError,
    StripeSignatureError,
)
from billing.prices import price_id_for, stripe_webhook_secret
from billing.snapshots import (
    CheckoutSessionResult,
    InvoiceSnapshot,
    PortalSessionResult,
    ProviderEventPayload,
    SubscriptionSnapshot,
    UpgradePreview,
)
from billing.upgrade_amount import immediate_upgrade_amount_cents

logger = logging.getLogger("billing.stripe_provider")


def _unix_to_dt(value):
    if value in (None, ""):
        return None
    return datetime.fromtimestamp(int(value), tz=dt_timezone.utc)


def _obj_get(obj, key, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


class StripeProvider:
    def _client(self):
        if not str(settings.STRIPE_SECRET_KEY or "").strip():
            raise StripeConfigurationError("STRIPE_SECRET_KEY is not configured.")
        import stripe

        stripe.api_key = settings.STRIPE_SECRET_KEY
        return stripe

    def _health_client(self):
        """Balance retrieve only needs the secret key, not Price ID mappings."""
        key = (settings.STRIPE_SECRET_KEY or "").strip()
        if not key:
            raise StripeConfigurationError("STRIPE_SECRET_KEY is not configured.")
        import stripe

        stripe.api_key = key
        return stripe

    def _proration_now_ts(self, stripe, subscription_id: str) -> int:
        """Unix now for proration — respects Stripe Test Clock frozen_time.

        Explicit wall-clock ``time.time()`` breaks Test Clock upgrades after the
        clock has advanced past real time. Live subscriptions have no test_clock
        and continue to use wall clock.
        """
        try:
            sub = stripe.Subscription.retrieve(subscription_id)
        except Exception:
            return int(time.time())
        clock_ref = _obj_get(sub, "test_clock")
        clock_id = None
        if isinstance(clock_ref, str) and clock_ref:
            clock_id = clock_ref
        elif clock_ref is not None:
            clock_id = _obj_get(clock_ref, "id")
        if not clock_id:
            return int(time.time())
        try:
            clock = stripe.test_helpers.TestClock.retrieve(clock_id)
            frozen = _obj_get(clock, "frozen_time")
            if frozen:
                return int(frozen)
        except Exception:
            pass
        return int(time.time())

    def check_health(self):
        """Read-only Stripe connectivity. Does not create billing objects."""
        stripe = self._health_client()
        try:
            stripe.Balance.retrieve()
        except Exception as exc:
            raise StripeProviderError("Stripe could not be reached.") from exc
        return True

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
        stripe = self._client()
        price_id = price_id_for(plan_key, interval, market=market)
        metadata = {
            "organization_id": str(organization.pk),
            "workspace_id": organization.workspace_id,
            "owner_user_id": str(owner.pk),
        }
        params = {
            "mode": "subscription",
            "line_items": [{"price": price_id, "quantity": 1}],
            "success_url": success_url,
            "cancel_url": cancel_url,
            "client_reference_id": str(organization.pk),
            "metadata": metadata,
            "subscription_data": {"metadata": metadata},
        }
        coupon = str(coupon_id or "").strip()
        if coupon:
            # Server-applied eligibility coupon. Do not enable customer promo codes.
            params["discounts"] = [{"coupon": coupon}]
        from billing.models import WorkspaceSubscription

        billing = WorkspaceSubscription.objects.filter(organization=organization).first()
        if billing and billing.external_customer_id:
            params["customer"] = billing.external_customer_id
        else:
            params["customer_email"] = owner.email
        if billing_start_at:
            from django.utils import timezone as dj_timezone

            start_at = billing_start_at
            if dj_timezone.is_naive(start_at):
                start_at = dj_timezone.make_aware(start_at, dj_timezone.utc)
            if start_at > datetime.now(tz=dt_timezone.utc):
                params["subscription_data"]["trial_end"] = int(start_at.timestamp())
        try:
            session = stripe.checkout.Session.create(**params)
        except Exception as exc:
            logger.exception(
                "Stripe Checkout creation failed plan=%s interval=%s market=%s "
                "price_id=%s error_type=%s error_code=%s error_param=%s "
                "request_id=%s error=%s",
                plan_key,
                interval,
                market,
                price_id,
                type(exc).__name__,
                getattr(exc, "code", None),
                getattr(exc, "param", None),
                getattr(exc, "request_id", None),
                exc,
            )
            raise StripeProviderError("Stripe Checkout could not be created.") from exc
        url = _obj_get(session, "url") or ""
        session_id = _obj_get(session, "id") or ""
        if not url:
            raise StripeProviderError("Stripe Checkout did not return a URL.")
        return CheckoutSessionResult(checkout_url=url, session_id=session_id)

    def list_invoices(self, *, customer_id, limit=10) -> list[InvoiceSnapshot]:
        stripe = self._client()
        if not customer_id:
            raise StripeConfigurationError(
                "No Stripe customer is on file for this workspace.",
                code="stripe_customer_missing",
            )
        try:
            result = stripe.Invoice.list(customer=customer_id, limit=int(limit))
        except Exception as exc:
            raise StripeProviderError("Stripe invoices could not be retrieved.") from exc
        rows = _obj_get(result, "data") or []
        return [self._snapshot_from_invoice(row) for row in rows]

    def create_portal_session(self, *, customer_id, return_url) -> PortalSessionResult:
        stripe = self._client()
        if not customer_id:
            raise StripeConfigurationError(
                "No Stripe customer is on file for this workspace.",
                code="stripe_customer_missing",
            )
        try:
            session = stripe.billing_portal.Session.create(
                customer=customer_id,
                return_url=return_url,
            )
        except Exception as exc:
            raise StripeProviderError("Stripe Customer Portal could not be opened.") from exc
        url = _obj_get(session, "url") or ""
        if not url:
            raise StripeProviderError("Stripe Customer Portal did not return a URL.")
        return PortalSessionResult(portal_url=url)

    def retrieve_subscription(self, subscription_id: str) -> SubscriptionSnapshot:
        stripe = self._client()
        try:
            sub = stripe.Subscription.retrieve(
                subscription_id,
                expand=["items.data.price"],
            )
        except Exception as exc:
            raise StripeProviderError("Stripe subscription could not be retrieved.") from exc
        return self._snapshot_from_subscription(sub)

    def retrieve_checkout_session(self, session_id: str):
        stripe = self._client()
        try:
            return stripe.checkout.Session.retrieve(
                session_id,
                expand=["subscription"],
            )
        except Exception as exc:
            raise StripeProviderError("Stripe Checkout session could not be retrieved.") from exc

    def preview_upgrade(
        self,
        *,
        subscription_id,
        target_plan,
        target_interval,
        market="global",
    ) -> UpgradePreview:
        stripe = self._client()
        target_price = price_id_for(target_plan, target_interval, market=market)
        snapshot = self.retrieve_subscription(subscription_id)
        item_id = self._item_id(subscription_id)
        proration_date = self._proration_now_ts(stripe, subscription_id)
        try:
            invoice = stripe.Invoice.create_preview(
                customer=snapshot.customer_id,
                subscription=subscription_id,
                subscription_details={
                    "items": [{"id": item_id, "price": target_price}],
                    "proration_behavior": "always_invoice",
                    "proration_date": proration_date,
                    "billing_cycle_anchor": "unchanged",
                },
            )
        except Exception as exc:
            raise StripeProviderError("Stripe could not preview this upgrade.") from exc
        from billing.catalog import price_amount_minor

        amount = immediate_upgrade_amount_cents(
            invoice,
            current_period_end_ts=(
                int(snapshot.current_period_end.timestamp())
                if snapshot.current_period_end
                else None
            ),
        )
        currency = str(_obj_get(invoice, "currency") or "usd").lower()
        return UpgradePreview(
            amount_due_cents=amount,
            currency=currency,
            recurring_cents=price_amount_minor(target_plan, target_interval, market=market),
            recurring_interval=target_interval,
            target_plan=target_plan,
            next_renewal_at=snapshot.current_period_end,
        )

    def apply_upgrade(self, *, subscription_id, target_plan, target_interval, market="global"):
        stripe = self._client()
        target_price = price_id_for(target_plan, target_interval, market=market)
        item_id = self._item_id(subscription_id)
        proration_date = self._proration_now_ts(stripe, subscription_id)
        try:
            stripe.Subscription.modify(
                subscription_id,
                items=[{"id": item_id, "price": target_price}],
                proration_behavior="always_invoice",
                proration_date=proration_date,
                payment_behavior="error_if_incomplete",
            )
        except Exception as exc:
            raise StripeProviderError("Stripe could not apply the upgrade.") from exc
        return self.retrieve_subscription(subscription_id)

    def retarget_deferred_subscription(
        self,
        *,
        subscription_id,
        target_plan,
        target_interval,
        market="global",
        trial_end,
    ):
        """Change future paid price while preserving Stripe trial_end.

        Used only during the built-in CheckStation Business trial. Must never
        prorate, never move billing_cycle_anchor, never shorten trial_end.
        """
        stripe = self._client()
        target_price = price_id_for(target_plan, target_interval, market=market)
        item_id = self._item_id(subscription_id)
        if trial_end is None:
            raise StripeProviderError("Deferred retarget requires a trial_end.")
        from django.utils import timezone as dj_timezone

        end = trial_end
        if dj_timezone.is_naive(end):
            end = dj_timezone.make_aware(end, dj_timezone.utc)
        trial_end_ts = int(end.timestamp())
        now_ts = int(time.time())
        if trial_end_ts <= now_ts:
            raise StripeProviderError(
                "Deferred retarget cannot use a trial_end in the past."
            )
        try:
            stripe.Subscription.modify(
                subscription_id,
                items=[{"id": item_id, "price": target_price}],
                proration_behavior="none",
                trial_end=trial_end_ts,
                cancel_at_period_end=False,
            )
        except Exception as exc:
            raise StripeProviderError(
                "Stripe could not retarget the deferred subscription."
            ) from exc
        snapshot = self.retrieve_subscription(subscription_id)
        if snapshot.status != "trialing":
            raise StripeProviderError(
                "Deferred retarget left the subscription outside trialing.",
                code="deferred_retarget_not_trialing",
            )
        if snapshot.trial_end is None or int(snapshot.trial_end.timestamp()) != trial_end_ts:
            raise StripeProviderError(
                "Deferred retarget changed Stripe trial_end.",
                code="deferred_retarget_trial_end_changed",
            )
        return snapshot

    def cancel_subscription_immediately(self, *, subscription_id):
        """End a deferred/paid subscription now (no cancel-at-period-end)."""
        stripe = self._client()
        try:
            stripe.Subscription.cancel(subscription_id)
        except Exception as exc:
            raise StripeProviderError(
                "Stripe could not cancel the subscription immediately."
            ) from exc
        return self.retrieve_subscription(subscription_id)

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
        stripe = self._client()
        target_price = price_id_for(target_plan, target_interval, market=market)
        snapshot = self.retrieve_subscription(subscription_id)
        current_price = snapshot.price_id
        period_start = snapshot.current_period_start
        period_end = snapshot.current_period_end
        if period_start is None or period_end is None:
            raise StripeProviderError("Stripe subscription is missing period dates.")
        next_phase = {
            "items": [{"price": target_price, "quantity": 1}],
            # Reset the billing cycle when the target phase starts so interval
            # changes (e.g. Plus Monthly → Plus Yearly) invoice at period end
            # instead of only swapping the price onto the old cycle.
            "billing_cycle_anchor": "phase_start",
        }
        coupon = str(coupon_id or "").strip()
        if coupon:
            # Apply the coupon to the scheduled target phase only.
            next_phase["discounts"] = [{"coupon": coupon}]
        try:
            schedule = stripe.SubscriptionSchedule.create(
                from_subscription=subscription_id
            )
            stripe.SubscriptionSchedule.modify(
                schedule.id,
                end_behavior="release",
                proration_behavior="none",
                phases=[
                    {
                        "items": [{"price": current_price, "quantity": 1}],
                        "start_date": int(period_start.timestamp()),
                        "end_date": int(period_end.timestamp()),
                    },
                    next_phase,
                ],
            )
        except Exception as exc:
            raise StripeProviderError(
                "Stripe could not schedule the period-end downgrade."
            ) from exc
        return self.retrieve_subscription(subscription_id)

    def cancel_at_period_end(self, *, subscription_id):
        stripe = self._client()
        try:
            stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)
        except Exception as exc:
            raise StripeProviderError("Stripe could not schedule cancellation.") from exc
        return self.retrieve_subscription(subscription_id)

    def resume_subscription(self, *, subscription_id):
        """Clear cancel_at_period_end on the existing subscription (no new Checkout)."""
        stripe = self._client()
        try:
            stripe.Subscription.modify(subscription_id, cancel_at_period_end=False)
        except Exception as exc:
            raise StripeProviderError("Stripe could not resume the subscription.") from exc
        return self.retrieve_subscription(subscription_id)

    def cancel_scheduled_downgrade(self, *, subscription_id):
        """Release a SubscriptionSchedule so the current Business price continues."""
        stripe = self._client()
        try:
            sub = stripe.Subscription.retrieve(subscription_id)
        except Exception as exc:
            raise StripeProviderError(
                "Stripe could not load the subscription for downgrade reversal."
            ) from exc
        schedule_ref = _obj_get(sub, "schedule")
        schedule_id = None
        if isinstance(schedule_ref, str) and schedule_ref:
            schedule_id = schedule_ref
        elif schedule_ref is not None:
            schedule_id = _obj_get(schedule_ref, "id")
        if schedule_id:
            try:
                stripe.SubscriptionSchedule.release(schedule_id)
            except Exception as exc:
                raise StripeProviderError(
                    "Stripe could not cancel the scheduled downgrade."
                ) from exc
        return self.retrieve_subscription(subscription_id)

    def construct_webhook_event(self, payload: bytes, signature: str) -> ProviderEventPayload:
        secret = stripe_webhook_secret()
        if not secret:
            raise StripeConfigurationError("STRIPE_WEBHOOK_SECRET is not configured.")
        import stripe

        try:
            event = stripe.Webhook.construct_event(payload, signature, secret)
        except stripe.SignatureVerificationError as exc:
            raise StripeSignatureError() from exc
        except Exception as exc:
            raise StripeSignatureError() from exc
        event_id = _obj_get(event, "id") or ""
        event_type = _obj_get(event, "type") or ""
        data = _obj_get(event, "data") or {}
        obj = _obj_get(data, "object") or {}
        if hasattr(obj, "to_dict"):
            obj = obj.to_dict()
        return ProviderEventPayload(
            event_id=str(event_id),
            event_type=str(event_type),
            data_object=obj if isinstance(obj, dict) else {},
        )

    def _item_id(self, subscription_id: str) -> str:
        stripe = self._client()
        sub = stripe.Subscription.retrieve(subscription_id)
        items = _obj_get(_obj_get(sub, "items"), "data") or []
        if not items:
            raise StripeProviderError("Stripe subscription has no items.")
        item_id = _obj_get(items[0], "id")
        if not item_id:
            raise StripeProviderError("Stripe subscription item is missing.")
        return str(item_id)

    def _snapshot_from_invoice(self, invoice) -> InvoiceSnapshot:
        status = str(_obj_get(invoice, "status") or "").lower()
        amount = _obj_get(invoice, "amount_paid")
        if amount in (None, "") or int(amount or 0) <= 0:
            amount = _obj_get(invoice, "total", 0)
        description = str(_obj_get(invoice, "description") or "").strip()
        if not description:
            lines = _obj_get(_obj_get(invoice, "lines"), "data") or []
            if lines:
                description = str(_obj_get(lines[0], "description") or "").strip()
        if not description:
            number = _obj_get(invoice, "number")
            if number:
                description = f"Invoice #{number}"
        hosted_url = _obj_get(invoice, "hosted_invoice_url") or None
        if hosted_url:
            hosted_url = str(hosted_url)
        return InvoiceSnapshot(
            invoice_id=str(_obj_get(invoice, "id") or ""),
            created_at=_unix_to_dt(_obj_get(invoice, "created")),
            amount_cents=int(amount or 0),
            currency=str(_obj_get(invoice, "currency") or "usd").lower(),
            status=status,
            description=description,
            hosted_url=hosted_url,
        )

    def _snapshot_from_subscription(self, sub) -> SubscriptionSnapshot:
        items = _obj_get(_obj_get(sub, "items"), "data") or []
        item = items[0] if items else {}
        price = _obj_get(item, "price")
        if isinstance(price, str):
            price_id = price
        else:
            price_id = str(_obj_get(price, "id") or "")
        period_start = _obj_get(sub, "current_period_start") or _obj_get(
            item, "current_period_start"
        )
        period_end = _obj_get(sub, "current_period_end") or _obj_get(
            item, "current_period_end"
        )
        metadata = _obj_get(sub, "metadata") or {}
        if hasattr(metadata, "to_dict"):
            metadata = metadata.to_dict()
        if not isinstance(metadata, dict):
            metadata = {}
        return SubscriptionSnapshot(
            subscription_id=str(_obj_get(sub, "id") or ""),
            customer_id=str(_obj_get(sub, "customer") or ""),
            status=str(_obj_get(sub, "status") or ""),
            price_id=price_id,
            cancel_at_period_end=bool(_obj_get(sub, "cancel_at_period_end")),
            current_period_start=_unix_to_dt(period_start),
            current_period_end=_unix_to_dt(period_end),
            trial_start=_unix_to_dt(_obj_get(sub, "trial_start")),
            trial_end=_unix_to_dt(_obj_get(sub, "trial_end")),
            metadata={str(k): str(v) for k, v in metadata.items()},
        )
