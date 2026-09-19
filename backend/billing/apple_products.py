"""Canonical Apple IAP product IDs for CheckStation iOS/iPadOS.

Product IDs match App Store Connect (subscription group: CheckStation Plans).
Do not invent alternate IDs here.
"""

from __future__ import annotations

from billing.catalog import PLAN_BUSINESS, PLAN_PLUS
from billing.exceptions import BillingStateError
from billing.models import BillingInterval

APPLE_BUNDLE_ID = "app.checkstation.client"

PRODUCT_PLUS_MONTHLY = "app.checkstation.plus.monthly"
PRODUCT_PLUS_YEARLY = "app.checkstation.plus.yearly"
PRODUCT_BUSINESS_MONTHLY = "app.checkstation.business.monthly"
PRODUCT_BUSINESS_YEARLY = "app.checkstation.business.yearly"

APPLE_PRODUCT_IDS = frozenset(
    {
        PRODUCT_PLUS_MONTHLY,
        PRODUCT_PLUS_YEARLY,
        PRODUCT_BUSINESS_MONTHLY,
        PRODUCT_BUSINESS_YEARLY,
    }
)

# product_id → (plan, interval)
_APPLE_PRODUCT_MAP = {
    PRODUCT_PLUS_MONTHLY: (PLAN_PLUS, BillingInterval.MONTHLY),
    PRODUCT_PLUS_YEARLY: (PLAN_PLUS, BillingInterval.YEARLY),
    PRODUCT_BUSINESS_MONTHLY: (PLAN_BUSINESS, BillingInterval.MONTHLY),
    PRODUCT_BUSINESS_YEARLY: (PLAN_BUSINESS, BillingInterval.YEARLY),
}


def apple_product_ids() -> tuple[str, ...]:
    return (
        PRODUCT_PLUS_MONTHLY,
        PRODUCT_PLUS_YEARLY,
        PRODUCT_BUSINESS_MONTHLY,
        PRODUCT_BUSINESS_YEARLY,
    )


def plan_interval_for_apple_product(product_id: str) -> tuple[str, str]:
    key = str(product_id or "").strip()
    mapped = _APPLE_PRODUCT_MAP.get(key)
    if mapped is None:
        raise BillingStateError(
            "Unknown Apple product.",
            code="apple_unknown_product",
        )
    return mapped


def apple_product_for_plan_interval(plan: str, interval: str) -> str:
    plan_key = str(plan or "").strip().lower()
    interval_key = str(interval or "").strip().lower()
    for product_id, (mapped_plan, mapped_interval) in _APPLE_PRODUCT_MAP.items():
        if mapped_plan == plan_key and mapped_interval == interval_key:
            return product_id
    raise BillingStateError(
        "No Apple product for the requested plan and interval.",
        code="apple_unknown_product",
    )
