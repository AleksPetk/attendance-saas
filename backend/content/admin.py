from zoneinfo import ZoneInfo

from django import forms
from django.contrib import admin
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.utils.html import format_html

from content.models import (
    Announcement,
    AnnouncementAcknowledgement,
    AnnouncementAudience,
    Document,
    FaqEntry,
)
from organizations.models import OrganizationPlan

# Announcement Admin is operated from Japan. Global TIME_ZONE remains UTC for the
# rest of the app; only these admin views interpret/display naive datetimes in JST.
ANNOUNCEMENT_ADMIN_TZ = ZoneInfo("Asia/Tokyo")


PLAN_CHOICES = [(choice.value, choice.label) for choice in OrganizationPlan]


class AnnouncementAdminForm(forms.ModelForm):
    target_plans = forms.MultipleChoiceField(
        choices=PLAN_CHOICES,
        required=False,
        widget=forms.CheckboxSelectMultiple,
        help_text="Used when audience is Effective Plan.",
    )

    class Meta:
        model = Announcement
        fields = "__all__"

    class Media:
        js = ("admin/js/announcement_market_warning.js",)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["target_workspaces"].queryset = self.fields[
            "target_workspaces"
        ].queryset.order_by("workspace_id")
        self.fields["target_workspaces"].help_text = (
            "Search by Workspace ID, owner email, or internal label."
        )
        self.fields["market"].help_text = format_html(
            '<span id="announcement-market-all-warning">{}</span>',
            "This announcement may appear across all billing markets. Make sure "
            "the message is appropriate for every region.",
        )
        if self.instance and self.instance.pk:
            self.fields["target_plans"].initial = self.instance.target_plans or []

    def clean(self):
        cleaned = super().clean()
        audience = cleaned.get("audience")
        plans = list(cleaned.get("target_plans") or [])
        workspaces = cleaned.get("target_workspaces")

        if audience == AnnouncementAudience.ALL:
            cleaned["target_plans"] = []
            if workspaces is not None:
                cleaned["target_workspaces"] = workspaces.model.objects.none()
        elif audience == AnnouncementAudience.PLAN:
            if not plans:
                raise ValidationError({"target_plans": "Select at least one effective plan."})
            cleaned["target_plans"] = plans
            if workspaces is not None:
                cleaned["target_workspaces"] = workspaces.model.objects.none()
        elif audience == AnnouncementAudience.WORKSPACES:
            cleaned["target_plans"] = []
            selected = []
            if hasattr(self.data, "getlist"):
                selected = [value for value in self.data.getlist("target_workspaces") if value]
            elif workspaces is not None:
                selected = list(workspaces.values_list("pk", flat=True))
            if not selected:
                raise ValidationError(
                    {"target_workspaces": "Select at least one Workspace."}
                )
        return cleaned


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "slug",
        "language",
        "document_type",
        "nav_group",
        "status",
        "is_public",
        "version",
        "effective_on",
        "updated_at",
    )
    list_filter = ("language", "document_type", "nav_group", "status", "is_public")
    search_fields = ("slug", "title", "description")
    readonly_fields = ("created_at", "updated_at", "published_at")
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "title",
                    "slug",
                    "language",
                    "document_type",
                    "nav_group",
                    "description",
                    "sort_order",
                )
            },
        ),
        (
            "Publication",
            {
                "fields": (
                    "status",
                    "is_public",
                    "version",
                    "effective_on",
                    "published_at",
                    "updated_at",
                    "created_at",
                )
            },
        ),
        ("Canonical body", {"fields": ("body_markdown",)}),
        (
            "Internal",
            {
                "fields": ("admin_notes",),
                "description": "Never exposed by the public content API.",
            },
        ),
    )


