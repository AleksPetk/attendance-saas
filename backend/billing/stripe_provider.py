"""Stripe provider adapter. The only module that calls the Stripe SDK."""

from __future__ import annotations

from datetime import datetime, timezone as dt_timezone

from django.conf import settings

from billing.exceptions import (
    StripeConfigurationError,
    StripeProviderError,
    StripeSignatureError,
)
from billing.prices import price_id_for, require_stripe_api, stripe_webhook_secret
from billing.snapshots import (
    CheckoutSessionResult,
    PortalSessionResult,
    ProviderEventPayload,
    SubscriptionSnapshot,
    UpgradePreview,
)


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
        require_stripe_api()
        import stripe

        stripe.api_key = settings.STRIPE_SECRET_KEY
        return stripe

    def create_checkout_session(
        self,
        *,
        organization,
        owner,
        plan_key,
        interval,
        success_url,
        cancel_url,
        trial_days=None,
    ) -> CheckoutSessionResult:
        stripe = self._client()
        price_id = price_id_for(plan_key, interval)
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
        from billing.models import WorkspaceSubscription

        billing = WorkspaceSubscription.objects.filter(organization=organization).first()
        if billing and billing.external_customer_id:
            params["customer"] = billing.external_customer_id
        else:
            params["customer_email"] = owner.email
        if trial_days:
            params["subscription_data"]["trial_period_days"] = int(trial_days)
            params["payment_method_collection"] = "always"
        try:
            session = stripe.checkout.Session.create(**params)
        except Exception as exc:
            raise StripeProviderError("Stripe Checkout could not be created.") from exc
        url = _obj_get(session, "url") or ""
        session_id = _obj_get(session, "id") or ""
        if not url:
            raise StripeProviderError("Stripe Checkout did not return a URL.")
        return CheckoutSessionResult(checkout_url=url, session_id=session_id)

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
    ) -> UpgradePreview:
        stripe = self._client()
        target_price = price_id_for(target_plan, target_interval)
        snapshot = self.retrieve_subscription(subscription_id)
        item_id = self._item_id(subscription_id)
        try:
            invoice = stripe.Invoice.create_preview(
                customer=snapshot.customer_id,
                subscription=subscription_id,
                subscription_details={
                    "items": [{"id": item_id, "price": target_price}],
                    "proration_behavior": "create_prorations",
                },
            )
        except Exception as exc:
            raise StripeProviderError("Stripe could not preview this upgrade.") from exc
        from billing.catalog import price_cents

        amount = int(_obj_get(invoice, "amount_due", 0) or 0)
        currency = str(_obj_get(invoice, "currency") or "usd").lower()
        return UpgradePreview(
            amount_due_cents=amount,
            currency=currency,
            recurring_cents=price_cents(target_plan, target_interval),
            recurring_interval=target_interval,
            target_plan=target_plan,
            next_renewal_at=snapshot.current_period_end,
        )

    def apply_upgrade(self, *, subscription_id, target_plan, target_interval):
        stripe = self._client()
        target_price = price_id_for(target_plan, target_interval)
        item_id = self._item_id(subscription_id)
        try:
            stripe.Subscription.modify(
                subscription_id,
                items=[{"id": item_id, "price": target_price}],
                proration_behavior="create_prorations",
                payment_behavior="error_if_incomplete",
            )
        except Exception as exc:
            raise StripeProviderError("Stripe could not apply the upgrade.") from exc
        return self.retrieve_subscription(subscription_id)

    def schedule_downgrade(self, *, subscription_id, target_plan, target_interval):
        stripe = self._client()
        target_price = price_id_for(target_plan, target_interval)
        snapshot = self.retrieve_subscription(subscription_id)
        current_price = snapshot.price_id
        period_start = snapshot.current_period_start
        period_end = snapshot.current_period_end
        if period_start is None or period_end is None:
            raise StripeProviderError("Stripe subscription is missing period dates.")
        try:
            schedule = stripe.SubscriptionSchedule.create(
                from_subscription=subscription_id
            )
            stripe.SubscriptionSchedule.modify(
                schedule.id,
                end_behavior="release",
                phases=[
                    {
                        "items": [{"price": current_price, "quantity": 1}],
                        "start_date": int(period_start.timestamp()),
                        "end_date": int(period_end.timestamp()),
                    },
                    {
                        "items": [{"price": target_price, "quantity": 1}],
                    },
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
