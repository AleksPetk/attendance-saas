import logging

from content.locale import DEFAULT_CONTENT_LOCALE, normalize_content_locale
from content.models import Document, FaqCategory, FaqEntry, NavGroup, PublicationStatus
from content.placeholders import apply_placeholders

logger = logging.getLogger(__name__)

NAV_GROUP_LABELS = {
    "en": {
        NavGroup.HOME: "Documentation",
        NavGroup.GETTING_STARTED: "Getting Started",
        NavGroup.USING: "Using CheckStation",
        NavGroup.LEGAL: "Legal",
        NavGroup.HELP: "Help",
    },
    "ja": {
        NavGroup.HOME: "ドキュメント",
        NavGroup.GETTING_STARTED: "はじめに",
        NavGroup.USING: "CheckStation の使い方",
        NavGroup.LEGAL: "法的情報",
        NavGroup.HELP: "ヘルプ",
    },
}

FAQ_CATEGORY_LABELS = {
    "en": {key: label for key, label in FaqCategory.choices},
    "ja": {
        FaqCategory.GETTING_STARTED: "はじめに",
        FaqCategory.ACCOUNT_SECURITY: "アカウントとセキュリティ",
        FaqCategory.MEMBERS_GROUPS: "メンバーとグループ",
        FaqCategory.KIOSK: "キオスク",
        FaqCategory.ATTENDANCE: "出席と履歴",
        FaqCategory.EMAIL: "メールと通知",
        FaqCategory.STAFF: "スタッフと権限",
        FaqCategory.PLANS: "プランと請求",
        FaqCategory.SUBSCRIPTION_CHANGES: "サブスクリプション変更",
        FaqCategory.TROUBLESHOOTING: "トラブルシューティング",
        FaqCategory.PRIVACY: "プライバシーとデータ",
        FaqCategory.GENERAL: "一般",
    },
}


def _labels_for_locale(locale):
    normalized = normalize_content_locale(locale)
    return NAV_GROUP_LABELS.get(normalized, NAV_GROUP_LABELS[DEFAULT_CONTENT_LOCALE])


def _faq_labels_for_locale(locale):
    normalized = normalize_content_locale(locale)
    return FAQ_CATEGORY_LABELS.get(normalized, FAQ_CATEGORY_LABELS[DEFAULT_CONTENT_LOCALE])


def public_queryset(locale=None):
    qs = Document.objects.filter(
        status=PublicationStatus.PUBLISHED,
        is_public=True,
    )
    if locale:
        qs = qs.filter(language=normalize_content_locale(locale))
    return qs


def public_faq_queryset(locale=None):
    qs = FaqEntry.objects.filter(
        status=PublicationStatus.PUBLISHED,
        is_public=True,
    )
    if locale:
        qs = qs.filter(language=normalize_content_locale(locale))
    return qs


def resolve_document(slug, locale):
    normalized = normalize_content_locale(locale)
    document = public_queryset(normalized).filter(slug=slug).first()
    fallback = False
    if document is None and normalized != DEFAULT_CONTENT_LOCALE:
        document = public_queryset(DEFAULT_CONTENT_LOCALE).filter(slug=slug).first()
        fallback = document is not None
        if fallback:
            logger.warning(
                "content.fallback document slug=%s requested=%s using=%s",
                slug,
                normalized,
                DEFAULT_CONTENT_LOCALE,
            )
    return document, fallback


def document_summary(document, *, locale=None, fallback=False):
    labels = _labels_for_locale(locale or document.language)
    return {
        "id": document.slug,
        "slug": document.slug,
        "language": document.language,
        "title": document.title,
        "document_type": document.document_type,
        "nav_group": document.nav_group,
        "nav_group_label": labels.get(document.nav_group, document.nav_group),
        "description": document.description,
        "version": document.version,
        "updated_at": document.updated_at.isoformat().replace("+00:00", "Z")
        if document.updated_at
        else None,
        "effective_on": document.effective_on.isoformat() if document.effective_on else None,
        "sort_order": document.sort_order,
        "fallback": fallback,
    }


def faq_iso(value):
    if not value:
        return None
    return value.isoformat().replace("+00:00", "Z")


def faq_entry_payload(entry, *, locale=None):
    labels = _faq_labels_for_locale(locale or entry.language)
    return {
        "id": entry.slug,
        "slug": entry.slug,
        "language": entry.language,
        "question": entry.question,
        "answer_markdown": apply_placeholders(entry.answer_markdown),
        "category": entry.category,
        "category_label": labels.get(entry.category, entry.get_category_display()),
        "keywords": entry.keyword_list(),
        "related_document_slug": entry.related_document_slug or None,
        "featured": entry.featured,
        "sort_order": entry.sort_order,
        "updated_at": faq_iso(entry.updated_at),
    }


def faq_categories_payload(locale=None):
    normalized = normalize_content_locale(locale or DEFAULT_CONTENT_LOCALE)
    labels = _faq_labels_for_locale(normalized)
    used = set(public_faq_queryset(normalized).values_list("category", flat=True))
    categories = []
    for key, _label in FaqCategory.choices:
        if key not in used:
            continue
        categories.append({"id": key, "label": labels.get(key, _label)})
    return categories


def resolve_faq_entries(*, locale, category="", query=""):
    from content.faq_search import filter_faq_entries

    normalized = normalize_content_locale(locale)
    rows = public_faq_queryset(normalized)
    if category:
        rows = rows.filter(category=category)
    entries = [faq_entry_payload(item, locale=normalized) for item in rows]
    if not entries and normalized != DEFAULT_CONTENT_LOCALE:
        rows = public_faq_queryset(DEFAULT_CONTENT_LOCALE)
        if category:
            rows = rows.filter(category=category)
        entries = [faq_entry_payload(item, locale=DEFAULT_CONTENT_LOCALE) for item in rows]
        if entries:
            logger.warning(
                "content.fallback faq requested=%s using=%s count=%s",
                normalized,
                DEFAULT_CONTENT_LOCALE,
                len(entries),
            )
    if query.strip():
        entries = filter_faq_entries(entries, query)
    return entries, normalized
