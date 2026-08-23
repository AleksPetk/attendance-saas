"""
Group-owned outgoing email sender configuration and delivery audit.

Platform Resend (core.mail) remains for Check Station account emails.
Customer Group after-action attendance emails use GroupEmailSender.
"""

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from core.crypto import decrypt_secret, encrypt_secret


class EmailSenderProviderKind(models.TextChoices):
    CUSTOM_SMTP = "custom_smtp", "Custom SMTP"
    GMAIL = "gmail", "Gmail"
    MICROSOFT = "microsoft", "Outlook / Microsoft 365"
    YAHOO = "yahoo", "Yahoo Mail"


class EmailSenderStatus(models.TextChoices):
    NOT_CONFIGURED = "not_configured", "Not configured"
    NEEDS_VERIFICATION = "needs_verification", "Needs verification"
    READY = "ready", "Ready"
    ERROR = "error", "Error"


class SmtpSecurity(models.TextChoices):
    SSL = "ssl", "SSL/TLS"
    STARTTLS = "starttls", "STARTTLS"
    NONE = "none", "None"


class GroupEmailDeliveryStatus(models.TextChoices):
    SENT = "sent", "Sent"
    FAILED = "failed", "Failed"


class GroupEmailSender(models.Model):
    """
    Per-Group outgoing email sender.

    Custom SMTP uses smtp_* columns. Gmail, Microsoft, and Yahoo guided
    providers store the mailbox address in ``from_email`` / ``smtp_username``,
    encrypt the secret in ``smtp_password_encrypted``, and leave host/port/
    security blank — each provider applies its official SMTP transport
    internally. Future OAuth providers may use ``provider_settings`` without
    forcing SMTP host/port into the UI.
    """

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="group_email_senders",
    )
    group = models.OneToOneField(
        "groups.Group",
        on_delete=models.CASCADE,
        related_name="email_sender",
    )
    provider = models.CharField(
        max_length=40,
        choices=EmailSenderProviderKind.choices,
        default=EmailSenderProviderKind.CUSTOM_SMTP,
    )
    smtp_host = models.CharField(max_length=255, blank=True, default="")
    smtp_port = models.PositiveIntegerField(null=True, blank=True)
    smtp_security = models.CharField(
        max_length=20,
        choices=SmtpSecurity.choices,
        blank=True,
        default="",
    )
    smtp_username = models.CharField(max_length=255, blank=True, default="")
    smtp_password_encrypted = models.TextField(blank=True, default="")
    from_email = models.EmailField(blank=True, default="")
    from_name = models.CharField(max_length=150, blank=True, default="")
    provider_settings = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=30,
        choices=EmailSenderStatus.choices,
        default=EmailSenderStatus.NOT_CONFIGURED,
    )
    last_tested_at = models.DateTimeField(null=True, blank=True)
    last_test_error = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["organization"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(provider__in=EmailSenderProviderKind.values),
                name="groups_email_sender_provider_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=EmailSenderStatus.values),
                name="groups_email_sender_status_valid",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(smtp_security="")
                    | models.Q(smtp_security__in=SmtpSecurity.values)
                ),
                name="groups_email_sender_smtp_security_valid",
            ),
        ]

    def __str__(self):
        return f"Email sender for {self.group_id} ({self.provider})"

    @property
    def password_configured(self):
        return bool(self.smtp_password_encrypted)

    @property
    def is_ready(self):
        return self.status == EmailSenderStatus.READY

    def set_smtp_password(self, plaintext):
        self.smtp_password_encrypted = encrypt_secret(plaintext)

    def clear_smtp_password(self):
        self.smtp_password_encrypted = ""

    def get_smtp_password(self):
        if not self.smtp_password_encrypted:
            return ""
        return decrypt_secret(self.smtp_password_encrypted)

    def mark_needs_verification(self, *, clear_error=True):
        self.status = EmailSenderStatus.NEEDS_VERIFICATION
        if clear_error:
            self.last_test_error = ""

    def mark_ready(self):
        self.status = EmailSenderStatus.READY
        self.last_tested_at = timezone.now()
        self.last_test_error = ""

    def mark_error(self, safe_message):
        self.status = EmailSenderStatus.ERROR
        self.last_tested_at = timezone.now()
        self.last_test_error = (safe_message or "")[:255]

    def save(self, *args, **kwargs):
        self._assert_tenant_ownership()
        self.smtp_host = (self.smtp_host or "").strip()
        self.smtp_username = (self.smtp_username or "").strip()
        self.from_email = (self.from_email or "").strip().lower()
        self.from_name = (self.from_name or "").strip()
        self.last_test_error = (self.last_test_error or "").strip()[:255]
        if not isinstance(self.provider_settings, dict):
            self.provider_settings = {}
        if self.group_id and not self.organization_id:
            self.organization_id = self.group.organization_id
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        self._assert_tenant_ownership()

    def _assert_tenant_ownership(self):
        if not self.group_id:
            return
        group_org = self.group.organization_id
        if self.organization_id and self.organization_id != group_org:
            raise ValidationError(
                "Email sender organization must match the Group's organization."
            )
        self.organization_id = group_org


class GroupEmailDelivery(models.Model):
    """Lightweight audit of Group operational email send attempts."""

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="group_email_deliveries",
    )
    group = models.ForeignKey(
        "groups.Group",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="email_deliveries",
    )
    action_record = models.ForeignKey(
        "attendance.ActionRecord",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="email_deliveries",
    )
    recipient = models.EmailField()
    event_type = models.CharField(max_length=40)
    status = models.CharField(
        max_length=20,
        choices=GroupEmailDeliveryStatus.choices,
    )
    error_summary = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["organization", "created_at"]),
            models.Index(fields=["group", "created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=GroupEmailDeliveryStatus.values),
                name="groups_email_delivery_status_valid",
            ),
        ]

    def __str__(self):
        return f"{self.event_type} → {self.recipient} ({self.status})"
