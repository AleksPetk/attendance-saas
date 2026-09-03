"""Permanent market-aware paid catalog in Stripe minor units.

Prices live here, not on Organization and not in organizations.entitlements.
Entitlement limits/features stay in the entitlement catalog. Promotional
discounts are an eligibility-based overlay (billing.promotion) and must not
mutate these values.
"""

from decimal import Decimal

from billing.markets import (
    MARKET_GLOBAL,
    MARKET_JP,
    currency_for_market,
    normalize_billing_market,
    resolve_billing_market,
)

BILLING_CURRENCY = "usd"

PLAN_PLUS = "plus"
PLAN_BUSINESS = "business"

PAID_PLAN_KEYS = (PLAN_PLUS, PLAN_BUSINESS)

INTERVAL_MONTHLY = "monthly"
INTERVAL_YEARLY = "yearly"
PAID_INTERVALS = (INTERVAL_MONTHLY, INTERVAL_YEARLY)

# Integer cents. Never use binary floating-point for money.
PRICE_CENTS = {
    PLAN_PLUS: {
        INTERVAL_MONTHLY: 999,
        INTERVAL_YEARLY: 9999,
    },
    PLAN_BUSINESS: {
        INTERVAL_MONTHLY: 1499,
        INTERVAL_YEARLY: 14999,
    },
}
PRICE_AMOUNTS_MINOR = {
    MARKET_GLOBAL: PRICE_CENTS,
    MARKET_JP: {
        PLAN_PLUS: {INTERVAL_MONTHLY: 980, INTERVAL_YEARLY: 9800},
        PLAN_BUSINESS: {INTERVAL_MONTHLY: 1480, INTERVAL_YEARLY: 14800},
    },
}

PAYMENT_GRACE_DAYS = 3


def _builtin_trial_days() -> int:
    from billing.builtin_trial import BUILTIN_TRIAL_DAYS

    return int(BUILTIN_TRIAL_DAYS)


def _builtin_trial_offered() -> bool:
    from billing.builtin_trial import BUILTIN_TRIAL_OFFERED

    return bool(BUILTIN_TRIAL_OFFERED)


def price_cents(plan_key: str, interval: str) -> int:
    return int(PRICE_CENTS[plan_key][interval])


def price_amount_minor(plan_key: str, interval: str, *, market=MARKET_GLOBAL) -> int:
    return int(
        PRICE_AMOUNTS_MINOR[normalize_billing_market(market)][plan_key][interval]
    )


def currency_minor_exponent(currency: str) -> int:
    return 0 if str(currency or "").lower() == "jpy" else 2


def minor_to_decimal(amount_minor: int, currency: str) -> Decimal:
    return Decimal(int(amount_minor)) / (
        Decimal(10) ** currency_minor_exponent(currency)
    )


def price_decimal(plan_key: str, interval: str, *, market=MARKET_GLOBAL) -> Decimal:
    return minor_to_decimal(
        price_amount_minor(plan_key, interval, market=market),
        currency_for_market(market),
    )


def amount_minor_to_string(amount_minor: int, currency: str) -> str:
    value = minor_to_decimal(amount_minor, currency)
    if currency_minor_exponent(currency) == 0:
        return f"{value:.0f}"
    return f"{value:.2f}"


def format_currency_minor(amount_minor: int, currency: str) -> str:
    code = str(currency or "usd").lower()
    amount = minor_to_decimal(amount_minor, code)
    if code == "usd":
        return f"${amount:.2f}"
    if code == "jpy":
        return f"¥{int(amount):,}"
    return f"{code.upper()} {amount}"


def format_usd_cents(cents: int) -> str:
    return format_currency_minor(cents, "usd")


def format_money_cents(cents: int, currency: str) -> str:
    """Legacy name: value is the currency's Stripe minor unit (JPY is yen)."""
    return format_currency_minor(cents, currency)


INVOICE_STATUS_LABELS = {
    "paid": "Paid",
    "open": "Open",
    "void": "Void",
    "uncollectible": "Uncollectible",
    "draft": "Draft",
}


def invoice_status_label(status: str) -> str:
    key = str(status or "").lower()
    if not key:
        return "Unknown"
    return INVOICE_STATUS_LABELS.get(key, key.replace("_", " ").title())


def catalog_public_payload(*, organization=None, audience=None, market=None) -> dict:
    """Prices for Account/public UI. No Stripe IDs.

    Permanent list amounts stay on each interval. Audience-aware promotion is
    layered under top-level ``promotion`` (+ Group 1 interval helpers).
    """
    from billing.promotion import (
        AUDIENCE_PUBLIC,
        GROUP_NEW_BASIC,
        interval_promotion_from_offers,
        promotion_payload_for_audience,
        resolve_audience,
    )
    from core.promotional_text import promotional_text_payload
    from core.pricing_templates import pricing_template_payload
    from organizations.entitlements.catalog import PLAN_KEYS, get_plan_definition

    market = normalize_billing_market(market or resolve_billing_market(organization))
    currency = currency_for_market(market)
    if audience is None:
        audience = (
            resolve_audience(organization=organization)
            if organization is not None
            else AUDIENCE_PUBLIC
        )
    promotion = promotion_payload_for_audience(audience, market=market)
    offers = promotion.get("offers") or []
    # Only acquisition (Group 1) overlays per-interval display helpers.
    interval_offers = offers if promotion.get("group") == GROUP_NEW_BASIC else []

    entitlements = {}
    for plan_key in PLAN_KEYS:
        definition = get_plan_definition(plan_key)
        entitlements[plan_key] = {
            "limits": definition["limits"],
            "features": definition["features"],
        }

    plans = {}
    for plan_key, display in ((PLAN_PLUS, "Plus"), (PLAN_BUSINESS, "Business")):
        intervals = {}
        for interval in PAID_INTERVALS:
            minor = price_amount_minor(plan_key, interval, market=market)
            interval_payload = {
                "interval": interval,
                "amount_minor": minor,
                "amount": amount_minor_to_string(minor, currency),
                "formatted": format_currency_minor(minor, currency),
                "promotion": interval_promotion_from_offers(
                    interval_offers,
                    plan_key=plan_key,
                    interval=interval,
                    market=market,
                ),
            }
            if currency == "usd":
                interval_payload["cents"] = minor
            intervals[interval] = interval_payload
        plans[plan_key] = {
            "key": plan_key,
            "display_name": display,
            "intervals": intervals,
        }
    return {
        "market": market,
        "currency": currency,
        "basic": {
            "key": "basic",
            "display_name": "Basic",
            "formatted": "Free",
        },
        "plans": plans,
        "entitlements": entitlements,
        "promotion": promotion,
        "pricing_template": pricing_template_payload(),
        "promotional_text": promotional_text_payload(market=market),
        "builtin_trial_days": _builtin_trial_days(),
        "builtin_trial_offered": _builtin_trial_offered(),
    }
