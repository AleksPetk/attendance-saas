"""Status content locale helpers — independent from Workspace and Docs."""

SUPPORTED_LOCALES = ("en", "ja")
DEFAULT_LOCALE = "en"


def normalize_locale(value):
    raw = str(value or "").strip().lower().replace("_", "-")
    if not raw:
        return DEFAULT_LOCALE
    primary = raw.split("-", 1)[0]
    if primary in SUPPORTED_LOCALES:
        return primary
    return DEFAULT_LOCALE


def resolve_locale(*, query_lang=None, accept_language=None, path_locale=None):
    """
    Priority:
    1. explicit path locale
    2. ?lang=
    3. Accept-Language
    4. English fallback
    """
    if path_locale:
        return normalize_locale(path_locale)
    if query_lang and str(query_lang).strip():
        return normalize_locale(query_lang)
    for part in str(accept_language or "").split(","):
        tag = part.split(";", 1)[0].strip()
        if tag:
            normalized = normalize_locale(tag)
            if normalized in SUPPORTED_LOCALES:
                return normalized
    return DEFAULT_LOCALE


def html_lang(locale):
    return "ja" if normalize_locale(locale) == "ja" else "en"
