"""Optional server-side document metadata for basic SEO. Fail open."""

import json
import urllib.error
import urllib.request
from html import escape

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

DEFAULT_TITLE = "CheckStation Docs"
DEFAULT_DESCRIPTION = (
    "Public documentation and legal information for the Check Station platform."
)


def slug_for_path(path):
    normalized = path.rstrip("/") or "/"
    if normalized in KNOWN_SLUGS:
        return KNOWN_SLUGS[normalized]
    if normalized.startswith("/") and normalized.count("/") == 1:
        candidate = normalized.lstrip("/")
        if candidate:
            return candidate
    return None


def canonical_for_path(public_url, path):
    base = (public_url or "").rstrip("/")
    if not base:
        return ""
    slug = slug_for_path(path)
    if slug in {None, "documentation"}:
        return f"{base}/"
    return f"{base}/{slug}"


def _fetch_json(url, timeout=2):
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "CheckStation-Docs/1.0",
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


def fetch_document(internal_api_url, slug, timeout=2):
    if not internal_api_url or not slug:
        return None
    url = f"{internal_api_url.rstrip('/')}/api/content/documents/{slug}/"
    payload = _fetch_json(url, timeout=timeout)
    if not payload or not payload.get("title"):
        return None
    return payload


def fetch_faq(internal_api_url, timeout=2):
    if not internal_api_url:
        return None
    url = f"{internal_api_url.rstrip('/')}/api/content/faq/"
    return _fetch_json(url, timeout=timeout)


def faq_crawl_html(config, path):
    """Noscript FAQ copy so published questions remain crawlable on /faq."""
    if slug_for_path(path) != "faq":
        return ""
    payload = fetch_faq(config.get("internal_api_url"))
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
    slug = slug_for_path(path)
    document = fetch_document(config.get("internal_api_url"), slug)
    canonical = canonical_for_path(config.get("public_url"), path)
    if document:
        title = document.get("title") or DEFAULT_TITLE
        if slug != "documentation":
            title = f"{title} · CheckStation Docs"
        else:
            title = "CheckStation Docs"
        description = document.get("description") or DEFAULT_DESCRIPTION
        canonical = document.get("canonical_url") or canonical
        return {
            "title": title,
            "description": description,
            "canonical": canonical,
        }
    return {
        "title": DEFAULT_TITLE,
        "description": DEFAULT_DESCRIPTION,
        "canonical": canonical,
    }
