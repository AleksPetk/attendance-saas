"""Permanent V1 paid catalog — USD minor units only.

Prices live here, not on Organization and not in organizations.entitlements.
Entitlement limits/features stay in the entitlement catalog. Promotional
discounts are an eligibility-based overlay (billing.promotion) and must not
mutate these values.
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


def _builtin_trial_days() -> int:
    from billing.builtin_trial import BUILTIN_TRIAL_DAYS

    return int(BUILTIN_TRIAL_DAYS)


def price_cents(plan_key: str, interval: str) -> int:
    return int(PRICE_CENTS[plan_key][interval])


def price_decimal(plan_key: str, interval: str) -> Decimal:
    cents = price_cents(plan_key, interval)
    return Decimal(cents) / Decimal(100)


def format_usd_cents(cents: int) -> str:
    dollars = Decimal(int(cents)) / Decimal(100)
    return f"${dollars:.2f}"


def format_money_cents(cents: int, currency: str) -> str:
    code = str(currency or "usd").lower()
    if code == "usd":
        return format_usd_cents(cents)
    amount = Decimal(int(cents)) / Decimal(100)
    return f"{code.upper()} {amount:.2f}"


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


def catalog_public_payload(*, organization=None, audience=None) -> dict:
    """Prices for Account/public UI. No Stripe IDs.

    Permanent list amounts stay on each interval. Audience-aware promotion is
    layered under top-level ``promotion`` (+ Group 1 interval helpers).
    """
    from billing.promotion import (
        AUDIENCE_PUBLIC,
        GROUP_NEW_BASIC,
        cents_to_amount_string,
        interval_promotion_from_offers,
        promotion_payload_for_audience,
        resolve_audience,
    )
    from core.promotional_text import promotional_text_payload
    from core.pricing_templates import pricing_template_payload
    from organizations.entitlements.catalog import PLAN_KEYS, get_plan_definition

    if audience is None:
        audience = (
            resolve_audience(organization=organization)
            if organization is not None
            else AUDIENCE_PUBLIC
        )
    promotion = promotion_payload_for_audience(audience)
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
            cents = price_cents(plan_key, interval)
            intervals[interval] = {
                "interval": interval,
                "cents": cents,
                "amount": cents_to_amount_string(cents),
                "formatted": format_usd_cents(cents),
                "promotion": interval_promotion_from_offers(
                    interval_offers,
                    plan_key=plan_key,
                    interval=interval,
                ),
            }
        plans[plan_key] = {
            "key": plan_key,
            "display_name": display,
            "intervals": intervals,
        }
    return {
        "currency": BILLING_CURRENCY,
        "basic": {
            "key": "basic",
            "display_name": "Basic",
            "formatted": "Free",
        },
        "plans": plans,
        "entitlements": entitlements,
        "promotion": promotion,
        "pricing_template": pricing_template_payload(),
        "promotional_text": promotional_text_payload(),
        "builtin_trial_days": _builtin_trial_days(),
        "builtin_trial_offered": True,
    }
