"""Normalized provider snapshots. No Stripe objects leak into services."""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class CheckoutSessionResult:
    checkout_url: str = ""
    session_id: str = ""
    # checkout = new Stripe Checkout Session; other modes reuse the existing
    # subscription after cancel-during-trial reselection (no second sub).
    mode: str = "checkout"


@dataclass(frozen=True)
class PortalSessionResult:
    portal_url: str


@dataclass(frozen=True)
class UpgradePreview:
    amount_due_cents: int
    currency: str
    recurring_cents: int
    recurring_interval: str
    target_plan: str
    next_renewal_at: datetime | None


@dataclass(frozen=True)
class SubscriptionSnapshot:
    subscription_id: str
    customer_id: str
    status: str
    price_id: str
    cancel_at_period_end: bool
    current_period_start: datetime | None
    current_period_end: datetime | None
    trial_start: datetime | None
    trial_end: datetime | None
    metadata: dict = field(default_factory=dict)


@dataclass(frozen=True)
class InvoiceSnapshot:
    invoice_id: str
    created_at: datetime | None
    amount_cents: int
    currency: str
    status: str
    description: str
    hosted_url: str | None


@dataclass(frozen=True)
class ProviderEventPayload:
    event_id: str
    event_type: str
    data_object: dict
