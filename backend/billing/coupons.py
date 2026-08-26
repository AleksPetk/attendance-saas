"""Stripe coupon config slots for simple promotion offers.

Coupon IDs come from environment only. They must never appear in public
catalog/API payloads. Backend eligibility decides which slot (if any) may
apply; Stripe remains the source of truth for the discounted amount.

Plus Monthly → Business Yearly and Business Monthly → Business Yearly share
``STRIPE_COUPON_BUSINESS_MONTHLY_TO_YEARLY`` ($45 off first year). Audience
eligibility is enforced in ``resolve_schedule_coupon``.
"""

from __future__ import annotations

from typing import Optional

from django.conf import settings

from billing.catalog import INTERVAL_MONTHLY, INTERVAL_YEARLY, PLAN_BUSINESS, PLAN_PLUS
from billing.exceptions import StripeConfigurationError
from billing.promotion import (
    AUDIENCE_BASIC,
    AUDIENCE_BUSINESS_MONTHLY,
    AUDIENCE_PLUS_MONTHLY,
    AUDIENCE_PUBLIC,
    GROUP_BUSINESS_MONTHLY,
    GROUP_NEW_BASIC,
    GROUP_PLUS_MONTHLY,
    MODE_BIG,
    MODE_NORMAL,
    MODE_OFF,
    get_settings,
    group_is_active,
    resolve_audience,
)

# Env setting name for each commercial slot (10 simple coupons).
ACQUISITION_COUPON_SETTINGS = {
    (MODE_NORMAL, PLAN_PLUS, INTERVAL_MONTHLY): "STRIPE_COUPON_ACQ_NORMAL_PLUS_MONTHLY",
    (MODE_NORMAL, PLAN_BUSINESS, INTERVAL_MONTHLY): (
        "STRIPE_COUPON_ACQ_NORMAL_BUSINESS_MONTHLY"
    ),
    (MODE_NORMAL, PLAN_PLUS, INTERVAL_YEARLY): "STRIPE_COUPON_ACQ_NORMAL_PLUS_YEARLY",
    (MODE_NORMAL, PLAN_BUSINESS, INTERVAL_YEARLY): (
        "STRIPE_COUPON_ACQ_NORMAL_BUSINESS_YEARLY"
    ),
    (MODE_BIG, PLAN_PLUS, INTERVAL_MONTHLY): "STRIPE_COUPON_ACQ_BIG_PLUS_MONTHLY",
    (MODE_BIG, PLAN_BUSINESS, INTERVAL_MONTHLY): "STRIPE_COUPON_ACQ_BIG_BUSINESS_MONTHLY",
    (MODE_BIG, PLAN_PLUS, INTERVAL_YEARLY): "STRIPE_COUPON_ACQ_BIG_PLUS_YEARLY",
    (MODE_BIG, PLAN_BUSINESS, INTERVAL_YEARLY): "STRIPE_COUPON_ACQ_BIG_BUSINESS_YEARLY",
}

RETENTION_COUPON_SETTINGS = {
    # Group 2 Plus Monthly → Plus Yearly ($30 off)
    "plus_yearly_30": "STRIPE_COUPON_PLUS_MONTHLY_TO_PLUS_YEARLY",
    # Shared Business Yearly $45 off (Group 2 and Group 4)
    "business_yearly_30": "STRIPE_COUPON_BUSINESS_MONTHLY_TO_YEARLY",
}

ALL_COUPON_SETTING_NAMES = (
    tuple(ACQUISITION_COUPON_SETTINGS.values())
    + tuple(RETENTION_COUPON_SETTINGS.values())
)


def _setting(name: str) -> str:
    return str(getattr(settings, name, "") or "").strip()


def coupon_id_for_setting(setting_name: str) -> str:
    return _setting(setting_name)


def coupon_configured(setting_name: str) -> bool:
    return bool(coupon_id_for_setting(setting_name))


def acquisition_setting_name(mode: str, plan_key: str, interval: str) -> Optional[str]:
    return ACQUISITION_COUPON_SETTINGS.get(
        (
            str(mode or "").strip().lower(),
            str(plan_key or "").strip().lower(),
            str(interval or "").strip().lower(),
        )
    )


