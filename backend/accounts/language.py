"""Owner UI language preference — not billing market or currency."""

from __future__ import annotations

SUPPORTED_LANGUAGES = frozenset({"en", "ja"})
DEFAULT_LANGUAGE = "en"


def normalize_language(value: str | None) -> str:
    """Map browser or stored variants to canonical app locale keys."""
    raw = str(value or "").strip().lower().replace("_", "-")
    if not raw:
        return DEFAULT_LANGUAGE
    primary = raw.split("-", 1)[0]
    if primary in SUPPORTED_LANGUAGES:
        return primary
    return DEFAULT_LANGUAGE
