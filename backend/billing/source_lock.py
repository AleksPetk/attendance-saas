"""Canonical active billing-provider lock (one paid source per workspace).

``WorkspaceSubscription.purchase_source`` is the active lock only:
- ``none`` — unlocked (Basic / after finalize)
- ``stripe`` / ``apple`` / ``google`` — that provider owns billing

``cancel_at_period_end`` does **not** unlock. Only finalization sets
``purchase_source`` back to ``none``.
"""

from __future__ import annotations

from billing.exceptions import BillingStateError
from billing.models import PurchaseSource, WorkspaceSubscription
from billing.services import get_workspace_billing

PAID_PURCHASE_SOURCES = frozenset(
    {
        PurchaseSource.STRIPE,
        PurchaseSource.APPLE,
        PurchaseSource.GOOGLE,
    }
)

# Machine value → customer-facing label (not "Stripe").
PURCHASE_SOURCE_DISPLAY = {
    PurchaseSource.NONE: "No billing provider",
    PurchaseSource.STRIPE: "CheckStation",
    PurchaseSource.APPLE: "Apple",
    PurchaseSource.GOOGLE: "Google Play",
}

# Stable error codes when starting Stripe while another store owns billing.
_START_STRIPE_BLOCK_CODES = {
    PurchaseSource.APPLE: "purchase_source_apple",
    PurchaseSource.GOOGLE: "purchase_source_google",
}


def normalize_purchase_source(source) -> str:
    key = str(source or PurchaseSource.NONE).strip().lower()
    if key not in PurchaseSource.values:
        raise BillingStateError(
            f"Unsupported purchase source {source!r}.",
            code="purchase_source_invalid",
        )
    return key


def purchase_source_display_name(source) -> str:
    key = normalize_purchase_source(source)
    return PURCHASE_SOURCE_DISPLAY[key]


def active_purchase_source(*, organization=None, billing=None) -> str:
    """Return the workspace's active purchase_source (``none`` if no row)."""
    if billing is None and organization is not None:
        billing = get_workspace_billing(organization)
    if billing is None:
        return PurchaseSource.NONE
    return normalize_purchase_source(billing.purchase_source)


def source_is_locked(source) -> bool:
    return normalize_purchase_source(source) in PAID_PURCHASE_SOURCES


def can_start_provider(
    *,
    organization=None,
    billing=None,
    provider: str,
) -> bool:
    """Whether the workspace may begin billing with ``provider``."""
    wanted = normalize_purchase_source(provider)
    if wanted == PurchaseSource.NONE:
        return False
    if wanted not in PAID_PURCHASE_SOURCES:
        return False
    current = active_purchase_source(organization=organization, billing=billing)
    if current == PurchaseSource.NONE:
        return True
    return current == wanted


def assert_can_start_provider(
    *,
    organization=None,
    billing=None,
    provider: str,
) -> str:
    """Raise if ``provider`` may not start; return normalized provider on success."""
    wanted = normalize_purchase_source(provider)
    if wanted not in PAID_PURCHASE_SOURCES:
        raise BillingStateError(
            "A paid purchase source is required to start billing.",
            code="purchase_source_invalid",
        )
    current = active_purchase_source(organization=organization, billing=billing)
    if current == PurchaseSource.NONE or current == wanted:
        return wanted
    if wanted == PurchaseSource.STRIPE:
        code = _START_STRIPE_BLOCK_CODES.get(
            current, "purchase_source_not_stripe"
        )
        label = purchase_source_display_name(current)
        raise BillingStateError(
            f"{label}-managed subscriptions cannot use Stripe Checkout.",
            code=code,
        )
    raise BillingStateError(
        (
            f"This workspace is already billed by "
            f"{purchase_source_display_name(current)}."
        ),
        code="purchase_source_locked",
    )

def assert_can_activate_provider(
    *,
    organization=None,
    billing: WorkspaceSubscription | None = None,
    provider: str,
) -> str:
    """Gate for future Apple/Google verify (and Stripe activation).

    - ``none`` → activation allowed
    - same provider → allowed (idempotent / continue)
    - different paid provider → hard reject

    Callers that need races closed should hold ``lock_workspace_billing``
    and pass the locked ``billing`` row.
    """
    return assert_can_start_provider(
        organization=organization,
        billing=billing,
        provider=provider,
    )


def require_stripe_source(billing) -> None:
    """Stripe-owned mutations only (portal, cancel, upgrade, …)."""
    if billing is None or normalize_purchase_source(billing.purchase_source) != (
        PurchaseSource.STRIPE
    ):
        raise BillingStateError(
            "This workspace is not on Stripe-managed billing.",
            code="purchase_source_not_stripe",
        )


def billing_source_flags(*, organization=None, billing=None) -> dict:
    """Stable flags for API clients (management / start eligibility)."""
    source = active_purchase_source(organization=organization, billing=billing)
    locked = source_is_locked(source)
    return {
        "purchase_source": source,
        "purchase_source_display": purchase_source_display_name(source),
        "managed_by_source": source,
        "source_locked": locked,
        "can_start_stripe": can_start_provider(
            organization=organization, billing=billing, provider=PurchaseSource.STRIPE
        ),
        "can_start_apple": can_start_provider(
            organization=organization, billing=billing, provider=PurchaseSource.APPLE
        ),
        "can_start_google": can_start_provider(
            organization=organization, billing=billing, provider=PurchaseSource.GOOGLE
        ),
        "can_manage_stripe": source == PurchaseSource.STRIPE,
        "can_manage_apple": source == PurchaseSource.APPLE,
    }
