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
    """Resolve AUTO mode. Geo/country logic is deliberately deferred."""
    return MARKET_GLOBAL


def resolve_billing_market(workspace=None) -> str:
    """Resolve the platform override without consulting language or locale."""
    override = str(
        getattr(workspace, "billing_market_override", MARKET_OVERRIDE_AUTO)
        or MARKET_OVERRIDE_AUTO
    ).strip().lower()
    if override == MARKET_GLOBAL:
        return MARKET_GLOBAL
    if override == MARKET_JP:
        return MARKET_JP
    return resolve_auto_billing_market(workspace)


def market_for_existing_subscription(billing, *, workspace=None) -> str:
    currency = str(getattr(billing, "currency", "") or "").lower()
    status = str(getattr(billing, "status", "") or "").lower()
    if billing is not None and status in {"trialing", "active", "past_due"} and currency in {"usd", "jpy"}:
        return market_for_currency(currency)
    return resolve_billing_market(workspace)
