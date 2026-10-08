"""Canonical Google Play subscription product + base-plan IDs for CheckStation Android.

Product IDs and base plan IDs match Google Play Console (auto-renewing base plans).
Do not invent alternate IDs here. Do not map entitlement from promotional offer IDs.
"""

from __future__ import annotations

from billing.catalog import PLAN_BUSINESS, PLAN_PLUS
from billing.exceptions import BillingStateError
from billing.models import BillingInterval

GOOGLE_PLAY_PACKAGE_NAME = "app.checkstation.mobile"

PRODUCT_PLUS = "checkstation.plus"
PRODUCT_BUSINESS = "checkstation.business"

BASE_PLAN_MONTHLY = "monthly"
BASE_PLAN_YEARLY = "yearly"

GOOGLE_PRODUCT_IDS = frozenset({PRODUCT_PLUS, PRODUCT_BUSINESS})
GOOGLE_BASE_PLAN_IDS = frozenset({BASE_PLAN_MONTHLY, BASE_PLAN_YEARLY})

# (product_id, base_plan_id) → (plan, interval)
_GOOGLE_PRODUCT_MAP = {
    (PRODUCT_PLUS, BASE_PLAN_MONTHLY): (PLAN_PLUS, BillingInterval.MONTHLY),
    (PRODUCT_PLUS, BASE_PLAN_YEARLY): (PLAN_PLUS, BillingInterval.YEARLY),
    (PRODUCT_BUSINESS, BASE_PLAN_MONTHLY): (PLAN_BUSINESS, BillingInterval.MONTHLY),
    (PRODUCT_BUSINESS, BASE_PLAN_YEARLY): (PLAN_BUSINESS, BillingInterval.YEARLY),
}


def google_product_ids() -> tuple[str, ...]:
    return (PRODUCT_PLUS, PRODUCT_BUSINESS)


def plan_interval_for_google_product(
    product_id: str,
    base_plan_id: str,
) -> tuple[str, str]:
    product = str(product_id or "").strip()
    base_plan = str(base_plan_id or "").strip()
    mapped = _GOOGLE_PRODUCT_MAP.get((product, base_plan))
    if mapped is None:
        if product not in GOOGLE_PRODUCT_IDS:
            raise BillingStateError(
                "Unknown Google Play product.",
                code="google_unknown_product",
            )
        raise BillingStateError(
            "Unknown Google Play base plan.",
            code="google_unknown_base_plan",
        )
    return mapped


def google_product_for_plan_interval(plan: str, interval: str) -> tuple[str, str]:
    plan_key = str(plan or "").strip().lower()
    interval_key = str(interval or "").strip().lower()
    for (product_id, base_plan_id), (mapped_plan, mapped_interval) in _GOOGLE_PRODUCT_MAP.items():
        if mapped_plan == plan_key and mapped_interval == interval_key:
            return product_id, base_plan_id
    raise BillingStateError(
        "No Google Play product for the requested plan and interval.",
        code="google_unknown_product",
    )