@admin.register(FaqEntry)
class FaqEntryAdmin(admin.ModelAdmin):
    list_display = (
        "question",
        "slug",
        "language",
        "category",
        "status",
        "is_public",
        "featured",
        "sort_order",
        "updated_at",
    )
    list_filter = ("language", "category", "status", "is_public", "featured")
    search_fields = ("slug", "question", "keywords", "answer_markdown")
    readonly_fields = ("created_at", "updated_at", "published_at")
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "question",
                    "slug",
                    "language",
                    "category",
                    "keywords",
                    "related_document_slug",
                    "featured",
                    "sort_order",
                )
            },
        ),
        (
            "Publication",
            {
                "fields": (
                    "status",
                    "is_public",
                    "published_at",
                    "updated_at",
                    "created_at",
                )
            },
        ),
        ("Canonical answer", {"fields": ("answer_markdown",)}),
        (
            "Internal",
            {
                "fields": ("admin_notes",),
                "description": "Never exposed by the public FAQ API.",
            },
        ),
    )


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    form = AnnouncementAdminForm
    list_display = (
        "title",
        "language",
        "severity",
        "status",
        "audience",
        "market",
        "target_plans_display",
        "published_at",
        "expires_at",
        "updated_at",
    )
    list_filter = (
        "status",
        "severity",
        "audience",
        "market",
        "language",
        "include_status_link",
    )
    search_fields = ("title", "message", "admin_notes")
    autocomplete_fields = ("target_workspaces",)
    readonly_fields = ("created_at", "updated_at", "published_at")
    filter_horizontal = ()
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "title",
                    "message",
                    "language",
                    "severity",
                    "include_status_link",
                )
            },
        ),
        (
            "Audience",
            {
                "fields": (
                    "audience",
                    "market",
                    "target_plans",
                    "target_workspaces",
                ),
                "description": (
                    "All Workspaces ignores plan/workspace lists. "
                    "Effective Plan uses Organization.plan (Business trial counts as Business). "
                    "Specific Workspaces uses Organization search by Workspace ID."
                ),
            },
        ),
        (
            "Publication",
            {
                "fields": (
                    "status",
                    "published_at",
                    "expires_at",
                    "updated_at",
                    "created_at",
                ),
                "description": (
                    "Published_at and expires_at in this admin are entered and shown in "
                    "Japan Standard Time (Asia/Tokyo). Values are stored timezone-aware "
                    "(UTC). Eligibility uses server timezone.now() comparisons."
                ),
            },
        ),
        (
            "Internal",
            {
                "fields": ("admin_notes",),
                "description": "Never exposed by the Workspace announcement API.",
            },
        ),
    )

    def changelist_view(self, request, extra_context=None):
        with timezone.override(ANNOUNCEMENT_ADMIN_TZ):
            return super().changelist_view(request, extra_context=extra_context)

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        with timezone.override(ANNOUNCEMENT_ADMIN_TZ):
            return super().changeform_view(
                request,
                object_id=object_id,
                form_url=form_url,
                extra_context=extra_context,
            )

    def add_view(self, request, form_url="", extra_context=None):
        with timezone.override(ANNOUNCEMENT_ADMIN_TZ):
            return super().add_view(request, form_url=form_url, extra_context=extra_context)

    def history_view(self, request, object_id, extra_context=None):
        with timezone.override(ANNOUNCEMENT_ADMIN_TZ):
            return super().history_view(request, object_id, extra_context=extra_context)

    @admin.display(description="Plans")
    def target_plans_display(self, obj):
        plans = obj.target_plans or []
        return ", ".join(plans) if plans else "—"

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        announcement = form.instance
        if announcement.audience == AnnouncementAudience.ALL:
            announcement.target_workspaces.clear()
            if announcement.target_plans:
                Announcement.objects.filter(pk=announcement.pk).update(target_plans=[])
                announcement.target_plans = []
        elif announcement.audience == AnnouncementAudience.PLAN:
            announcement.target_workspaces.clear()
        elif announcement.audience == AnnouncementAudience.WORKSPACES:
            if announcement.target_plans:
                Announcement.objects.filter(pk=announcement.pk).update(target_plans=[])
                announcement.target_plans = []


@admin.register(AnnouncementAcknowledgement)
class AnnouncementAcknowledgementAdmin(admin.ModelAdmin):
    list_display = ("announcement", "user", "workspace_staff_account", "read_at")
    list_filter = ("read_at",)
    search_fields = (
        "announcement__title",
        "user__email",
        "workspace_staff_account__username",
        "workspace_staff_account__organization__workspace_id",
    )
    readonly_fields = ("announcement", "user", "workspace_staff_account", "read_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
