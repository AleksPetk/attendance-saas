"""Permanent V1 paid catalog — USD minor units only.

Prices live here, not on Organization and not in organizations.entitlements.
Entitlement limits/features stay in the entitlement catalog. Promotional
discounts are provider-side later and must not mutate these values.
"""

from decimal import Decimal

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
        INTERVAL_YEARLY: 9990,
    },
    PLAN_BUSINESS: {
        INTERVAL_MONTHLY: 1499,
        INTERVAL_YEARLY: 14990,
    },
}

YEARLY_MONTHS_CHARGED = 10
PAYMENT_GRACE_DAYS = 3


def price_cents(plan_key: str, interval: str) -> int:
    return int(PRICE_CENTS[plan_key][interval])


def price_decimal(plan_key: str, interval: str) -> Decimal:
    cents = price_cents(plan_key, interval)
    return Decimal(cents) / Decimal(100)


def format_usd_cents(cents: int) -> str:
    dollars = Decimal(int(cents)) / Decimal(100)
    return f"${dollars:.2f}"


def catalog_public_payload() -> dict:
    """Prices for Account/public UI. No Stripe IDs."""
    plans = {}
    for plan_key, display in ((PLAN_PLUS, "Plus"), (PLAN_BUSINESS, "Business")):
        plans[plan_key] = {
            "key": plan_key,
            "display_name": display,
            "intervals": {
                interval: {
                    "interval": interval,
                    "cents": price_cents(plan_key, interval),
                    "formatted": format_usd_cents(price_cents(plan_key, interval)),
                }
                for interval in PAID_INTERVALS
            },
        }
    return {
        "currency": BILLING_CURRENCY,
        "basic": {
            "key": "basic",
            "display_name": "Basic",
            "formatted": "Free",
        },
        "plans": plans,
    }
