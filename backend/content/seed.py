"""Idempotent public document and FAQ seed. Does not overwrite existing rows."""

from datetime import date
from pathlib import Path

from django.core.exceptions import FieldDoesNotExist
from django.db import connection
from django.utils import timezone

from content.faq_seed import FAQ_ENTRIES
from content.faq_seed_ja import FAQ_ENTRIES_JA
from content.locale import DEFAULT_CONTENT_LOCALE
from content.models import Document, DocumentType, FaqEntry, NavGroup, PublicationStatus

SEED_DIR = Path(__file__).resolve().parent / "seed"
SEED_DIR_JA = SEED_DIR / "ja"

DOCUMENT_SPECS = {
    "en": (
        {
            "slug": "documentation",
            "title": "Documentation",
            "document_type": DocumentType.DOCUMENTATION,
            "nav_group": NavGroup.HOME,
            "description": "Public Check Station documentation home.",
            "filename": "documentation.md",
            "version": "1.3",
            "sort_order": 0,
            "effective_on": None,
        },
        {
            "slug": "getting-started",
            "title": "Getting Started with CheckStation",
            "document_type": DocumentType.DOCUMENTATION,
            "nav_group": NavGroup.GETTING_STARTED,
            "description": "First-run path from a new Check Station account to a successful test check-in.",
            "filename": "getting_started.md",
            "version": "1.1",
            "sort_order": 10,
            "effective_on": None,
        },
        {
            "slug": "groups-members",
            "title": "Groups & Members",
            "document_type": DocumentType.DOCUMENTATION,
            "nav_group": NavGroup.USING,
            "description": "Members, Groups, Visitors, participation, archive, and plan locks.",
            "filename": "groups_members.md",
            "version": "1.0",
            "sort_order": 10,
            "effective_on": None,
        },
        {
            "slug": "kiosk-setup",
            "title": "Kiosk Setup",
            "document_type": DocumentType.DOCUMENTATION,
            "nav_group": NavGroup.USING,
            "description": "Configure, preview, launch, lock, and exit a Group-owned Check Station kiosk.",
            "filename": "kiosk_setup.md",
            "version": "1.1",
            "sort_order": 20,
            "effective_on": None,
        },
        {
            "slug": "billing-plans",
            "title": "Billing & Plans",
            "document_type": DocumentType.DOCUMENTATION,
            "nav_group": NavGroup.USING,
            "description": "Plans, prices, limits, upgrades, downgrades, and Stripe billing.",
            "filename": "billing_plans.md",
            "version": "1.0",
            "sort_order": 30,
            "effective_on": None,
        },
        {
            "slug": "faq",
            "title": "FAQ",
            "document_type": DocumentType.HELP,
            "nav_group": NavGroup.HELP,
            "description": "Searchable answers about CheckStation. Same canonical FAQ API for future apps.",
            "filename": "faq.md",
            "version": "1.0",
            "sort_order": 10,
            "effective_on": None,
        },
        {
            "slug": "support",
            "title": "Support",
            "document_type": DocumentType.HELP,
            "nav_group": NavGroup.HELP,
            "description": "Search CheckStation help, check system status, then contact us if you still need a person.",
            "filename": "support.md",
            "version": "1.0",
            "sort_order": 5,
            "effective_on": None,
        },
        {
            "slug": "privacy-policy",
            "title": "Privacy Policy",
            "document_type": DocumentType.LEGAL,
            "nav_group": NavGroup.LEGAL,
            "description": "How Check Station handles personal and workspace data.",
            "filename": "privacy_policy.md",
            "version": "1.1",
            "sort_order": 10,
            "effective_on": date(2026, 8, 26),
        },
        {
            "slug": "terms-of-use",
            "title": "Terms of Use",
            "document_type": DocumentType.LEGAL,
            "nav_group": NavGroup.LEGAL,
            "description": "The agreement that governs use of Check Station.",
            "filename": "terms_of_use.md",
            "version": "1.0",
            "sort_order": 20,
            "effective_on": date(2026, 8, 26),
        },
    ),
    "ja": (
        {
            "slug": "documentation",
            "title": "ドキュメント",
            "document_type": DocumentType.DOCUMENTATION,
            "nav_group": NavGroup.HOME,
            "description": "CheckStation 公開ドキュメントのホーム。",
            "filename": "documentation.md",
            "version": "1.3",
            "sort_order": 0,
            "effective_on": None,
        },
        {
            "slug": "getting-started",
            "title": "CheckStation をはじめる",
            "document_type": DocumentType.DOCUMENTATION,
            "nav_group": NavGroup.GETTING_STARTED,
            "description": "新規アカウントからテストチェックインまでの最初の流れ。",
            "filename": "getting_started.md",
            "version": "1.1",
            "sort_order": 10,
            "effective_on": None,
        },
        {
            "slug": "groups-members",
            "title": "グループとメンバー",
            "document_type": DocumentType.DOCUMENTATION,
            "nav_group": NavGroup.USING,
            "description": "メンバー、グループ、参加者、アーカイブ、プラン制限。",
            "filename": "groups_members.md",
            "version": "1.0",
            "sort_order": 10,
            "effective_on": None,
        },
        {
            "slug": "kiosk-setup",
            "title": "キオスク設定",
            "document_type": DocumentType.DOCUMENTATION,
            "nav_group": NavGroup.USING,
            "description": "グループ所有のキオスクを設定、プレビュー、起動、ロック、終了する方法。",
            "filename": "kiosk_setup.md",
            "version": "1.1",
            "sort_order": 20,
            "effective_on": None,
        },
        {
            "slug": "billing-plans",
            "title": "請求とプラン",
            "document_type": DocumentType.DOCUMENTATION,
            "nav_group": NavGroup.USING,
            "description": "プラン、価格、上限、アップグレード、ダウングレード、Stripe 請求。",
            "filename": "billing_plans.md",
            "version": "1.0",
            "sort_order": 30,
            "effective_on": None,
        },
        {
            "slug": "faq",
            "title": "FAQ",
            "document_type": DocumentType.HELP,
            "nav_group": NavGroup.HELP,
            "description": "CheckStation に関する検索可能な回答。",
            "filename": "faq.md",
            "version": "1.0",
            "sort_order": 10,
            "effective_on": None,
        },
        {
            "slug": "support",
            "title": "サポート",
            "document_type": DocumentType.HELP,
            "nav_group": NavGroup.HELP,
            "description": "ヘルプを検索し、稼働状況を確認し、必要ならお問い合わせ。",
            "filename": "support.md",
            "version": "1.0",
            "sort_order": 5,
            "effective_on": None,
        },
        {
            "slug": "privacy-policy",
            "title": "プライバシーポリシー",
            "document_type": DocumentType.LEGAL,
            "nav_group": NavGroup.LEGAL,
            "description": "CheckStation が個人データとワークスペースデータをどのように扱うか。",
            "filename": "privacy_policy.md",
            "version": "1.1",
            "sort_order": 10,
            "effective_on": date(2026, 8, 26),
        },
        {
            "slug": "terms-of-use",
            "title": "利用規約",
            "document_type": DocumentType.LEGAL,
            "nav_group": NavGroup.LEGAL,
            "description": "CheckStation の利用を規定する契約。",
            "filename": "terms_of_use.md",
            "version": "1.0",
            "sort_order": 20,
            "effective_on": date(2026, 8, 26),
        },
    ),
}

