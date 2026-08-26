from django.db import models
from django.utils import timezone


class DeliveryStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SENT = "sent", "Sent"
    FAILED = "failed", "Failed"


class ReviewStatus(models.TextChoices):
    NEW = "new", "New"
    REVIEWED = "reviewed", "Reviewed"
    CLOSED = "closed", "Closed"


class ClientType(models.TextChoices):
    PUBLIC_WEB = "public_web", "Public website"
    WORKSPACE_WEB = "workspace_web", "Workspace"
    IOS = "ios", "iOS"
    ANDROID = "android", "Android"
    DESKTOP = "desktop", "Desktop"


class ContactRequest(models.Model):
    """
    Public contact submission. Stored even if outbound email fails.
    Platform admins only — never workspace admins.
    """

    public_ref = models.CharField(max_length=16, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    category_id = models.CharField(max_length=40)
    subcategory_id = models.CharField(max_length=40)
    category_label = models.CharField(max_length=80)
    subcategory_label = models.CharField(max_length=80)
    email = models.EmailField(max_length=254)
    name = models.CharField(max_length=80, blank=True)
    subject = models.CharField(max_length=120)
    message = models.TextField()
    client_type = models.CharField(
        max_length=20,
        choices=ClientType.choices,
        default=ClientType.PUBLIC_WEB,
    )
    page_path = models.CharField(max_length=200, blank=True)
    locale = models.CharField(max_length=16, blank=True)
    is_privacy_request = models.BooleanField(default=False, db_index=True)
    delivery_status = models.CharField(
        max_length=16,
        choices=DeliveryStatus.choices,
        default=DeliveryStatus.PENDING,
        db_index=True,
    )
    delivered_at = models.DateTimeField(null=True, blank=True)
    delivery_error_code = models.CharField(max_length=40, blank=True)
    review_status = models.CharField(
        max_length=16,
        choices=ReviewStatus.choices,
        default=ReviewStatus.NEW,
        db_index=True,
    )

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "Contact request"
        verbose_name_plural = "Contact requests"
        indexes = [
            models.Index(fields=["category_id", "subcategory_id"]),
            models.Index(fields=["email"]),
        ]

    def __str__(self):
        return f"{self.public_ref} · {self.subject}"

    def mark_sent(self):
        self.delivery_status = DeliveryStatus.SENT
        self.delivered_at = timezone.now()
        self.delivery_error_code = ""
        self.save(
            update_fields=[
                "delivery_status",
                "delivered_at",
                "delivery_error_code",
            ]
        )

    def mark_failed(self, code):
        self.delivery_status = DeliveryStatus.FAILED
        self.delivery_error_code = str(code or "send_failed")[:40]
        self.save(update_fields=["delivery_status", "delivery_error_code"])
