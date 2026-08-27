"""Eligibility-based CheckStation promotions — provider-neutral overlay.

Permanent list prices stay in billing.catalog.PRICE_CENTS. This module:

1. Stores three independent admin-controlled V1 promotion groups
2. Resolves which group (if any) an audience is eligible for
3. Builds structured offers for catalog / billing clients

Fixed Stripe coupon off-amounts drive promotional prices. Coupon IDs are
resolved server-side in billing.coupons at checkout/schedule time only.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from django.db import transaction

from billing.catalog import (
    INTERVAL_MONTHLY,
    INTERVAL_YEARLY,
    PLAN_BUSINESS,
    PLAN_PLUS,
    format_usd_cents,
    price_cents,
)
from billing.models import BillingStatus
from core.models import (
    NewBasicPromotionMode,
    PlatformPromotionModeChange,
    PlatformPromotionSettings,
    PromotionGroupKey,
)

# Until a coupon env slot is configured for an offer, checkout must not claim
# the discount is applied. Coupon-backed offers flip this per-offer via
# billing.coupons.offer_slot_has_coupon.
CHECKOUT_APPLIES_PROMOTION = False

# Audiences (subscription state)
AUDIENCE_PUBLIC = "public"
AUDIENCE_BASIC = "basic"
AUDIENCE_NONE = "none"
AUDIENCE_PLUS_MONTHLY = "plus_monthly"
AUDIENCE_PLUS_YEARLY = "plus_yearly"
AUDIENCE_BUSINESS_MONTHLY = "business_monthly"
AUDIENCE_BUSINESS_YEARLY = "business_yearly"

# Active V1 promotion groups (admin-controlled).
GROUP_NEW_BASIC = PromotionGroupKey.NEW_BASIC
GROUP_PLUS_MONTHLY = PromotionGroupKey.PLUS_MONTHLY
GROUP_BUSINESS_MONTHLY = PromotionGroupKey.BUSINESS_MONTHLY

# Historical audit-only group key (no longer an active promotion group).
GROUP_PLUS_YEARLY_HISTORICAL = "plus_yearly"

MODE_OFF = NewBasicPromotionMode.OFF
MODE_NORMAL = NewBasicPromotionMode.NORMAL
MODE_BIG = NewBasicPromotionMode.BIG

# Offer type identifiers (provider-neutral)
OFFER_FIRST_PERIOD_PERCENTAGE = "first_period_percentage"
OFFER_FIRST_YEAR_PERCENTAGE = "first_year_percentage"

DISCOUNT_TYPE_FIXED_AMOUNT = "fixed_amount"

# Marketing % labels (copy only). Actual first-period price comes from the
# fixed Stripe coupon discount amounts below — never from percent math.
NEW_BASIC_MARKETING_PERCENT = {
    MODE_NORMAL: {INTERVAL_MONTHLY: 50, INTERVAL_YEARLY: 30},
    MODE_BIG: {INTERVAL_MONTHLY: 70, INTERVAL_YEARLY: 50},
}

# Fixed Stripe coupon off-amounts (USD cents). Must match sandbox coupons.
# promotional = normal catalog cents − discount_cents.
FIXED_COUPON_DISCOUNT_CENTS = {
    # Group 1 NORMAL
    (GROUP_NEW_BASIC, MODE_NORMAL, PLAN_PLUS, INTERVAL_MONTHLY): 500,
    (GROUP_NEW_BASIC, MODE_NORMAL, PLAN_BUSINESS, INTERVAL_MONTHLY): 750,
    (GROUP_NEW_BASIC, MODE_NORMAL, PLAN_PLUS, INTERVAL_YEARLY): 3000,
    (GROUP_NEW_BASIC, MODE_NORMAL, PLAN_BUSINESS, INTERVAL_YEARLY): 4500,
    # Group 1 BIG
    (GROUP_NEW_BASIC, MODE_BIG, PLAN_PLUS, INTERVAL_MONTHLY): 700,
    (GROUP_NEW_BASIC, MODE_BIG, PLAN_BUSINESS, INTERVAL_MONTHLY): 1050,
    (GROUP_NEW_BASIC, MODE_BIG, PLAN_PLUS, INTERVAL_YEARLY): 5000,
    (GROUP_NEW_BASIC, MODE_BIG, PLAN_BUSINESS, INTERVAL_YEARLY): 7500,
    # Group 2 Plus Monthly annual offers
    (GROUP_PLUS_MONTHLY, "plus_yearly_30"): 3000,
    (GROUP_PLUS_MONTHLY, "business_yearly_30"): 4500,
    # Group 3 Business Monthly → Business Yearly (same $45 coupon economics)
    (GROUP_BUSINESS_MONTHLY, "business_yearly_30"): 4500,
}

GROUP_LABELS = {
    GROUP_NEW_BASIC: "New / Basic",
    GROUP_PLUS_MONTHLY: "Plus Monthly",
    GROUP_BUSINESS_MONTHLY: "Business Monthly",
}

GROUP_SUMMARIES = {
    GROUP_NEW_BASIC: {
        MODE_OFF: "No active promotional pricing for public / Basic",
        MODE_NORMAL: "50% off first month; 30% off first year",
        MODE_BIG: "70% off first month; 50% off first year",
    },
    GROUP_PLUS_MONTHLY: {
        "off": "No Plus Monthly annual offers",
        "on": (
            "Plus Yearly: 30% off first year; "
            "Business Yearly: 30% off first year"
        ),
    },
    GROUP_BUSINESS_MONTHLY: {
        "off": "No Business Monthly yearly-switch offer",
        "on": "Business Yearly: 30% off first year",
    },
}

AUDIENCE_TO_GROUP = {
    AUDIENCE_PUBLIC: GROUP_NEW_BASIC,
    AUDIENCE_BASIC: GROUP_NEW_BASIC,
    AUDIENCE_NONE: None,
    AUDIENCE_PLUS_MONTHLY: GROUP_PLUS_MONTHLY,
    AUDIENCE_PLUS_YEARLY: None,  # Plus Yearly: no V1 promotion
    AUDIENCE_BUSINESS_MONTHLY: GROUP_BUSINESS_MONTHLY,
    AUDIENCE_BUSINESS_YEARLY: None,
}

ACTIVE_PROMOTION_GROUPS = (
    GROUP_NEW_BASIC,
    GROUP_PLUS_MONTHLY,
    GROUP_BUSINESS_MONTHLY,
)


def cents_to_amount_string(cents: int) -> str:
    dollars = Decimal(int(cents)) / Decimal(100)
    return f"{dollars.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)}"


def fixed_promotional_cents(normal_cents: int, discount_cents: int) -> int:
    """First-period amount after a fixed Stripe coupon off-amount."""
    normal = int(normal_cents)
    discount = int(discount_cents)
    if discount < 0:
        raise ValueError("discount_cents must be >= 0")
    if discount > normal:
        raise ValueError("discount_cents cannot exceed normal price")
    return normal - discount


def apply_percent_off_cents(cents: int, discount_percent: int) -> int:
    """Legacy percent helper — not used for the 11 fixed coupon offers."""
    if discount_percent < 0 or discount_percent > 100:
        raise ValueError("discount_percent must be between 0 and 100")
    remaining_percent = Decimal(100 - int(discount_percent))
    discounted = (Decimal(int(cents)) * remaining_percent) / Decimal(100)
    return int(discounted.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def provider_offer_ref(group: str, slot_key: str):
    """Public payloads never expose Stripe coupon IDs.

    Coupon IDs are resolved server-side from env in billing.coupons at
    checkout/schedule time only.
    """
    return None


def get_settings() -> PlatformPromotionSettings:
    return PlatformPromotionSettings.load()


def resolve_audience(*, organization=None, billing=None) -> str:
    """Map workspace commercial state → audience key.

    Anonymous / no organization → public.
    CheckStation-managed workspaces receive no promotions.
    No paid access → basic (even if Organization.plan was left stale).
    Paid/trialing/past_due → plan+interval audience.
    """
    if organization is not None and organization.is_checkstation_account:
        return AUDIENCE_NONE

    if organization is None and billing is None:
        return AUDIENCE_PUBLIC

    if billing is None and organization is not None:
        from billing.services import get_workspace_billing

        billing = get_workspace_billing(organization)

    if billing is None:
        return AUDIENCE_BASIC

    access_active = billing.status in {
        BillingStatus.TRIALING,
        BillingStatus.ACTIVE,
        BillingStatus.PAST_DUE,
    }
    plan = (billing.subscribed_plan or "").strip().lower()
    interval = (billing.billing_interval or "").strip().lower()
    if not access_active or plan not in {PLAN_PLUS, PLAN_BUSINESS}:
        return AUDIENCE_BASIC
    if plan == PLAN_PLUS and interval == INTERVAL_MONTHLY:
        return AUDIENCE_PLUS_MONTHLY
    if plan == PLAN_PLUS and interval == INTERVAL_YEARLY:
        return AUDIENCE_PLUS_YEARLY
    if plan == PLAN_BUSINESS and interval == INTERVAL_MONTHLY:
        return AUDIENCE_BUSINESS_MONTHLY
    if plan == PLAN_BUSINESS and interval == INTERVAL_YEARLY:
        return AUDIENCE_BUSINESS_YEARLY
    return AUDIENCE_BASIC


def eligible_group_for_audience(audience: str) -> Optional[str]:
    return AUDIENCE_TO_GROUP.get(audience)


def _money_fields(cents: Optional[int]) -> dict:
    if cents is None:
        return {
            "cents": None,
            "amount": None,
            "formatted": None,
        }
    value = int(cents)
    return {
        "cents": value,
        "amount": cents_to_amount_string(value),
        "formatted": format_usd_cents(value),
    }


def _base_offer(
    *,
    offer_id: str,
    offer_type: str,
    target_plan: str,
    target_interval: str,
    label: str,
    discount_percent: Optional[int] = None,
    discount_type: Optional[str] = None,
    discount_amount_cents: Optional[int] = None,
    duration_periods: Optional[int] = None,
    duration_label: str = "",
    normal_cents: Optional[int] = None,
    promotional_cents: Optional[int] = None,
    renews_at_cents: Optional[int] = None,
    match_plan: Optional[str] = None,
    match_interval: Optional[str] = None,
    requires_provider_preview: bool = False,
    provider_slot: str = "",
    group: str = "",
) -> dict:
    normal = _money_fields(normal_cents)
    promo = _money_fields(promotional_cents)
    renews = _money_fields(
        renews_at_cents if renews_at_cents is not None else normal_cents
    )
    discount_money = _money_fields(discount_amount_cents)
    # Lazy import avoids circular import with billing.coupons.
    from billing.coupons import offer_slot_has_coupon

    applies = bool(
        group
        and provider_slot
        and offer_slot_has_coupon(group, provider_slot)
    )
    return {
        "id": offer_id,
        "offer_type": offer_type,
        "target_plan": target_plan,
        "target_interval": target_interval,
        "label": label,
        # Marketing label only — not used to compute promotional_amount.
        "discount_percent": discount_percent,
        "marketing_discount_percent": discount_percent,
        "discount_type": discount_type,
        "discount_amount_cents": discount_money["cents"],
        "discount_amount": discount_money["amount"],
        "discount_amount_formatted": discount_money["formatted"],
        "duration_periods": duration_periods,
        "duration_label": duration_label,
        "normal_cents": normal["cents"],
        "normal_amount": normal["amount"],
        "normal_formatted": normal["formatted"],
        "promotional_cents": promo["cents"],
        "promotional_amount": promo["amount"],
        "promotional_formatted": promo["formatted"],
        "renews_at_cents": renews["cents"],
        "renews_at_amount": renews["amount"],
        "renews_at_formatted": renews["formatted"],
        "match_plan": match_plan,
        "match_interval": match_interval,
        "requires_provider_preview": requires_provider_preview,
        "checkout_applies_promotion": applies,
        # Never expose Stripe coupon IDs on public offer payloads.
        "provider_offer_ref": None,
    }


def _new_basic_offers(mode: str) -> list[dict]:
    if mode == MODE_OFF:
        return []
    percents = NEW_BASIC_MARKETING_PERCENT.get(mode) or {}
    offers = []
    for plan in (PLAN_PLUS, PLAN_BUSINESS):
        for interval in (INTERVAL_MONTHLY, INTERVAL_YEARLY):
            percent = percents[interval]
            normal = price_cents(plan, interval)
            discount = FIXED_COUPON_DISCOUNT_CENTS[(GROUP_NEW_BASIC, mode, plan, interval)]
            first = fixed_promotional_cents(normal, discount)
            duration_label = (
                "first_month" if interval == INTERVAL_MONTHLY else "first_year"
            )
            offer_type = (
                OFFER_FIRST_PERIOD_PERCENTAGE
                if interval == INTERVAL_MONTHLY
                else OFFER_FIRST_YEAR_PERCENTAGE
            )
            offers.append(
                _base_offer(
                    offer_id=f"new_basic_{mode}_{plan}_{interval}",
                    offer_type=offer_type,
                    target_plan=plan,
                    target_interval=interval,
                    label=f"{percent}% off {duration_label.replace('_', ' ')}",
                    discount_percent=percent,
                    discount_type=DISCOUNT_TYPE_FIXED_AMOUNT,
                    discount_amount_cents=discount,
                    duration_periods=1,
                    duration_label=duration_label,
                    normal_cents=normal,
                    promotional_cents=first,
                    renews_at_cents=normal,
                    provider_slot=f"{mode}.{plan}.{interval}",
                    group=GROUP_NEW_BASIC,
                )
            )
    return offers


def _plus_monthly_offers() -> list[dict]:
    plus_yearly = price_cents(PLAN_PLUS, INTERVAL_YEARLY)
    business_yearly = price_cents(PLAN_BUSINESS, INTERVAL_YEARLY)
    plus_yearly_discount = FIXED_COUPON_DISCOUNT_CENTS[
        (GROUP_PLUS_MONTHLY, "plus_yearly_30")
    ]
    business_yearly_discount = FIXED_COUPON_DISCOUNT_CENTS[
        (GROUP_PLUS_MONTHLY, "business_yearly_30")
    ]
    return [
        _base_offer(
            offer_id="plus_monthly_to_plus_yearly",
            offer_type=OFFER_FIRST_YEAR_PERCENTAGE,
            target_plan=PLAN_PLUS,
            target_interval=INTERVAL_YEARLY,
            label="30% off first Plus Yearly payment",
            discount_percent=30,
            discount_type=DISCOUNT_TYPE_FIXED_AMOUNT,
            discount_amount_cents=plus_yearly_discount,
            duration_periods=1,
            duration_label="first_year",
            normal_cents=plus_yearly,
            promotional_cents=fixed_promotional_cents(
                plus_yearly, plus_yearly_discount
            ),
            renews_at_cents=plus_yearly,
            provider_slot="plus_yearly_30",
            group=GROUP_PLUS_MONTHLY,
        ),
        _base_offer(
            offer_id="plus_monthly_to_business_yearly",
            offer_type=OFFER_FIRST_YEAR_PERCENTAGE,
            target_plan=PLAN_BUSINESS,
            target_interval=INTERVAL_YEARLY,
            label="30% off first Business Yearly payment",
            discount_percent=30,
            discount_type=DISCOUNT_TYPE_FIXED_AMOUNT,
            discount_amount_cents=business_yearly_discount,
            duration_periods=1,
            duration_label="first_year",
            normal_cents=business_yearly,
            promotional_cents=fixed_promotional_cents(
                business_yearly, business_yearly_discount
            ),
            renews_at_cents=business_yearly,
            provider_slot="business_yearly_30",
            group=GROUP_PLUS_MONTHLY,
        ),
    ]


def _business_monthly_offers() -> list[dict]:
    business_yearly = price_cents(PLAN_BUSINESS, INTERVAL_YEARLY)
    discount = FIXED_COUPON_DISCOUNT_CENTS[
        (GROUP_BUSINESS_MONTHLY, "business_yearly_30")
    ]
    return [
        _base_offer(
            offer_id="business_monthly_to_business_yearly",
            offer_type=OFFER_FIRST_YEAR_PERCENTAGE,
            target_plan=PLAN_BUSINESS,
            target_interval=INTERVAL_YEARLY,
            label="30% off first Business Yearly payment",
            discount_percent=30,
            discount_type=DISCOUNT_TYPE_FIXED_AMOUNT,
            discount_amount_cents=discount,
            duration_periods=1,
            duration_label="first_year",
            normal_cents=business_yearly,
            promotional_cents=fixed_promotional_cents(business_yearly, discount),
            renews_at_cents=business_yearly,
            provider_slot="business_yearly_30",
            group=GROUP_BUSINESS_MONTHLY,
        ),
    ]


def build_offers_for_group(group: Optional[str], *, settings_obj=None) -> list[dict]:
    settings_obj = settings_obj or get_settings()
    if group == GROUP_NEW_BASIC:
        return _new_basic_offers(settings_obj.new_basic_mode)
    if group == GROUP_PLUS_MONTHLY and settings_obj.plus_monthly_enabled:
        return _plus_monthly_offers()
    if group == GROUP_BUSINESS_MONTHLY and settings_obj.business_monthly_enabled:
        return _business_monthly_offers()
    return []


def group_is_active(group: Optional[str], *, settings_obj=None) -> bool:
    settings_obj = settings_obj or get_settings()
    if group == GROUP_NEW_BASIC:
        return settings_obj.new_basic_mode != MODE_OFF
    if group == GROUP_PLUS_MONTHLY:
        return bool(settings_obj.plus_monthly_enabled)
    if group == GROUP_BUSINESS_MONTHLY:
        return bool(settings_obj.business_monthly_enabled)
    return False


def group_mode_value(group: Optional[str], *, settings_obj=None) -> Optional[str]:
    settings_obj = settings_obj or get_settings()
    if group == GROUP_NEW_BASIC:
        return settings_obj.new_basic_mode
    if group == GROUP_PLUS_MONTHLY:
        return "on" if settings_obj.plus_monthly_enabled else "off"
    if group == GROUP_BUSINESS_MONTHLY:
        return "on" if settings_obj.business_monthly_enabled else "off"
    return None


def promotion_payload_for_audience(
    audience: str = AUDIENCE_PUBLIC,
    *,
    settings_obj=None,
) -> dict:
    """Canonical promotion block for one audience."""
    settings_obj = settings_obj or get_settings()
    group = eligible_group_for_audience(audience)
    mode = group_mode_value(group, settings_obj=settings_obj)
    active = group_is_active(group, settings_obj=settings_obj)
    offers = build_offers_for_group(group, settings_obj=settings_obj) if active else []
    summaries = GROUP_SUMMARIES.get(group) or {}
    summary = summaries.get(mode or MODE_OFF, "") if group else "No promotional offer"
    any_checkout = any(bool(o.get("checkout_applies_promotion")) for o in offers)
    return {
        "audience": audience,
        "group": group,
        "eligible": group is not None,
        "active": bool(active and offers),
        "mode": mode,
        "label": GROUP_LABELS.get(group) if group else None,
        "summary": summary,
        "checkout_applies_promotion": any_checkout,
        "offers": offers,
    }


def interval_promotion_from_offers(
    offers: list[dict],
    *,
    plan_key: str,
    interval: str,
) -> dict:
    """Map an acquisition offer onto a catalog interval row (Group 1)."""
    match = None
    for offer in offers:
        if (
            offer.get("target_plan") == plan_key
            and offer.get("target_interval") == interval
            and offer.get("offer_type")
            in {OFFER_FIRST_PERIOD_PERCENTAGE, OFFER_FIRST_YEAR_PERCENTAGE}
            and offer.get("promotional_cents") is not None
        ):
            match = offer
            break
    if not match:
        normal = price_cents(plan_key, interval)
        return {
            "active": False,
            "offer_id": None,
            "discount_percent": None,
            "first_period_cents": None,
            "first_period_amount": None,
            "first_period_formatted": None,
            "applies_to": None,
            "discount_duration": "first_period",
            "discount_type": None,
            "discount_amount_cents": None,
            "discount_amount": None,
            "discount_amount_formatted": None,
            "renews_at_cents": normal,
            "renews_at_amount": cents_to_amount_string(normal),
            "renews_at_formatted": format_usd_cents(normal),
            "checkout_applies_promotion": False,
        }
    return {
        "active": True,
        "offer_id": match["id"],
        "discount_percent": match["discount_percent"],
        "marketing_discount_percent": match.get("marketing_discount_percent"),
        "first_period_cents": match["promotional_cents"],
        "first_period_amount": match["promotional_amount"],
        "first_period_formatted": match["promotional_formatted"],
        "applies_to": match["duration_label"],
        "discount_duration": "first_period",
        "discount_type": match.get("discount_type"),
        "discount_amount_cents": match.get("discount_amount_cents"),
        "discount_amount": match.get("discount_amount"),
        "discount_amount_formatted": match.get("discount_amount_formatted"),
        "renews_at_cents": match["renews_at_cents"],
        "renews_at_amount": match["renews_at_amount"],
        "renews_at_formatted": match["renews_at_formatted"],
        "checkout_applies_promotion": bool(match.get("checkout_applies_promotion")),
    }


def admin_groups_snapshot(*, settings_obj=None) -> list[dict]:
    """Admin card payloads for the three V1 promotion groups."""
    settings_obj = settings_obj or get_settings()
    return [
        {
            "group": GROUP_NEW_BASIC,
            "label": GROUP_LABELS[GROUP_NEW_BASIC],
            "control": "mode",
            "value": settings_obj.new_basic_mode,
            "choices": [
                {
                    "value": MODE_OFF,
                    "label": "OFF",
                    "summary": GROUP_SUMMARIES[GROUP_NEW_BASIC][MODE_OFF],
                },
                {
                    "value": MODE_NORMAL,
                    "label": "NORMAL",
                    "summary": GROUP_SUMMARIES[GROUP_NEW_BASIC][MODE_NORMAL],
                },
                {
                    "value": MODE_BIG,
                    "label": "BIG",
                    "summary": GROUP_SUMMARIES[GROUP_NEW_BASIC][MODE_BIG],
                },
            ],
            "summary": GROUP_SUMMARIES[GROUP_NEW_BASIC][settings_obj.new_basic_mode],
        },
        {
            "group": GROUP_PLUS_MONTHLY,
            "label": GROUP_LABELS[GROUP_PLUS_MONTHLY],
            "control": "toggle",
            "value": "on" if settings_obj.plus_monthly_enabled else "off",
            "choices": [
                {
                    "value": "off",
                    "label": "OFF",
                    "summary": GROUP_SUMMARIES[GROUP_PLUS_MONTHLY]["off"],
                },
                {
                    "value": "on",
                    "label": "ON",
                    "summary": GROUP_SUMMARIES[GROUP_PLUS_MONTHLY]["on"],
                },
            ],
            "summary": GROUP_SUMMARIES[GROUP_PLUS_MONTHLY][
                "on" if settings_obj.plus_monthly_enabled else "off"
            ],
        },
        {
            "group": GROUP_BUSINESS_MONTHLY,
            "label": GROUP_LABELS[GROUP_BUSINESS_MONTHLY],
            "control": "toggle",
            "value": "on" if settings_obj.business_monthly_enabled else "off",
            "choices": [
                {
                    "value": "off",
                    "label": "OFF",
                    "summary": GROUP_SUMMARIES[GROUP_BUSINESS_MONTHLY]["off"],
                },
                {
                    "value": "on",
                    "label": "ON",
                    "summary": GROUP_SUMMARIES[GROUP_BUSINESS_MONTHLY]["on"],
                },
            ],
            "summary": GROUP_SUMMARIES[GROUP_BUSINESS_MONTHLY][
                "on" if settings_obj.business_monthly_enabled else "off"
            ],
        },
    ]


@transaction.atomic
def set_group_value(
    group: str,
    value: str,
    *,
    actor=None,
) -> tuple[PlatformPromotionSettings, bool]:
    """Set one promotion group. Returns (settings, changed)."""
    settings_obj = get_settings()
    value = (value or "").strip().lower()

    if group == GROUP_NEW_BASIC:
        if value not in NewBasicPromotionMode.values:
            raise ValueError(f"Invalid New/Basic mode: {value}")
        old = settings_obj.new_basic_mode
        if old == value:
            return settings_obj, False
        settings_obj.new_basic_mode = value
        field = "new_basic_mode"
    elif group == GROUP_PLUS_MONTHLY:
        if value not in {"off", "on"}:
            raise ValueError("Plus Monthly value must be off or on")
        old = "on" if settings_obj.plus_monthly_enabled else "off"
        if old == value:
            return settings_obj, False
        settings_obj.plus_monthly_enabled = value == "on"
        field = "plus_monthly_enabled"
    elif group == GROUP_BUSINESS_MONTHLY:
        if value not in {"off", "on"}:
            raise ValueError("Business Monthly value must be off or on")
        old = "on" if settings_obj.business_monthly_enabled else "off"
        if old == value:
            return settings_obj, False
        settings_obj.business_monthly_enabled = value == "on"
        field = "business_monthly_enabled"
    else:
        raise ValueError(f"Unknown promotion group: {group}")

    settings_obj.changed_by = actor
    settings_obj.save(update_fields=[field, "changed_by", "updated_at"])
    PlatformPromotionModeChange.objects.create(
        group=group,
        old_value=old,
        new_value=value,
        changed_by=actor,
    )
    return settings_obj, True


# --- Compatibility aliases used during refactor (prefer set_group_value) ---

def set_promotion_mode(mode: str, *, actor=None):
    """Deprecated alias: maps legacy mode names onto Group 1."""
    mapping = {
        "off": MODE_OFF,
        "normal": MODE_NORMAL,
        "big": MODE_BIG,
        "normal_discount": MODE_NORMAL,
        "big_discount": MODE_BIG,
    }
    return set_group_value(
        GROUP_NEW_BASIC,
        mapping.get(mode, mode),
        actor=actor,
    )
