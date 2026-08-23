from django.contrib.auth.hashers import check_password, make_password
from pathlib import Path
from datetime import time
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.db import models

from kiosk_builder.config_schema import default_config, validate_config
from kiosk_builder.kiosk_settings_constants import (
    ATTENDANCE_RESET_MODE_DEFAULT,
    ATTENDANCE_RESET_ROLLING_HOURS_DEFAULT,
    ATTENDANCE_RESET_ROLLING_MINUTES_DEFAULT,
    AttendanceResetMode,
    CONFIRMATION_RETURN_SECONDS_DEFAULT,
    KioskConfirmationTemplate,
    KioskInputSecondField,
    KioskType,
)
from kiosk_builder.kiosk_settings_validation import (
    normalize_kiosk_settings_fields,
    normalize_kiosk_settings_for_group_capabilities,
)


def _kiosk_media_path(instance, *, stem, filename, fallback_ext):
    """
    Unique per-upload path under the design folder.

    Fixed names like logo.png are unsafe: replace+delete-old can erase the
    newly written file when storage reuses the same path, and browsers may
    cache 404s for stable URLs.
    """
    org_id = instance.organization_id or "unknown"
    design_id = instance.pk or "new"
    ext = Path(filename or "").suffix.lower() or fallback_ext
    if ext not in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
        ext = fallback_ext
    return f"kiosks/{org_id}/designs/{design_id}/{stem}_{uuid4().hex}{ext}"


def kiosk_logo_upload_to(instance, filename):
    return _kiosk_media_path(
        instance, stem="logo", filename=filename, fallback_ext=".png"
    )


def kiosk_footer_logo_upload_to(instance, filename):
    return _kiosk_media_path(
        instance, stem="footer-logo", filename=filename, fallback_ext=".png"
    )


def kiosk_background_upload_to(instance, filename):
    return _kiosk_media_path(
        instance, stem="background", filename=filename, fallback_ext=".jpg"
    )


class KioskDesign(models.Model):
    """
    Visual design configuration for a Group-owned kiosk.

    Attendance behavior (kiosk_mode, actions, PIN, sequencing, session lock)
    remains on Group.  This model holds only "how does the kiosk look?"
    """

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="kiosk_designs",
    )
    group = models.OneToOneField(
        "groups.Group",
        on_delete=models.CASCADE,
        related_name="kiosk_design",
    )
    config = models.JSONField(default=default_config)
    header_logo = models.ImageField(
        upload_to=kiosk_logo_upload_to,
        blank=True,
    )
    footer_logo = models.ImageField(
        upload_to=kiosk_footer_logo_upload_to,
        blank=True,
    )
    main_background_image = models.ImageField(
        upload_to=kiosk_background_upload_to,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["organization"]),
        ]

    def __str__(self):
        owner = self.group.name if self.group_id else f"design-{self.pk}"
        return f"KioskDesign for {owner}"

    def clean(self):
        super().clean()
        self._validate_tenant_ownership()
        self._validate_config_json()

    def save(self, *args, **kwargs):
        self._validate_tenant_ownership()
        self._validate_config_json()
        super().save(*args, **kwargs)

    def _validate_tenant_ownership(self):
        if not self.group_id:
            raise ValidationError({"group": "KioskDesign must belong to a Group."})
        if self.organization_id:
            group_org_id = self.group.organization_id
            if group_org_id != self.organization_id:
                raise ValidationError(
                    "KioskDesign organization must match the Group's organization."
                )

    def _validate_config_json(self):
        if not isinstance(self.config, dict):
            raise ValidationError({"config": "Config must be a JSON object."})
        normalized, errors = validate_config(self.config)
        if errors:
            raise ValidationError({"config": errors})
        self.config = normalized


