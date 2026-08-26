from django.contrib import admin

from content.models import Document, FaqEntry


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "slug",
        "document_type",
        "nav_group",
        "status",
        "is_public",
        "version",
        "effective_on",
        "updated_at",
    )
    list_filter = ("document_type", "nav_group", "status", "is_public")
    search_fields = ("slug", "title", "description")
    readonly_fields = ("created_at", "updated_at", "published_at")
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "title",
                    "slug",
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
        "category",
        "status",
        "is_public",
        "featured",
        "sort_order",
        "updated_at",
    )
    list_filter = ("category", "status", "is_public", "featured")
    search_fields = ("slug", "question", "keywords", "answer_markdown")
    readonly_fields = ("created_at", "updated_at", "published_at")
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "question",
                    "slug",
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
