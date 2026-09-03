"""Market-aware display-only promotional copy for pricing clients."""

from billing.markets import MARKET_GLOBAL, MARKET_JP, normalize_billing_market
from core.models import (
    PlatformPromotionalTextSettings,
    PromotionalTextMarketMode,
    PromotionalTextStyle,
)


DEFAULT_PROMOTIONAL_TEXT_STYLE = PromotionalTextStyle.NORMAL


def normalize_promotional_text_style(value) -> str:
    candidate = str(value or "").strip().lower()
    if candidate in PromotionalTextStyle.values:
        return candidate
    return DEFAULT_PROMOTIONAL_TEXT_STYLE


def get_promotional_display_for_market(market, *, settings_obj=None) -> dict:
    """Return presentation data only for one authoritative billing market."""
    settings_obj = settings_obj or PlatformPromotionalTextSettings.load()
    market = normalize_billing_market(market)
    mode = str(
        getattr(settings_obj, "mode", PromotionalTextMarketMode.TOGETHER)
        or PromotionalTextMarketMode.TOGETHER
    ).strip().lower()
    if mode == PromotionalTextMarketMode.SEPARATE:
        prefix = "jp" if market == MARKET_JP else "global"
        enabled = getattr(settings_obj, f"{prefix}_enabled", False)
        text = getattr(settings_obj, f"{prefix}_text", "")
        text_style = getattr(
            settings_obj,
            f"{prefix}_text_style",
            DEFAULT_PROMOTIONAL_TEXT_STYLE,
        )
    else:
        enabled = settings_obj.enabled
        text = settings_obj.text
        text_style = settings_obj.text_style

    style_key = normalize_promotional_text_style(
        text_style
    )
    labels = dict(PromotionalTextStyle.choices)
    return {
        "enabled": bool(enabled),
        "text": str(text or ""),
        "style": {
            "key": style_key,
            "display_name": labels.get(
                style_key,
                labels[DEFAULT_PROMOTIONAL_TEXT_STYLE],
            ),
        },
    }


def promotional_text_payload(*, settings_obj=None, market=MARKET_GLOBAL) -> dict:
    """Backward-compatible payload; callers may now select the billing market."""
    return get_promotional_display_for_market(
        market,
        settings_obj=settings_obj,
    )
