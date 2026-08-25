"""Map internal plan+interval to configured Stripe Price IDs.

Permanent USD amounts stay in billing.catalog. Do not infer plan from amount.
"""

from django.conf import settings

from billing.catalog import PAID_INTERVALS, PAID_PLAN_KEYS
from billing.exceptions import StripeConfigurationError

PRICE_ID_SETTINGS = {
    ("plus", "monthly"): "STRIPE_PRICE_PLUS_MONTHLY",
    ("plus", "yearly"): "STRIPE_PRICE_PLUS_YEARLY",
    ("business", "monthly"): "STRIPE_PRICE_BUSINESS_MONTHLY",
    ("business", "yearly"): "STRIPE_PRICE_BUSINESS_YEARLY",
}


def _setting(name: str) -> str:
    return str(getattr(settings, name, "") or "").strip()


def stripe_secret_key() -> str:
    return _setting("STRIPE_SECRET_KEY")


def stripe_webhook_secret() -> str:
    return _setting("STRIPE_WEBHOOK_SECRET")


def business_trial_days():
    raw = getattr(settings, "BUSINESS_TRIAL_DAYS", 0)
    try:
        days = int(raw or 0)
    except (TypeError, ValueError):
        return None
    if days <= 0:
        return None
    return days


def trial_is_configured() -> bool:
    return business_trial_days() is not None


def price_id_for(plan_key: str, interval: str) -> str:
    key = (str(plan_key or "").strip().lower(), str(interval or "").strip().lower())
    setting_name = PRICE_ID_SETTINGS.get(key)
    if not setting_name:
        raise StripeConfigurationError(
            f"No Stripe Price mapping for {plan_key}/{interval}.",
            code="stripe_price_unmapped",
        )
    price_id = _setting(setting_name)
    if not price_id:
        raise StripeConfigurationError(
            f"Stripe Price ID is not configured for {key[0]} {key[1]} "
            f"({setting_name}).",
            code="stripe_price_missing",
        )
    return price_id


def plan_interval_for_price_id(price_id: str):
    wanted = str(price_id or "").strip()
    if not wanted:
        return None
    for (plan_key, interval), setting_name in PRICE_ID_SETTINGS.items():
        if _setting(setting_name) == wanted:
            return plan_key, interval
    return None


def stripe_prices_configured() -> bool:
    try:
        for plan_key in PAID_PLAN_KEYS:
            for interval in PAID_INTERVALS:
                price_id_for(plan_key, interval)
    except StripeConfigurationError:
        return False
    return True


def stripe_api_configured() -> bool:
    return bool(stripe_secret_key()) and stripe_prices_configured()


def stripe_webhook_configured() -> bool:
    return bool(stripe_webhook_secret())


def require_stripe_api():
    if not stripe_secret_key():
        raise StripeConfigurationError("STRIPE_SECRET_KEY is not configured.")
    if not stripe_prices_configured():
        raise StripeConfigurationError(
            "Stripe Price IDs for Plus/Business monthly and yearly are not configured."
        )
