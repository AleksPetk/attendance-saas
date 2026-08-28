"""Display-only promotional copy shared by pricing clients."""

from core.models import PlatformPromotionalTextSettings, PromotionalTextStyle


DEFAULT_PROMOTIONAL_TEXT_STYLE = PromotionalTextStyle.NORMAL


def normalize_promotional_text_style(value) -> str:
    candidate = str(value or "").strip().lower()
    if candidate in PromotionalTextStyle.values:
        return candidate
    return DEFAULT_PROMOTIONAL_TEXT_STYLE


def promotional_text_payload(*, settings_obj=None) -> dict:
    settings_obj = settings_obj or PlatformPromotionalTextSettings.load()
    style_key = normalize_promotional_text_style(
        getattr(settings_obj, "text_style", DEFAULT_PROMOTIONAL_TEXT_STYLE)
    )
    labels = dict(PromotionalTextStyle.choices)
    return {
        "enabled": bool(settings_obj.enabled),
        "text": str(settings_obj.text or ""),
        "style": {
            "key": style_key,
            "display_name": labels.get(
                style_key,
                labels[DEFAULT_PROMOTIONAL_TEXT_STYLE],
            ),
        },
    }
