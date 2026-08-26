"""Canonical public documents (Docs, Privacy, Terms, future help)."""

from django.db import models
from django.utils import timezone


class DocumentType(models.TextChoices):
    DOCUMENTATION = "documentation", "Documentation"
    LEGAL = "legal", "Legal"
    HELP = "help", "Help"


class NavGroup(models.TextChoices):
    HOME = "home", "Documentation"
    GETTING_STARTED = "getting_started", "Getting Started"
    USING = "using", "Using CheckStation"
    LEGAL = "legal", "Legal"
    HELP = "help", "Help"


class PublicationStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"


class FaqCategory(models.TextChoices):
    GETTING_STARTED = "getting_started", "Getting Started"
    ACCOUNT_SECURITY = "account_security", "Account & Security"
    MEMBERS_GROUPS = "members_groups", "Members & Groups"
    KIOSK = "kiosk", "Kiosk"
    ATTENDANCE = "attendance", "Attendance & History"
    EMAIL = "email", "Email & Notifications"
    STAFF = "staff", "Staff & Permissions"
    PLANS = "plans", "Plans & Billing"
    SUBSCRIPTION_CHANGES = "subscription_changes", "Subscription Changes"
    TROUBLESHOOTING = "troubleshooting", "Troubleshooting"
    PRIVACY = "privacy", "Privacy & Data"
    GENERAL = "general", "General"


class FaqEntry(models.Model):
    """
    One canonical FAQ item. Public APIs expose published entries only.
    Answers are Markdown. Platform operators edit this in Django admin.
    """

    slug = models.SlugField(
        max_length=80,
        unique=True,
        help_text="Stable public identifier, for example what-is-a-member.",
    )
    question = models.CharField(max_length=240)
    answer_markdown = models.TextField(
        help_text="Canonical Markdown answer. Do not store raw HTML as the source.",
    )
    category = models.CharField(
        max_length=32,
        choices=FaqCategory.choices,
        default=FaqCategory.GENERAL,
        db_index=True,
    )
    keywords = models.CharField(
        max_length=400,
        blank=True,
        help_text="Comma-separated search aliases, for example pin, exit code.",
    )
    related_document_slug = models.SlugField(
        max_length=80,
        blank=True,
        help_text="Optional Docs slug such as kiosk-setup.",
    )
    featured = models.BooleanField(
        default=False,
        help_text="Show among common questions when useful.",
    )
    sort_order = models.PositiveIntegerField(default=100)
    status = models.CharField(
        max_length=16,
        choices=PublicationStatus.choices,
        default=PublicationStatus.DRAFT,
        db_index=True,
    )
    is_public = models.BooleanField(
        default=True,
        help_text="If off, the entry is never returned by the public API.",
    )
    published_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    admin_notes = models.TextField(
        blank=True,
        help_text="Internal review notes. Never exposed by the public API.",
    )

    class Meta:
        ordering = ("category", "sort_order", "question")
        verbose_name = "FAQ entry"
        verbose_name_plural = "FAQ entries"

    def __str__(self):
        return self.question

    def save(self, *args, **kwargs):
        if self.status == PublicationStatus.PUBLISHED and self.published_at is None:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)

    def keyword_list(self):
        return [
            part.strip()
            for part in str(self.keywords or "").split(",")
            if part.strip()
        ]


class Document(models.Model):
    """
    One canonical public document.

    Body is Markdown. Public APIs expose published documents only.
    Platform operators edit this in Django admin.
    """

    slug = models.SlugField(
        max_length=80,
        unique=True,
        help_text="Stable public identifier, for example privacy-policy.",
    )
    title = models.CharField(max_length=200)
    document_type = models.CharField(
        max_length=32,
        choices=DocumentType.choices,
        default=DocumentType.DOCUMENTATION,
    )
    nav_group = models.CharField(
        max_length=32,
        choices=NavGroup.choices,
        default=NavGroup.HOME,
    )
    description = models.CharField(
        max_length=300,
        blank=True,
        help_text="Short public summary used in indexes and meta description.",
    )
    body_markdown = models.TextField(
        help_text="Canonical Markdown body. Do not store raw HTML as the source.",
    )
    version = models.CharField(max_length=32, default="1.0")
    status = models.CharField(
        max_length=16,
        choices=PublicationStatus.choices,
        default=PublicationStatus.DRAFT,
        db_index=True,
    )
    is_public = models.BooleanField(
        default=True,
        help_text="If off, the document is never returned by the public API.",
    )
    sort_order = models.PositiveIntegerField(default=100)
    effective_on = models.DateField(
        null=True,
        blank=True,
        help_text="Public effective date for legal documents.",
    )
    published_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    admin_notes = models.TextField(
        blank=True,
        help_text="Internal review notes. Never exposed by the public API.",
    )

    class Meta:
        ordering = ("nav_group", "sort_order", "title")

    def __str__(self):
        return f"{self.title} ({self.slug})"

    def save(self, *args, **kwargs):
        if self.status == PublicationStatus.PUBLISHED and self.published_at is None:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)