class KioskSettings(models.Model):
    """
    Behavioral kiosk configuration for a Group.

    Visual appearance lives in KioskDesign. Group participation fields
    (require_email, require_pin) define availability; this model chooses
    how the kiosk uses them for identification and display.

    Header/Main/Footer always exist on the kiosk shell; structure toggles
    are not part of this model.
    """

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="kiosk_settings",
    )
    group = models.OneToOneField(
        "groups.Group",
        on_delete=models.CASCADE,
        related_name="kiosk_settings",
    )
    mode = models.CharField(
        max_length=20,
        choices=KioskType.choices,
        default=KioskType.CARD,
    )
    card_show_name = models.BooleanField(default=True)
    card_show_participant_code = models.BooleanField(default=True)
    card_show_email = models.BooleanField(default=False)
    use_pin = models.BooleanField(
        default=False,
        help_text="When enabled in Card mode, PIN is required after card selection.",
    )
    input_field_count = models.PositiveSmallIntegerField(default=1)
    input_second_field = models.CharField(
        max_length=20,
        choices=KioskInputSecondField.choices,
        blank=True,
        default="",
    )
    exit_code_hash = models.CharField(max_length=128, blank=True, default="")
    confirmation_template = models.CharField(
        max_length=20,
        choices=KioskConfirmationTemplate.choices,
        default=KioskConfirmationTemplate.CLEAN,
    )
    confirmation_check_in_message = models.TextField(blank=True, default="")
    confirmation_check_out_message = models.TextField(blank=True, default="")
    confirmation_break_start_message = models.TextField(blank=True, default="")
    confirmation_break_end_message = models.TextField(blank=True, default="")
    confirmation_return_seconds = models.PositiveSmallIntegerField(
        default=CONFIRMATION_RETURN_SECONDS_DEFAULT,
    )
    attendance_reset_mode = models.CharField(
        max_length=20,
        choices=AttendanceResetMode.choices,
        default=ATTENDANCE_RESET_MODE_DEFAULT,
    )
    attendance_reset_daily_time = models.TimeField(
        default=time.min,
    )
    attendance_reset_rolling_hours = models.PositiveIntegerField(
        default=ATTENDANCE_RESET_ROLLING_HOURS_DEFAULT,
    )
    attendance_reset_rolling_minutes = models.PositiveSmallIntegerField(
        default=ATTENDANCE_RESET_ROLLING_MINUTES_DEFAULT,
    )
    manual_reset_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["organization"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(mode__in=KioskType.values),
                name="kiosk_settings_mode_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(input_field_count__in=[1, 2]),
                name="kiosk_settings_input_field_count_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    confirmation_template__in=KioskConfirmationTemplate.values
                ),
                name="kiosk_settings_confirmation_template_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(confirmation_return_seconds__in=[1, 3, 5]),
                name="kiosk_settings_confirmation_return_seconds_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(attendance_reset_mode__in=AttendanceResetMode.values),
                name="kiosk_settings_attendance_reset_mode_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(attendance_reset_rolling_minutes__lt=60),
                name="kiosk_settings_attendance_reset_rolling_minutes_valid",
            ),
        ]

    def __str__(self):
        return f"KioskSettings for {self.group.name if self.group_id else self.pk}"

    @property
    def has_exit_code(self):
        return bool(self.exit_code_hash)

    def set_exit_code(self, raw_code):
        from kiosk_builder.kiosk_settings_validation import validate_exit_code

        code = validate_exit_code(raw_code)
        self.exit_code_hash = make_password(code)

    def check_exit_code(self, raw_code):
        if not self.exit_code_hash:
            return False
        return check_password(str(raw_code or ""), self.exit_code_hash)

    def clean(self):
        super().clean()
        self._validate_tenant_ownership()
        normalize_kiosk_settings_for_group_capabilities(self)
        normalize_kiosk_settings_fields(self)

    def save(self, *args, **kwargs):
        self._validate_tenant_ownership()
        normalize_kiosk_settings_for_group_capabilities(self)
        normalize_kiosk_settings_fields(self)
        super().save(*args, **kwargs)

    def _validate_tenant_ownership(self):
        if not self.group_id:
            raise ValidationError({"group": "KioskSettings must belong to a Group."})
        if self.organization_id:
            group_org_id = self.group.organization_id
            if group_org_id != self.organization_id:
                raise ValidationError(
                    "KioskSettings organization must match the Group's organization."
                )


def default_kiosk_settings_for_group(group):
    """Sensible defaults for a newly created Group."""
    return {
        "organization_id": group.organization_id,
        "mode": KioskType.CARD,
        "card_show_name": True,
        "card_show_participant_code": True,
        "card_show_email": False,
        "use_pin": False,
        "input_field_count": 1,
        "input_second_field": "",
        "confirmation_template": KioskConfirmationTemplate.CLEAN,
        "confirmation_check_in_message": "",
        "confirmation_check_out_message": "",
        "confirmation_break_start_message": "",
        "confirmation_break_end_message": "",
        "confirmation_return_seconds": CONFIRMATION_RETURN_SECONDS_DEFAULT,
        "attendance_reset_mode": ATTENDANCE_RESET_MODE_DEFAULT,
        "attendance_reset_daily_time": time.min,
        "attendance_reset_rolling_hours": ATTENDANCE_RESET_ROLLING_HOURS_DEFAULT,
        "attendance_reset_rolling_minutes": ATTENDANCE_RESET_ROLLING_MINUTES_DEFAULT,
        "manual_reset_at": None,
    }


def ensure_group_kiosk_settings(group):
    """Return the Group's KioskSettings, creating defaults if needed."""
    existing = KioskSettings.objects.filter(group=group).first()
    if existing is not None:
        return existing
    defaults = default_kiosk_settings_for_group(group)
    settings_obj, _created = KioskSettings.objects.get_or_create(
        group=group,
        defaults=defaults,
    )
    return settings_obj


def ensure_group_kiosk_design(group):
    """
    Return the Group's KioskDesign, creating a theme-mapped default if needed.
    """
    existing = KioskDesign.objects.filter(group=group).first()
    if existing is not None:
        return existing
    from kiosk_builder.config_schema import (
        default_config_for_classic,
        default_config_for_modern,
    )

    title = group.kiosk_title or group.name or ""
    theme = getattr(group, "kiosk_theme", "classic") or "classic"
    if theme == "modern":
        config = default_config_for_modern(title)
    else:
        config = default_config_for_classic(title)
    design, _created = KioskDesign.objects.get_or_create(
        group=group,
        defaults={
            "organization_id": group.organization_id,
            "config": config,
        },
    )
    return design
