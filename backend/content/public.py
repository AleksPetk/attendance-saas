from content.models import Document, FaqCategory, FaqEntry, NavGroup, PublicationStatus
from content.placeholders import apply_placeholders


NAV_GROUP_LABELS = {
    NavGroup.HOME: "Documentation",
    NavGroup.GETTING_STARTED: "Getting Started",
    NavGroup.USING: "Using CheckStation",
    NavGroup.LEGAL: "Legal",
    NavGroup.HELP: "Help",
}


def public_queryset():
    return Document.objects.filter(
        status=PublicationStatus.PUBLISHED,
        is_public=True,
    )


def document_summary(document):
    return {
        "id": document.slug,
        "slug": document.slug,
        "title": document.title,
        "document_type": document.document_type,
        "nav_group": document.nav_group,
        "nav_group_label": NAV_GROUP_LABELS.get(document.nav_group, document.nav_group),
        "description": document.description,
        "version": document.version,
        "updated_at": document.updated_at.isoformat().replace("+00:00", "Z")
        if document.updated_at
        else None,
        "effective_on": document.effective_on.isoformat() if document.effective_on else None,
        "sort_order": document.sort_order,
    }


def public_faq_queryset():
    return FaqEntry.objects.filter(
        status=PublicationStatus.PUBLISHED,
        is_public=True,
    )


def faq_iso(value):
    if not value:
        return None
    return value.isoformat().replace("+00:00", "Z")


def faq_entry_payload(entry):
    return {
        "id": entry.slug,
        "slug": entry.slug,
        "question": entry.question,
        "answer_markdown": apply_placeholders(entry.answer_markdown),
        "category": entry.category,
        "category_label": entry.get_category_display(),
        "keywords": entry.keyword_list(),
        "related_document_slug": entry.related_document_slug or None,
        "featured": entry.featured,
        "sort_order": entry.sort_order,
        "updated_at": faq_iso(entry.updated_at),
    }


def faq_categories_payload():
    used = set(public_faq_queryset().values_list("category", flat=True))
    categories = []
    for key, label in FaqCategory.choices:
        if key not in used:
            continue
        categories.append({"id": key, "label": label})
    return categories