FAQ_BY_LOCALE = {
    "en": FAQ_ENTRIES,
    "ja": FAQ_ENTRIES_JA,
}


def _seed_dir_for(language):
    if language == "ja":
        return SEED_DIR_JA
    return SEED_DIR


def _model_has_field(model, field_name):
    try:
        model._meta.get_field(field_name)
        return True
    except FieldDoesNotExist:
        return False


def _db_has_column(model, field_name):
    """True only when the live database table already has the column."""
    if not _model_has_field(model, field_name):
        return False
    table = model._meta.db_table
    try:
        with connection.cursor() as cursor:
            description = connection.introspection.get_table_description(cursor, table)
    except Exception:
        return False
    return any(col.name == field_name for col in description)


def _resolve_seed_languages(*, languages, model, has_language):
    """Pre-locale migrations only have English rows keyed by slug."""
    if not has_language:
        return ("en",)
    return languages or ("en", "ja")


def _seed_models(*, apps, need_faq=False):
    if apps is not None:
        document_model = apps.get_model("content", "Document")
        document_has_language = _model_has_field(document_model, "language")
        faq_model = None
        faq_has_language = False
        if need_faq:
            faq_model = apps.get_model("content", "FaqEntry")
            faq_has_language = _model_has_field(faq_model, "language")
        return document_model, faq_model, document_has_language, faq_has_language
    document_has_language = _db_has_column(Document, "language")
    faq_has_language = _db_has_column(FaqEntry, "language")
    return Document, FaqEntry, document_has_language, faq_has_language


