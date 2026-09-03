"""Optional server-side document metadata for basic SEO. Fail open."""

import json
import urllib.error
import urllib.request
from html import escape

SUPPORTED_LOCALES = ("en", "ja")

KNOWN_SLUGS = {
    "/": "documentation",
    "/documentation": "documentation",
    "/getting-started": "getting-started",
    "/groups-members": "groups-members",
    "/kiosk-setup": "kiosk-setup",
    "/billing-plans": "billing-plans",
    "/faq": "faq",
    "/support": "support",
    "/privacy-policy": "privacy-policy",
    "/terms-of-use": "terms-of-use",
}

DOCUMENT_SLUGS = frozenset(KNOWN_SLUGS.values())

DEFAULT_TITLE = "CheckStation Docs"
DEFAULT_DESCRIPTION = (
    "Public documentation and legal information for the Check Station platform."
)


def split_locale_path(path):
    normalized = path.rstrip("/") or "/"
    parts = normalized.split("/")
    if len(parts) >= 2 and parts[1] in SUPPORTED_LOCALES:
        locale = parts[1]
        rest = "/" + "/".join(parts[2:]) if len(parts) > 2 else "/"
        return locale, rest
    return "en", normalized


def slug_for_path(path):
    _locale, rest = split_locale_path(path)
    normalized = rest.rstrip("/") or "/"
    if normalized in KNOWN_SLUGS:
        return KNOWN_SLUGS[normalized]
    return None


def is_valid_docs_html_path(path):
    """Return True when the path should serve the Docs SPA shell (HTTP 200)."""
    normalized = (path or "/").rstrip("/") or "/"
    parts = [part for part in normalized.split("/") if part]
    if not parts:
        return True
    if parts[0] in SUPPORTED_LOCALES:
        if len(parts) == 1:
            return True
        return len(parts) == 2 and parts[1] in DOCUMENT_SLUGS
    if len(parts) == 1 and f"/{parts[0]}" in KNOWN_SLUGS:
        return True
    return False


def canonical_for_path(public_url, path):
    base = (public_url or "").rstrip("/")
    if not base:
        return ""
    locale, rest = split_locale_path(path)
    slug = slug_for_path(path)
    if slug in {None, "documentation"}:
        return f"{base}/{locale}/"
    return f"{base}/{locale}/{slug}"


def alternate_urls_for_slug(public_url, slug):
    base = (public_url or "").rstrip("/")
    if not base:
        return []
    alternates = []
    for lang in SUPPORTED_LOCALES:
        if slug in {None, "documentation"}:
            href = f"{base}/{lang}/"
        else:
            href = f"{base}/{lang}/{slug}"
        alternates.append({"language": lang, "href": href})
    return alternates


def hreflang_html(alternate_urls):
    parts = []
    for alternate in alternate_urls or []:
        language = alternate.get("language")
        href = alternate.get("href")
        if not language or not href:
            continue
        parts.append(
            f'<link rel="alternate" hreflang="{escape(language, quote=True)}" '
            f'href="{escape(href, quote=True)}" />'
        )
    return "\n    ".join(parts)


def _fetch_json(url, timeout=2):
    # X-Forwarded-Proto avoids SECURE_SSL_REDIRECT on internal HTTP backends.
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "CheckStation-Docs/1.0",
            "X-Forwarded-Proto": "https",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.getcode() != 200:
                return None
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeError, ValueError):
        return None
    return payload if isinstance(payload, dict) else None


def fetch_document(internal_api_url, slug, locale="en", timeout=2):
    if not internal_api_url or not slug:
        return None
    lang = locale if locale in SUPPORTED_LOCALES else "en"
    url = (
        f"{internal_api_url.rstrip('/')}/api/content/documents/{slug}/"
        f"?lang={lang}"
    )
    payload = _fetch_json(url, timeout=timeout)
    if not payload or not payload.get("title"):
        return None
    return payload


def fetch_faq(internal_api_url, locale="en", timeout=2):
    if not internal_api_url:
        return None
    lang = locale if locale in SUPPORTED_LOCALES else "en"
    url = f"{internal_api_url.rstrip('/')}/api/content/faq/?lang={lang}"
    return _fetch_json(url, timeout=timeout)


def faq_crawl_html(config, path):
    """Noscript FAQ copy so published questions remain crawlable on /faq."""
    if slug_for_path(path) != "faq":
        return ""
    locale, _rest = split_locale_path(path)
    payload = fetch_faq(config.get("internal_api_url"), locale=locale)
    entries = (payload or {}).get("entries") or []
    if not entries:
        return ""
    parts = ['<noscript class="faq-crawl"><h2>FAQ</h2>']
    for entry in entries:
        question = escape(str(entry.get("question") or ""))
        answer = escape(str(entry.get("answer_markdown") or ""))
        if not question:
            continue
        parts.append(f"<h3>{question}</h3><p>{answer}</p>")
    parts.append("</noscript>")
    return "".join(parts)


def page_meta(config, path):
    locale, _rest = split_locale_path(path)
    slug = slug_for_path(path)
    document = fetch_document(config.get("internal_api_url"), slug, locale=locale)
    canonical = canonical_for_path(config.get("public_url"), path)
    alternates = alternate_urls_for_slug(config.get("public_url"), slug)
    if document:
        title = document.get("title") or DEFAULT_TITLE
        if slug != "documentation":
            title = f"{title} · CheckStation Docs"
        else:
            title = "CheckStation Docs"
        description = document.get("description") or DEFAULT_DESCRIPTION
        canonical = document.get("canonical_url") or canonical
        alternates = document.get("alternate_urls") or alternates
        return {
            "title": title,
            "description": description,
            "canonical": canonical,
            "hreflang": hreflang_html(alternates),
            "locale": locale,
        }
    return {
        "title": DEFAULT_TITLE,
        "description": DEFAULT_DESCRIPTION,
        "canonical": canonical,
        "hreflang": hreflang_html(alternates),
        "locale": locale,
    }