def retention_setting_name(slot_key: str) -> Optional[str]:
    return RETENTION_COUPON_SETTINGS.get(str(slot_key or "").strip())


def offer_slot_has_coupon(group: str, provider_slot: str) -> bool:
    """Whether the env coupon for this commercial slot is configured."""
    group = str(group or "").strip()
    slot = str(provider_slot or "").strip()
    if not group or not slot:
        return False
    if group == GROUP_NEW_BASIC:
        parts = slot.split(".")
        if len(parts) != 3:
            return False
        mode, plan, interval = parts
        setting_name = acquisition_setting_name(mode, plan, interval)
        return bool(setting_name and coupon_configured(setting_name))
    setting_name = retention_setting_name(slot)
    return bool(setting_name and coupon_configured(setting_name))


def require_coupon_id(setting_name: str, *, context: str) -> str:
    coupon_id = coupon_id_for_setting(setting_name)
    if not coupon_id:
        raise StripeConfigurationError(
            (
                f"Promotion requires Stripe coupon {setting_name}, but it is "
                f"not configured ({context})."
            ),
            code="stripe_coupon_missing",
        )
    return coupon_id


def resolve_checkout_coupon(
    *,
    organization,
    plan_key: str,
    interval: str,
) -> tuple[Optional[str], Optional[str]]:
    """Resolve coupon for new Checkout (Group 1 acquisition only).

    Returns (coupon_id, setting_name). Both None when no promotion applies.
    Raises StripeConfigurationError when promotion is active but coupon env
    is missing.
    """
    audience = resolve_audience(organization=organization)
    if audience not in {AUDIENCE_PUBLIC, AUDIENCE_BASIC}:
        return None, None

    promo_settings = get_settings()
    mode = promo_settings.new_basic_mode
    if mode == MODE_OFF:
        return None, None
    if mode not in {MODE_NORMAL, MODE_BIG}:
        return None, None

    plan = str(plan_key or "").strip().lower()
    interval_key = str(interval or "").strip().lower()
    setting_name = acquisition_setting_name(mode, plan, interval_key)
    if not setting_name:
        # Wrong plan/interval for acquisition — do not invent a coupon.
        return None, None

    coupon_id = require_coupon_id(
        setting_name,
        context=f"Group 1 {mode} checkout {plan}/{interval_key}",
    )
    return coupon_id, setting_name


def resolve_schedule_coupon(
    *,
    organization,
    target_plan: str,
    target_interval: str,
) -> tuple[Optional[str], Optional[str]]:
    """Resolve coupon for period-end schedule changes (Groups 2 and 3).

    Active mapped offers with missing env fail closed.
    """
    audience = resolve_audience(organization=organization)
    plan = str(target_plan or "").strip().lower()
    interval = str(target_interval or "").strip().lower()
    promo_settings = get_settings()

    if audience == AUDIENCE_PLUS_MONTHLY and group_is_active(
        GROUP_PLUS_MONTHLY, settings_obj=promo_settings
    ):
        if plan == PLAN_PLUS and interval == INTERVAL_YEARLY:
            setting_name = retention_setting_name("plus_yearly_30")
            return (
                require_coupon_id(
                    setting_name,
                    context="Group 2 Plus Monthly → Plus Yearly",
                ),
                setting_name,
            )
        if plan == PLAN_BUSINESS and interval == INTERVAL_YEARLY:
            # Same $45 Business Yearly coupon as Group 3 (Business Monthly).
            setting_name = retention_setting_name("business_yearly_30")
            return (
                require_coupon_id(
                    setting_name,
                    context="Group 2 Plus Monthly → Business Yearly",
                ),
                setting_name,
            )
        return None, None

    if audience == AUDIENCE_BUSINESS_MONTHLY and group_is_active(
        GROUP_BUSINESS_MONTHLY, settings_obj=promo_settings
    ):
        if plan == PLAN_BUSINESS and interval == INTERVAL_YEARLY:
            setting_name = retention_setting_name("business_yearly_30")
            return (
                require_coupon_id(
                    setting_name,
                    context="Group 3 Business Monthly → Business Yearly",
                ),
                setting_name,
            )
        return None, None

    return None, None
