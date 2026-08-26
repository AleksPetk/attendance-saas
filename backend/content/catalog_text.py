"""Resolve plan/price tokens from canonical catalogs. Do not copy numbers by hand."""

from django.conf import settings

from billing.catalog import (
    INTERVAL_MONTHLY,
    INTERVAL_YEARLY,
    PAYMENT_GRACE_DAYS,
    PLAN_BUSINESS,
    PLAN_PLUS,
    format_usd_cents,
    price_cents,
)
from organizations.entitlements.catalog import PLAN_KEYS, get_plan_definition


def trial_placeholder_map():
    days = int(getattr(settings, "BUSINESS_TRIAL_DAYS", 0) or 0)
    if days > 0:
        status = (
            f"a {days}-day Business trial when trial checkout is enabled in this environment"
        )
    else:
        status = (
            "not currently offered because the Business trial length is unset "
            "(configured as 0 days)"
        )
    return {
        "PAYMENT_GRACE_DAYS": str(PAYMENT_GRACE_DAYS),
        "BUSINESS_TRIAL_DAYS": str(days),
        "TRIAL_STATUS": status,
    }


def plan_placeholder_map():
    mapping = {}
    for plan_key in PLAN_KEYS:
        definition = get_plan_definition(plan_key)
        prefix = f"PLAN_{plan_key.upper()}"
        mapping[f"{prefix}_NAME"] = definition["display_name"]
        for limit_key, value in definition["limits"].items():
            mapping[f"{prefix}_LIMIT_{limit_key.upper()}"] = str(value)
    mapping["PLAN_PRICE_PLUS_MONTHLY"] = format_usd_cents(
        price_cents(PLAN_PLUS, INTERVAL_MONTHLY)
    )
    mapping["PLAN_PRICE_PLUS_YEARLY"] = format_usd_cents(
        price_cents(PLAN_PLUS, INTERVAL_YEARLY)
    )
    mapping["PLAN_PRICE_BUSINESS_MONTHLY"] = format_usd_cents(
        price_cents(PLAN_BUSINESS, INTERVAL_MONTHLY)
    )
    mapping["PLAN_PRICE_BUSINESS_YEARLY"] = format_usd_cents(
        price_cents(PLAN_BUSINESS, INTERVAL_YEARLY)
    )
    return mapping


def catalog_placeholder_map():
    mapping = trial_placeholder_map()
    mapping.update(plan_placeholder_map())
    return mapping


def public_catalog_payload():
    """Machine-readable catalog for Docs and future in-app clients."""
    from billing.promotion import (
        AUDIENCE_PUBLIC,
        promotion_payload_for_audience,
    )

    plans = []
    for plan_key in PLAN_KEYS:
        definition = get_plan_definition(plan_key)
        plans.append(
            {
                "key": definition["key"],
                "display_name": definition["display_name"],
                "features": definition["features"],
                "limits": definition["limits"],
            }
        )
    # Docs catalog uses public/Group 1 promotion context only.
    promotion = promotion_payload_for_audience(AUDIENCE_PUBLIC)
    return {
        "currency": "usd",
        "grace_days": PAYMENT_GRACE_DAYS,
        "trial_days": int(getattr(settings, "BUSINESS_TRIAL_DAYS", 0) or 0),
        "trial_offered": int(getattr(settings, "BUSINESS_TRIAL_DAYS", 0) or 0) > 0,
        "promotion": promotion,
        "prices": {
            PLAN_PLUS: {
                "monthly": {
                    "cents": price_cents(PLAN_PLUS, INTERVAL_MONTHLY),
                    "formatted": format_usd_cents(price_cents(PLAN_PLUS, INTERVAL_MONTHLY)),
                },
                "yearly": {
                    "cents": price_cents(PLAN_PLUS, INTERVAL_YEARLY),
                    "formatted": format_usd_cents(price_cents(PLAN_PLUS, INTERVAL_YEARLY)),
                },
            },
            PLAN_BUSINESS: {
                "monthly": {
                    "cents": price_cents(PLAN_BUSINESS, INTERVAL_MONTHLY),
                    "formatted": format_usd_cents(
                        price_cents(PLAN_BUSINESS, INTERVAL_MONTHLY)
                    ),
                },
                "yearly": {
                    "cents": price_cents(PLAN_BUSINESS, INTERVAL_YEARLY),
                    "formatted": format_usd_cents(
                        price_cents(PLAN_BUSINESS, INTERVAL_YEARLY)
                    ),
                },
            },
        },
        "basic": {"key": "basic", "display_name": "Basic", "formatted": "Free"},
        "plans": plans,
    }
