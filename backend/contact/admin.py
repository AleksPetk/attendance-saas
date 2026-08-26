from django.contrib import admin

from contact.models import ContactRequest


@admin.register(ContactRequest)
class ContactRequestAdmin(admin.ModelAdmin):
    list_display = (
        "public_ref",
        "created_at",
        "category_label",
        "subcategory_label",
        "email",
        "subject",
        "delivery_status",
        "review_status",
        "is_privacy_request",
    )
    list_filter = (
        "delivery_status",
        "review_status",
        "is_privacy_request",
        "category_id",
        "subcategory_id",
        "client_type",
    )
    search_fields = ("public_ref", "email", "subject", "name", "message")
    readonly_fields = (
        "public_ref",
        "created_at",
        "category_id",
        "subcategory_id",
        "category_label",
        "subcategory_label",
        "email",
        "name",
        "subject",
        "message",
        "client_type",
        "page_path",
        "locale",
        "is_privacy_request",
        "delivery_status",
        "delivered_at",
        "delivery_error_code",
    )
    fields = readonly_fields + ("review_status",)
    ordering = ("-created_at",)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
