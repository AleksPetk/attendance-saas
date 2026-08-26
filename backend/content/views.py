from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from content.catalog_text import public_catalog_payload
from content.faq_search import filter_faq_entries
from content.placeholders import apply_placeholders
from content.public import (
    document_summary,
    faq_categories_payload,
    faq_entry_payload,
    public_faq_queryset,
    public_queryset,
)


def _docs_public_url():
    from django.conf import settings

    return (getattr(settings, "DOCS_PUBLIC_URL", "") or "").strip().rstrip("/")


def _canonical_url(slug):
    base = _docs_public_url()
    if not base:
        return None
    if slug in {"", "documentation"}:
        return f"{base}/"
    return f"{base}/{slug}"


def _cache_headers(document=None):
    headers = {
        "Cache-Control": "public, max-age=60, must-revalidate",
    }
    if document is not None:
        token = f"{document.slug}-{document.version}-{document.updated_at.isoformat()}"
        headers["ETag"] = f'W/"{token}"'
    return headers


class PublicDocumentListView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        documents = [document_summary(item) for item in public_queryset()]
        payload = {
            "generated_at": timezone.now()
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
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
        document = public_queryset().filter(slug=slug).first()
        if document is None:
            return Response({"detail": "Not found."}, status=404)
        payload = document_summary(document)
        payload["body_markdown"] = apply_placeholders(document.body_markdown)
        payload["canonical_url"] = _canonical_url(document.slug)
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
        category = str(request.query_params.get("category") or "").strip()
        query = str(request.query_params.get("q") or "")
        rows = public_faq_queryset()
        if category:
            rows = rows.filter(category=category)
        entries = [faq_entry_payload(item) for item in rows]
        if query.strip():
            entries = filter_faq_entries(entries, query)
        payload = {
            "generated_at": timezone.now()
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
            "categories": faq_categories_payload(),
            "entries": entries,
        }
        response = Response(payload)
        for name, value in _cache_headers().items():
            response[name] = value
        return response
