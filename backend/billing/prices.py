"""Server-authoritative market/plan/interval Stripe Price mappings.

Permanent USD amounts stay in billing.catalog. Do not infer plan from amount.
"""

from dataclasses import dataclass

from django.conf import settings

from billing.catalog import PAID_INTERVALS, PAID_PLAN_KEYS
from billing.exceptions import StripeConfigurationError
from billing.markets import (
    MARKET_GLOBAL,
    MARKET_JP,
    currency_for_market,
    normalize_billing_market,
)

PRICE_ID_SETTINGS = {
    (MARKET_GLOBAL, "plus", "monthly"): "STRIPE_PRICE_PLUS_MONTHLY",
    (MARKET_GLOBAL, "plus", "yearly"): "STRIPE_PRICE_PLUS_YEARLY",
    (MARKET_GLOBAL, "business", "monthly"): "STRIPE_PRICE_BUSINESS_MONTHLY",
    (MARKET_GLOBAL, "business", "yearly"): "STRIPE_PRICE_BUSINESS_YEARLY",
    (MARKET_JP, "plus", "monthly"): "STRIPE_PRICE_JP_PLUS_MONTHLY",
    (MARKET_JP, "plus", "yearly"): "STRIPE_PRICE_JP_PLUS_YEARLY",
    (MARKET_JP, "business", "monthly"): "STRIPE_PRICE_JP_BUSINESS_MONTHLY",
    (MARKET_JP, "business", "yearly"): "STRIPE_PRICE_JP_BUSINESS_YEARLY",
}

# Compatibility view of the JP subset for diagnostics/tests.
JP_PRICE_ID_SETTINGS = {
    (plan, interval): name
    for (market, plan, interval), name in PRICE_ID_SETTINGS.items()
    if market == MARKET_JP
}

LEGACY_PRICE_IDS = {
    "price_1U8I7f5eHcXTJr2asaypCH5m": (MARKET_GLOBAL, "plus", "yearly"),
    "price_1U8I8L5eHcXTJr2a9wjbPKiK": (MARKET_GLOBAL, "business", "yearly"),
}


@dataclass(frozen=True)
class PriceMapping:
    market: str
    plan_key: str
    interval: str
    currency: str
    price_id: str
    legacy: bool = False


def _setting(name: str) -> str:
    return str(getattr(settings, name, "") or "").strip()


def stripe_secret_key() -> str:
    return _setting("STRIPE_SECRET_KEY")


def stripe_webhook_secret() -> str:
    return _setting("STRIPE_WEBHOOK_SECRET")


def configured_jp_price_ids() -> dict:
    """Return configured JP IDs without exposing them to clients."""
    return {key: _setting(name) for key, name in JP_PRICE_ID_SETTINGS.items()}


def price_id_for(plan_key: str, interval: str, *, market=MARKET_GLOBAL) -> str:
    market = normalize_billing_market(market)
    key = (
        market,
        str(plan_key or "").strip().lower(),
        str(interval or "").strip().lower(),
    )
    setting_name = PRICE_ID_SETTINGS.get(key)
    if not setting_name:
        raise StripeConfigurationError(
            f"No Stripe Price mapping for {market}/{plan_key}/{interval}.",
            code="stripe_price_unmapped",
        )
    price_id = _setting(setting_name)
    if not price_id:
        raise StripeConfigurationError(
            f"Stripe Price ID is not configured for {key[1]} {key[2]} "
            f"({setting_name}).",
            code="stripe_price_missing",
        )
    return price_id


def price_mapping_for_id(price_id: str):
    wanted = str(price_id or "").strip()
    if not wanted:
        return None
    for (market, plan_key, interval), setting_name in PRICE_ID_SETTINGS.items():
        if _setting(setting_name) == wanted:
            return PriceMapping(
                market, plan_key, interval, currency_for_market(market), wanted
            )
    legacy = LEGACY_PRICE_IDS.get(wanted)
    if legacy:
        market, plan_key, interval = legacy
        return PriceMapping(
            market, plan_key, interval, currency_for_market(market), wanted, True
        )
    return None


def plan_interval_for_price_id(price_id: str):
    """Backward-compatible two-field reverse lookup."""
    mapping = price_mapping_for_id(price_id)
    return (mapping.plan_key, mapping.interval) if mapping else None


def stripe_prices_configured(*, market=MARKET_GLOBAL) -> bool:
    try:
        for plan_key in PAID_PLAN_KEYS:
            for interval in PAID_INTERVALS:
                price_id_for(plan_key, interval, market=market)
    except StripeConfigurationError:
        return False
    return True


def stripe_api_configured(*, market=MARKET_GLOBAL) -> bool:
    return bool(stripe_secret_key()) and stripe_prices_configured(market=market)


def stripe_webhook_configured() -> bool:
    return bool(stripe_webhook_secret())


def require_stripe_api(*, market=MARKET_GLOBAL):
    if not stripe_secret_key():
        raise StripeConfigurationError("STRIPE_SECRET_KEY is not configured.")
    if not stripe_prices_configured(market=market):
        raise StripeConfigurationError(
            f"Stripe Price IDs for market {market} are not configured."
        )
