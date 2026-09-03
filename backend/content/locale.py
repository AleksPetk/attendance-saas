"""Content locale helpers — separate from workspace UI i18n."""

SUPPORTED_CONTENT_LOCALES = ("en", "ja")
DEFAULT_CONTENT_LOCALE = "en"


def normalize_content_locale(value):
    raw = str(value or "").strip().lower().replace("_", "-")
    if not raw:
        return DEFAULT_CONTENT_LOCALE
    primary = raw.split("-", 1)[0]
    if primary in SUPPORTED_CONTENT_LOCALES:
        return primary
    return DEFAULT_CONTENT_LOCALE


def resolve_content_locale(request, *, explicit=None):
    """
    Resolve requested content locale for public APIs.

    Priority:
    1. explicit argument (?lang= or caller-provided workspace locale)
    2. Accept-Language header (first supported tag)
    3. English fallback
    """
    if explicit is not None and str(explicit).strip():
        return normalize_content_locale(explicit)

    query_lang = ""
    if request is not None:
        query_lang = str(getattr(request, "query_params", {}).get("lang") or "").strip()
        if not query_lang and hasattr(request, "GET"):
            query_lang = str(request.GET.get("lang") or "").strip()
    if query_lang:
        return normalize_content_locale(query_lang)

    if request is not None:
        header = ""
        if hasattr(request, "headers"):
            header = request.headers.get("Accept-Language", "")
        elif hasattr(request, "META"):
            header = request.META.get("HTTP_ACCEPT_LANGUAGE", "")
        for part in str(header or "").split(","):
            tag = part.split(";", 1)[0].strip()
            if tag:
                normalized = normalize_content_locale(tag)
                if normalized in SUPPORTED_CONTENT_LOCALES:
                    return normalized

    return DEFAULT_CONTENT_LOCALE


def content_html_lang(locale):
    normalized = normalize_content_locale(locale)
    return "ja" if normalized == "ja" else "en"
