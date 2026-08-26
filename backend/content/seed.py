"""Idempotent public document and FAQ seed. Does not overwrite existing rows."""

from datetime import date
from pathlib import Path

from django.utils import timezone

from content.faq_seed import FAQ_ENTRIES
from content.models import Document, DocumentType, FaqEntry, NavGroup, PublicationStatus

SEED_DIR = Path(__file__).resolve().parent / "seed"

DOCUMENTS = (
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
)


def seed_documents(*, overwrite=False):
    created = []
    updated = []
    for spec in DOCUMENTS:
        body = (SEED_DIR / spec["filename"]).read_text(encoding="utf-8")
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
        existing = Document.objects.filter(slug=spec["slug"]).first()
        if existing is None:
            Document.objects.create(slug=spec["slug"], **defaults)
            created.append(spec["slug"])
            continue
        if overwrite:
            for key, value in defaults.items():
                setattr(existing, key, value)
            existing.save()
            updated.append(spec["slug"])
    return created, updated


def seed_faq_entries(*, overwrite=False):
    created = []
    updated = []
    for spec in FAQ_ENTRIES:
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
        existing = FaqEntry.objects.filter(slug=spec["slug"]).first()
        if existing is None:
            FaqEntry.objects.create(slug=spec["slug"], **defaults)
            created.append(spec["slug"])
            continue
        if overwrite:
            for key, value in defaults.items():
                setattr(existing, key, value)
            existing.save()
            updated.append(spec["slug"])
    return created, updated
