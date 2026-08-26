"""Substitute centralized legal placeholders. Never invent a company name."""

from django.conf import settings


PLACEHOLDERS = {
    "PRODUCT_NAME": {
        "setting": "PRODUCT_NAME",
        "fallback": "Check Station",
    },
    "LEGAL_OPERATOR_NAME": {
        "setting": "LEGAL_OPERATOR_NAME",
        "fallback": "the operator of the Check Station service",
    },
    "LEGAL_CONTACT_EMAIL": {
        "setting": "LEGAL_CONTACT_EMAIL",
        "fallback": (
            "contact@checkstation.alekspetk.com"
        ),
    },
    "LEGAL_GOVERNING_LAW": {
        "setting": "LEGAL_GOVERNING_LAW",
        "fallback": (
            "the laws applicable to the operator's principal place of business, "
            "which has not yet been designated"
        ),
    },
    "LEGAL_GOVERNING_VENUE": {
        "setting": "LEGAL_GOVERNING_VENUE",
        "fallback": (
            "the courts of competent jurisdiction for the operator's principal "
            "place of business, which has not yet been designated"
        ),
    },
}


def resolved_placeholder(key):
    spec = PLACEHOLDERS[key]
    value = str(getattr(settings, spec["setting"], "") or "").strip()
    return value or spec["fallback"]


def apply_placeholders(text):
    from content.catalog_text import catalog_placeholder_map

    result = text or ""
    for key in PLACEHOLDERS:
        result = result.replace("{{" + key + "}}", resolved_placeholder(key))
    for key, value in catalog_placeholder_map().items():
        result = result.replace("{{" + key + "}}", str(value))
    return result
