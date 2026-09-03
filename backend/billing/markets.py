"""Billing-market resolution independent from language and locale."""

from billing.exceptions import BillingStateError

MARKET_GLOBAL = "global"
MARKET_JP = "jp"
BILLING_MARKETS = (MARKET_GLOBAL, MARKET_JP)
MARKET_CURRENCIES = {MARKET_GLOBAL: "usd", MARKET_JP: "jpy"}
MARKET_OVERRIDE_AUTO = "auto"


def normalize_billing_market(market: str) -> str:
    value = str(market or "").strip().lower()
    if value not in BILLING_MARKETS:
        raise BillingStateError("Unsupported billing market.", code="billing_market_invalid")
    return value


def currency_for_market(market: str) -> str:
    return MARKET_CURRENCIES[normalize_billing_market(market)]


def market_for_currency(currency: str) -> str:
    wanted = str(currency or "").strip().lower()
    for market, code in MARKET_CURRENCIES.items():
        if code == wanted:
            return market
    raise BillingStateError("Unsupported billing currency.", code="billing_currency_invalid")


def resolve_auto_billing_market(workspace=None) -> str:
    """
    Resolve AUTO override for an existing workspace.

    Intentionally ignores request geo: existing AUTO organizations must stay
    stable (travel/IP must not redefine their catalog). New registrations lock
    to ``global`` or ``jp`` at signup instead of leaving AUTO.
    """
    return MARKET_GLOBAL


def resolve_billing_market(workspace=None) -> str:
    """Resolve workspace override without consulting language or request geo."""
    override = str(
        getattr(workspace, "billing_market_override", MARKET_OVERRIDE_AUTO)
        or MARKET_OVERRIDE_AUTO
    ).strip().lower()
    if override == MARKET_GLOBAL:
        return MARKET_GLOBAL
    if override == MARKET_JP:
        return MARKET_JP
    return resolve_auto_billing_market(workspace)


def lock_market_for_new_registration(request=None) -> str:
    """Server-side market freeze for a new owner signup (never AUTO)."""
    from core.geo import resolve_request_geo

    return resolve_request_geo(request).billing_market


def market_for_existing_subscription(billing, *, workspace=None) -> str:
    currency = str(getattr(billing, "currency", "") or "").lower()
    status = str(getattr(billing, "status", "") or "").lower()
    if billing is not None and status in {"trialing", "active", "past_due"} and currency in {"usd", "jpy"}:
        return market_for_currency(currency)
    return resolve_billing_market(workspace)