def seed_documents(*, overwrite=False, languages=None, apps=None):
    created = []
    updated = []
    DocumentModel, _, has_language, _ = _seed_models(apps=apps, need_faq=False)
    langs = _resolve_seed_languages(languages=languages, model=DocumentModel, has_language=has_language)
    for language in langs:
        specs = DOCUMENT_SPECS.get(language, ())
        seed_dir = _seed_dir_for(language)
        for spec in specs:
            body_path = seed_dir / spec["filename"]
            if not body_path.is_file():
                continue
            body = body_path.read_text(encoding="utf-8")
            defaults = {
                "title": spec["title"],
                "document_type": spec["document_type"],
                "nav_group": spec["nav_group"],
                "description": spec["description"],
                "body_markdown": body,
                "version": spec["version"],
                "status": PublicationStatus.PUBLISHED,
                "is_public": True,
                "sort_order": spec["sort_order"],
                "effective_on": spec["effective_on"],
                "published_at": timezone.now(),
            }
            if has_language:
                defaults["language"] = language
            lookup = {"slug": spec["slug"]}
            if has_language:
                lookup["language"] = language
            existing = DocumentModel.objects.filter(**lookup).first()
            if existing is None:
                DocumentModel.objects.create(slug=spec["slug"], **defaults)
                created.append(f"{language}:{spec['slug']}")
                continue
            if overwrite:
                for key, value in defaults.items():
                    setattr(existing, key, value)
                existing.save()
                updated.append(f"{language}:{spec['slug']}")
    return created, updated


def seed_faq_entries(*, overwrite=False, languages=None, apps=None):
    created = []
    updated = []
    _, FaqModel, _, has_language = _seed_models(apps=apps, need_faq=True)
    langs = _resolve_seed_languages(languages=languages, model=FaqModel, has_language=has_language)
    for language in langs:
        entries = FAQ_BY_LOCALE.get(language, ())
        for spec in entries:
            defaults = {
                "question": spec["question"],
                "answer_markdown": spec["answer"],
                "category": spec["category"],
                "keywords": spec.get("keywords") or "",
                "related_document_slug": spec.get("related_document_slug") or "",
                "featured": bool(spec.get("featured")),
                "sort_order": spec.get("sort_order", 100),
                "status": PublicationStatus.PUBLISHED,
                "is_public": True,
                "published_at": timezone.now(),
            }
            if has_language:
                defaults["language"] = language
            lookup = {"slug": spec["slug"]}
            if has_language:
                lookup["language"] = language
            existing = FaqModel.objects.filter(**lookup).first()
            if existing is None:
                FaqModel.objects.create(slug=spec["slug"], **defaults)
                created.append(f"{language}:{spec['slug']}")
                continue
            if overwrite:
                for key, value in defaults.items():
                    setattr(existing, key, value)
                existing.save()
                updated.append(f"{language}:{spec['slug']}")
    return created, updated
