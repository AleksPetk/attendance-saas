"""Presentation-only pricing card template selection."""

from core.models import PlatformPricingTemplateSettings, PricingCardTemplate


DEFAULT_PRICING_TEMPLATE = PricingCardTemplate.NORMAL


def normalize_pricing_template(value) -> str:
    candidate = str(value or "").strip().lower()
    if candidate in PricingCardTemplate.values:
        return candidate
    return DEFAULT_PRICING_TEMPLATE


def pricing_template_payload(*, settings_obj=None) -> dict:
    settings_obj = settings_obj or PlatformPricingTemplateSettings.load()
    key = normalize_pricing_template(settings_obj.active_template)
    labels = dict(PricingCardTemplate.choices)
    return {
        "key": key,
        "display_name": labels.get(key, labels[DEFAULT_PRICING_TEMPLATE]),
    }


def set_pricing_template(value, *, actor=None):
    candidate = str(value or "").strip().lower()
    if candidate not in PricingCardTemplate.values:
        raise ValueError("Unknown pricing card template.")
    settings_obj = PlatformPricingTemplateSettings.load()
    changed = settings_obj.active_template != candidate
    if changed:
        settings_obj.active_template = candidate
        settings_obj.changed_by = actor
        settings_obj.save(update_fields=["active_template", "changed_by", "updated_at"])
    return settings_obj, changed
