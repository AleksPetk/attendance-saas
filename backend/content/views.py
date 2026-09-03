from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from content.catalog_text import public_catalog_payload
from content.locale import DEFAULT_CONTENT_LOCALE, normalize_content_locale, resolve_content_locale
from content.public import (
    document_summary,
    faq_categories_payload,
    public_queryset,
    resolve_document,
    resolve_faq_entries,
)
from content.placeholders import apply_placeholders


def _docs_public_url():
    from django.conf import settings

    return (getattr(settings, "DOCS_PUBLIC_URL", "") or "").strip().rstrip("/")


def _canonical_url(slug, locale):
    base = _docs_public_url()
    if not base:
        return None
    lang = normalize_content_locale(locale)
    if slug in {"", "documentation"}:
        return f"{base}/{lang}/"
    return f"{base}/{lang}/{slug}"


def _alternate_urls(slug):
    base = _docs_public_url()
    if not base:
        return []
    alternates = []
    for lang in ("en", "ja"):
        if slug in {"", "documentation"}:
            href = f"{base}/{lang}/"
        else:
            href = f"{base}/{lang}/{slug}"
        alternates.append({"language": lang, "href": href})
    return alternates


def _cache_headers(document=None):
    headers = {
        "Cache-Control": "public, max-age=60, must-revalidate",
    }
    if document is not None:
        token = f"{document.slug}-{document.language}-{document.version}-{document.updated_at.isoformat()}"
        headers["ETag"] = f'W/"{token}"'
    return headers


class PublicDocumentListView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        locale = resolve_content_locale(request)
        documents = [
            document_summary(item, locale=locale)
            for item in public_queryset(locale)
        ]
        if not documents and locale != DEFAULT_CONTENT_LOCALE:
            documents = [
                document_summary(item, locale=DEFAULT_CONTENT_LOCALE, fallback=True)
                for item in public_queryset(DEFAULT_CONTENT_LOCALE)
            ]
        payload = {
            "generated_at": timezone.now()
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
            "language": locale,
            "documents": documents,
        }
        response = Response(payload)
        for name, value in _cache_headers().items():
            response[name] = value
        return response


class PublicDocumentDetailView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request, slug):
        locale = resolve_content_locale(request)
        document, fallback = resolve_document(slug, locale)
        if document is None:
            return Response({"detail": "Not found."}, status=404)
        payload = document_summary(document, locale=locale, fallback=fallback)
        payload["body_markdown"] = apply_placeholders(document.body_markdown)
        payload["canonical_url"] = _canonical_url(document.slug, document.language)
        payload["alternate_urls"] = _alternate_urls(document.slug)
        response = Response(payload)
        for name, value in _cache_headers(document).items():
            response[name] = value
        return response


class PublicCatalogView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        payload = public_catalog_payload()
        payload["generated_at"] = (
            timezone.now().replace(microsecond=0).isoformat().replace("+00:00", "Z")
        )
        response = Response(payload)
        for name, value in _cache_headers().items():
            response[name] = value
        return response


class PublicFaqListView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        locale = resolve_content_locale(request)
        category = str(request.query_params.get("category") or "").strip()
        query = str(request.query_params.get("q") or "")
        entries, resolved_locale = resolve_faq_entries(
            locale=locale,
            category=category,
            query=query,
        )
        payload = {
            "generated_at": timezone.now()
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
            "language": resolved_locale,
            "categories": faq_categories_payload(resolved_locale),
            "entries": entries,
        }
        response = Response(payload)
        for name, value in _cache_headers().items():
            response[name] = value
        return response
