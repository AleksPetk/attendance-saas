"""Canonical public documents (Docs, Privacy, Terms, future help)."""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from content.locale import DEFAULT_CONTENT_LOCALE, SUPPORTED_CONTENT_LOCALES, normalize_content_locale


class ContentLanguage(models.TextChoices):
    ENGLISH = "en", "English"
    JAPANESE = "ja", "Japanese"


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
        help_text="Stable public identifier, for example what-is-a-member.",
    )
    language = models.CharField(
        max_length=5,
        choices=ContentLanguage.choices,
        default=DEFAULT_CONTENT_LOCALE,
        db_index=True,
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
        constraints = [
            models.UniqueConstraint(fields=("slug", "language"), name="faqentry_slug_language_uniq"),
        ]

    def __str__(self):
        return self.question

    def save(self, *args, **kwargs):
        self.language = normalize_content_locale(self.language)
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
        help_text="Stable public identifier, for example privacy-policy.",
    )
    language = models.CharField(
        max_length=5,
        choices=ContentLanguage.choices,
        default=DEFAULT_CONTENT_LOCALE,
        db_index=True,
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
        constraints = [
            models.UniqueConstraint(fields=("slug", "language"), name="document_slug_language_uniq"),
        ]

    def __str__(self):
        return f"{self.title} ({self.slug})"

    def save(self, *args, **kwargs):
        self.language = normalize_content_locale(self.language)
        if self.status == PublicationStatus.PUBLISHED and self.published_at is None:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)


class AnnouncementSeverity(models.TextChoices):
    INFO = "info", "Info"
    MAINTENANCE = "maintenance", "Maintenance"
    IMPORTANT = "important", "Important"


class AnnouncementAudience(models.TextChoices):
    ALL = "all", "All Workspaces"
    PLAN = "plan", "Effective Plan"
    WORKSPACES = "workspaces", "Specific Workspaces"


class AnnouncementMarket(models.TextChoices):
    ALL = "all", "All Markets"
    GLOBAL = "global", "Global"
    JP = "jp", "Japan"


class Announcement(models.Model):
    """
    Platform-published Workspace announcement.

    Eligibility is evaluated server-side from publication state, expiry,
    audience targeting (all / effective plan / specific Organizations), and
    the independent effective billing-market filter.
    """

    title = models.CharField(max_length=160)
    message = models.TextField()
    severity = models.CharField(
        max_length=16,
        choices=AnnouncementSeverity.choices,
        default=AnnouncementSeverity.INFO,
        db_index=True,
    )
    status = models.CharField(
        max_length=16,
        choices=PublicationStatus.choices,
        default=PublicationStatus.DRAFT,
        db_index=True,
    )
    audience = models.CharField(
        max_length=16,
        choices=AnnouncementAudience.choices,
        default=AnnouncementAudience.ALL,
        db_index=True,
    )
    market = models.CharField(
        "Market",
        max_length=10,
        choices=AnnouncementMarket.choices,
        default=AnnouncementMarket.ALL,
        db_index=True,
        help_text="Additional billing-market filter applied after audience targeting.",
    )
    language = models.CharField(
        "Language",
        max_length=5,
        choices=ContentLanguage.choices,
        default=ContentLanguage.ENGLISH,
        db_index=True,
        help_text="Admin metadata only. Language does not affect delivery eligibility.",
    )
    target_plans = models.JSONField(
        default=list,
        blank=True,
        help_text="Effective plan keys when audience is plan: basic, plus, and/or business.",
    )
    target_workspaces = models.ManyToManyField(
        "organizations.Organization",
        blank=True,
        related_name="platform_announcements",
        help_text="Target Organizations when audience is specific workspaces.",
    )
    published_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "Optional. After this time the announcement is no longer eligible. "
            "Announcement Admin enters/displays this in Asia/Tokyo; stored timezone-aware."
        ),
    )
    include_status_link = models.BooleanField(
        default=False,
        help_text="When enabled, Workspace clients may show a View Status action.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    admin_notes = models.TextField(
        blank=True,
        help_text="Internal review notes. Never exposed by the Workspace API.",
    )

    class Meta:
        ordering = ("-published_at", "-id")
        verbose_name = "Announcement"
        verbose_name_plural = "Announcements"

    def __str__(self):
        return self.title

    def clean(self):
        super().clean()
        from organizations.models import OrganizationPlan

        plans = self._normalized_target_plans()
        valid = {choice.value for choice in OrganizationPlan}
        invalid = [key for key in plans if key not in valid]
        if invalid:
            raise ValidationError({"target_plans": f"Invalid plan keys: {', '.join(invalid)}."})

        if self.audience == AnnouncementAudience.ALL:
            if plans:
                raise ValidationError(
                    {"target_plans": "Clear plan targets when audience is All Workspaces."}
                )
        elif self.audience == AnnouncementAudience.PLAN:
            if not plans:
                raise ValidationError(
                    {"target_plans": "Select at least one effective plan."}
                )
        elif self.audience == AnnouncementAudience.WORKSPACES:
            if plans:
                raise ValidationError(
                    {"target_plans": "Clear plan targets when audience is Specific Workspaces."}
                )

        if (
            self.expires_at
            and self.published_at
            and self.expires_at <= self.published_at
        ):
            raise ValidationError({"expires_at": "Expiry must be after publish time."})

    def save(self, *args, **kwargs):
        self.target_plans = self._normalized_target_plans()
        if self.status == PublicationStatus.PUBLISHED and self.published_at is None:
            self.published_at = timezone.now()
        if self.audience == AnnouncementAudience.ALL:
            self.target_plans = []
        elif self.audience == AnnouncementAudience.WORKSPACES:
            self.target_plans = []
        self.full_clean(exclude={"target_workspaces"})
        super().save(*args, **kwargs)

    def _normalized_target_plans(self):
        raw = self.target_plans or []
        if isinstance(raw, str):
            raw = [part.strip() for part in raw.split(",") if part.strip()]
        if not isinstance(raw, (list, tuple)):
            return []
        seen = []
        for item in raw:
            key = str(item or "").strip().lower()
            if key and key not in seen:
                seen.append(key)
        return seen


class AnnouncementAcknowledgement(models.Model):
    """
    Per-actor read state for an announcement.

    Exactly one of user or workspace_staff_account must be set.
    """

    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name="acknowledgements",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="announcement_acknowledgements",
    )
    workspace_staff_account = models.ForeignKey(
        "organizations.WorkspaceStaffAccount",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="announcement_acknowledgements",
    )
    read_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(user__isnull=False, workspace_staff_account__isnull=True)
                    | Q(user__isnull=True, workspace_staff_account__isnull=False)
                ),
                name="announcement_ack_actor_xor",
            ),
            models.UniqueConstraint(
                fields=("announcement", "user"),
                condition=Q(user__isnull=False),
                name="announcement_ack_unique_user",
            ),
            models.UniqueConstraint(
                fields=("announcement", "workspace_staff_account"),
                condition=Q(workspace_staff_account__isnull=False),
                name="announcement_ack_unique_staff",
            ),
        ]
        indexes = [
            models.Index(fields=("user", "announcement")),
            models.Index(fields=("workspace_staff_account", "announcement")),
        ]

    def __str__(self):
        actor = self.user_id or self.workspace_staff_account_id
        return f"Ack {self.announcement_id} by {actor}"

    def clean(self):
        super().clean()
        has_user = self.user_id is not None
        has_staff = self.workspace_staff_account_id is not None
        if has_user == has_staff:
            raise ValidationError("Exactly one of user or workspace_staff_account is required.")
