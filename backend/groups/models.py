from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from core.images import is_uncommitted_file, optimize_uploaded_image
from groups.templates import validate_notification_template
from members.models import validate_member_pin


def group_membership_photo_upload_to(instance, filename):
    organization_id = instance.organization_id or "unknown"
    return f"groups/{organization_id}/memberships/{instance.pk or 'new'}.jpg"


def group_only_participant_photo_upload_to(instance, filename):
    organization_id = instance.organization_id or "unknown"
    return f"groups/{organization_id}/participants/{instance.pk or 'new'}.jpg"


class GroupStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    ARCHIVED = "archived", "Archived"


class GroupMembershipStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"


class GroupOnlyParticipantStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    ARCHIVED = "archived", "Archived"


class EmailSenderMode(models.TextChoices):
    PLATFORM = "platform", "Platform email"
    CUSTOM = "custom", "Custom company sender"


class KioskMode(models.TextChoices):
    MEMBER_LIST = "member_list", "Member list"
    INPUT = "input", "Input mode"


class KioskTheme(models.TextChoices):
    CLASSIC = "classic", "Classic"
    MODERN = "modern", "Modern"


class KioskIdentifierField(models.TextChoices):
    NAME = "name", "Name"
    EMAIL = "email", "Email"
    IDENTIFIER = "identifier", "Member identifier"
    PIN = "pin", "PIN"


class GroupQuerySet(models.QuerySet):
    def delete(self):
        now = timezone.now()
        updated = self.exclude(status=GroupStatus.ARCHIVED).update(
            status=GroupStatus.ARCHIVED,
            archived_at=now,
        )
        return updated, {self.model._meta.label: updated}


class GroupManager(models.Manager.from_queryset(GroupQuerySet)):
    def create_group(self, *, organization, name, **extra_fields):
        group = self.model(organization=organization, name=name, **extra_fields)
        group.save()
        return group


class Group(models.Model):
    """
    Long-lived reusable participation and check-in context.

    A Group is not a folder of people. It stores the configuration later
    Action Records and Kiosks will use. This slice does not create those.
    """

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="groups",
    )
    name = models.CharField(max_length=150)
    status = models.CharField(
        max_length=20,
        choices=GroupStatus.choices,
        default=GroupStatus.ACTIVE,
    )

    check_in_enabled = models.BooleanField(default=True)
    check_out_enabled = models.BooleanField(default=False)
    breaks_enabled = models.BooleanField(default=False)
    max_breaks = models.PositiveSmallIntegerField(null=True, blank=True)

    automatic_check_in_enabled = models.BooleanField(default=False)
    automatic_check_in_time = models.TimeField(null=True, blank=True)

    require_email = models.BooleanField(default=False)
    require_photo = models.BooleanField(default=False)
    require_check_in_identifier = models.BooleanField(default=False)
    require_pin = models.BooleanField(default=False)

    send_email_after_check_in = models.BooleanField(default=False)
    check_in_email_template = models.TextField(blank=True, default="")
    send_email_after_check_out = models.BooleanField(default=False)
    check_out_email_template = models.TextField(blank=True, default="")
    send_email_after_break = models.BooleanField(default=False)
    break_email_template = models.TextField(blank=True, default="")
    email_sender_mode = models.CharField(
        max_length=20,
        choices=EmailSenderMode.choices,
        default=EmailSenderMode.PLATFORM,
    )

    # Kiosk configuration (Group-owned, one configuration per Group for this slice)
    kiosk_enabled = models.BooleanField(default=False)
    kiosk_mode = models.CharField(
        max_length=30,
        choices=KioskMode.choices,
        default=KioskMode.MEMBER_LIST,
    )
    kiosk_theme = models.CharField(
        max_length=30,
        choices=KioskTheme.choices,
        default=KioskTheme.CLASSIC,
    )
    kiosk_title = models.CharField(max_length=150, blank=True, default="")
    kiosk_welcome_text = models.TextField(blank=True, default="")
    kiosk_success_message = models.TextField(blank=True, default="")
    kiosk_confirmation_message = models.TextField(blank=True, default="")
    kiosk_return_delay_seconds = models.PositiveSmallIntegerField(default=5)

    # Member list mode: which safe fields to show on participant cards
    kiosk_list_show_name = models.BooleanField(default=True)
    kiosk_list_show_photo = models.BooleanField(default=True)
    kiosk_list_show_identifier = models.BooleanField(default=False)
    kiosk_list_show_email = models.BooleanField(default=False)

    # Input mode: chosen identification input fields (1 or 2)
    kiosk_input_field_1 = models.CharField(
        max_length=30,
        choices=KioskIdentifierField.choices,
        blank=True,
        default="name",
    )
    kiosk_input_field_2 = models.CharField(
        max_length=30,
        choices=KioskIdentifierField.choices,
        blank=True,
        default="",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    objects = GroupManager()

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=GroupStatus.values),
                name="groups_group_status_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(email_sender_mode__in=EmailSenderMode.values),
                name="groups_email_sender_mode_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(breaks_enabled=False) | models.Q(max_breaks__gte=1),
                name="groups_max_breaks_required_when_enabled",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(automatic_check_in_enabled=False)
                    | models.Q(automatic_check_in_time__isnull=False)
                ),
                name="groups_automatic_check_in_time_required_when_enabled",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(automatic_check_in_enabled=False)
                    | models.Q(check_in_enabled=False)
                ),
                name="groups_automatic_check_in_only_when_manual_off",
            ),
            models.UniqueConstraint(
                Lower("name"),
                models.F("organization"),
                condition=models.Q(status=GroupStatus.ACTIVE),
                name="unique_active_group_name_per_organization",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(kiosk_enabled=False)
                    | models.Q(kiosk_mode__in=KioskMode.values)
                ),
                name="groups_kiosk_mode_valid",
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "status"]),
        ]

    def __str__(self):
        return self.name

    def archive(self):
        if self.status == GroupStatus.ARCHIVED:
            return
        self.status = GroupStatus.ARCHIVED
        self.save(update_fields=["status", "archived_at", "updated_at"])

    def delete(self, using=None, keep_parents=False):
        self.archive()

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self._prevent_organization_move()
        self._normalize_configuration()
        self._validate_configuration()
        if not self.name:
            raise ValidationError({"name": "Group name is required."})
        if self.status == GroupStatus.ARCHIVED:
            if self.archived_at is None:
                self.archived_at = timezone.now()
        else:
            self.archived_at = None
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        self.name = (self.name or "").strip()
        self._normalize_configuration()
        self._validate_configuration()

    def _normalize_configuration(self):
        self.check_in_email_template = validate_notification_template(
            self.check_in_email_template
        )
        self.check_out_email_template = validate_notification_template(
            self.check_out_email_template
        )
        self.break_email_template = validate_notification_template(
            self.break_email_template
        )
        if not self.email_sender_mode:
            self.email_sender_mode = EmailSenderMode.PLATFORM

    def _validate_configuration(self):
        errors = {}
        if self.breaks_enabled and (self.max_breaks is None or self.max_breaks < 1):
            errors["max_breaks"] = "Maximum breaks must be at least 1 when breaks are enabled."
        if self.automatic_check_in_enabled:
            if self.check_in_enabled:
                errors["automatic_check_in_enabled"] = (
                    "Automatic check-in can only be enabled when manual check-in is off."
                )
            if self.automatic_check_in_time is None:
                errors["automatic_check_in_time"] = (
                    "Automatic check-in time is required when automatic check-in is enabled."
                )

        # Kiosk validation
        if self.kiosk_enabled:
            if self.kiosk_mode == KioskMode.MEMBER_LIST:
                if self.breaks_enabled:
                    errors["kiosk_mode"] = "Member list mode is not available when breaks are enabled."
                if not ((self.check_in_enabled and not self.check_out_enabled) or (self.check_out_enabled and not self.check_in_enabled)):
                    errors["kiosk_mode"] = (
                        "Member list mode is only available for Groups with exactly one manual action: either check-in only or check-out only."
                    )
            elif self.kiosk_mode == KioskMode.INPUT:
                # Ensure at least one non-pin field is present so PIN is never the sole identifier.
                non_pin_fields = {self.kiosk_input_field_1, self.kiosk_input_field_2} - {"" , KioskIdentifierField.PIN}
                if not non_pin_fields:
                    errors["kiosk_input_field_1"] = "PIN cannot be the only kiosk identification field."

                # If PIN is required for the Group participation context, it must be included.
                if self.require_pin and KioskIdentifierField.PIN not in {self.kiosk_input_field_1, self.kiosk_input_field_2}:
                    errors["kiosk_input_field_1"] = "This Group requires a PIN for kiosk identification, but PIN is not selected."

                # Field 2 is optional but must not duplicate field 1.
                if self.kiosk_input_field_2 and self.kiosk_input_field_1 == self.kiosk_input_field_2:
                    errors["kiosk_input_field_2"] = "Select two different identification fields."

                # Sanity: field 1 must be set.
                if not self.kiosk_input_field_1:
                    errors["kiosk_input_field_1"] = "Select at least one identification field."

        if errors:
            raise ValidationError(errors)

    def _prevent_organization_move(self):
        if not self.pk:
            return
        previous_organization_id = (
            Group.objects.filter(pk=self.pk)
            .values_list("organization_id", flat=True)
            .first()
        )
        if previous_organization_id and self.organization_id != previous_organization_id:
            raise ValidationError("Groups cannot move between Organizations.")


class GroupMembershipQuerySet(models.QuerySet):
    def delete(self):
        count = 0
        for membership in self:
            membership.deactivate()
            count += 1
        return count, {self.model._meta.label: count}


class GroupMembership(models.Model):
    """
    Attachment of a reusable Member to one Group.

    Group-specific override values win over canonical Member values.
    Overrides never write back to the Member record.
    """

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="group_memberships",
    )
    group = models.ForeignKey(
        Group,
        on_delete=models.PROTECT,
        related_name="memberships",
    )
    member = models.ForeignKey(
        "members.Member",
        on_delete=models.PROTECT,
        related_name="group_memberships",
    )
    override_name = models.CharField(max_length=150, blank=True, default="")
    override_email = models.EmailField(blank=True, default="")
    override_photo = models.ImageField(
        upload_to=group_membership_photo_upload_to,
        blank=True,
    )
    override_check_in_identifier = models.CharField(
        max_length=80,
        blank=True,
        default="",
    )
    override_pin_hash = models.CharField(max_length=128, blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=GroupMembershipStatus.choices,
        default=GroupMembershipStatus.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)

    objects = models.Manager.from_queryset(GroupMembershipQuerySet)()

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["group", "member"],
                name="unique_member_per_group",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=GroupMembershipStatus.values),
                name="groups_membership_status_valid",
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["group", "status"]),
        ]

    def __str__(self):
        return f"{self.member} in {self.group}"

    @property
    def display_name(self):
        return self.effective_name

    @property
    def effective_name(self):
        return self.override_name.strip() or self.member.name

    @property
    def effective_email(self):
        return (self.override_email or "").strip() or self.member.email

    @property
    def effective_check_in_identifier(self):
        return (
            self.override_check_in_identifier.strip()
            or self.member.check_in_identifier
        )

    @property
    def has_override_photo(self):
        return bool(self.override_photo)

    @property
    def has_override_pin(self):
        return bool(self.override_pin_hash)

    @property
    def has_effective_photo(self):
        return self.has_override_photo or self.member.has_photo

    @property
    def has_effective_pin(self):
        return self.has_override_pin or self.member.has_pin

    def set_override_pin(self, raw_pin):
        pin = validate_member_pin(raw_pin)
        self.override_pin_hash = make_password(pin)

    def clear_override_pin(self):
        self.override_pin_hash = ""

    def check_effective_pin(self, raw_pin):
        if self.override_pin_hash:
            return check_password(str(raw_pin or ""), self.override_pin_hash)
        return self.member.check_pin(raw_pin)

    def deactivate(self):
        if self.status == GroupMembershipStatus.INACTIVE:
            return
        self.status = GroupMembershipStatus.INACTIVE
        self.save(update_fields=["status", "deactivated_at", "updated_at"])

    def delete(self, using=None, keep_parents=False):
        self.deactivate()

    def save(self, *args, **kwargs):
        self.override_name = (self.override_name or "").strip()
        self.override_email = self._normalized_email(self.override_email)
        self.override_check_in_identifier = (
            self.override_check_in_identifier or ""
        ).strip()
        if self.group_id:
            self.organization_id = self.group.organization_id
        self._assert_same_workspace()
        if self.status == GroupMembershipStatus.INACTIVE:
            if self.deactivated_at is None:
                self.deactivated_at = timezone.now()
        else:
            self.deactivated_at = None
        if is_uncommitted_file(self.override_photo):
            stem = f"membership-{self.member_id}"
            self.override_photo = optimize_uploaded_image(
                self.override_photo,
                stem=stem,
            )
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        if self.group_id:
            self.organization_id = self.group.organization_id
        self._assert_same_workspace()

    def _assert_same_workspace(self):
        if not self.group_id or not self.member_id:
            return
        group_organization_id = self.group.organization_id
        member_organization_id = self.member.organization_id
        if group_organization_id != member_organization_id:
            raise ValidationError(
                "Members can only join Groups in the same workspace."
            )
        if self.organization_id and self.organization_id != group_organization_id:
            raise ValidationError(
                "Group memberships cannot span Organizations."
            )

    @staticmethod
    def _normalized_email(email):
        if not email:
            return ""
        return email.strip().lower()


class GroupOnlyParticipantQuerySet(models.QuerySet):
    def delete(self):
        now = timezone.now()
        updated = self.exclude(status=GroupOnlyParticipantStatus.ARCHIVED).update(
            status=GroupOnlyParticipantStatus.ARCHIVED,
            archived_at=now,
        )
        return updated, {self.model._meta.label: updated}


class GroupOnlyParticipant(models.Model):
    """
    Person who exists only inside one Group.

    Not a reusable Member. Creating this record must not create a Member.
    """

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="group_only_participants",
    )
    group = models.ForeignKey(
        Group,
        on_delete=models.PROTECT,
        related_name="group_only_participants",
    )
    name = models.CharField(max_length=150)
    email = models.EmailField(blank=True, default="")
    photo = models.ImageField(
        upload_to=group_only_participant_photo_upload_to,
        blank=True,
    )
    date_of_birth = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=32, blank=True, default="")
    check_in_identifier = models.CharField(max_length=80, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    pin_hash = models.CharField(max_length=128, blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=GroupOnlyParticipantStatus.choices,
        default=GroupOnlyParticipantStatus.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    objects = models.Manager.from_queryset(GroupOnlyParticipantQuerySet)()

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=GroupOnlyParticipantStatus.values),
                name="groups_only_participant_status_valid",
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["group", "status"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.group})"

    @property
    def display_name(self):
        return self.name

    @property
    def has_pin(self):
        return bool(self.pin_hash)

    @property
    def has_photo(self):
        return bool(self.photo)

    def set_pin(self, raw_pin):
        pin = validate_member_pin(raw_pin)
        self.pin_hash = make_password(pin)

    def clear_pin(self):
        self.pin_hash = ""

    def check_pin(self, raw_pin):
        if not self.pin_hash:
            return False
        return check_password(str(raw_pin or ""), self.pin_hash)

    def archive(self):
        if self.status == GroupOnlyParticipantStatus.ARCHIVED:
            return
        self.status = GroupOnlyParticipantStatus.ARCHIVED
        self.save(update_fields=["status", "archived_at", "updated_at"])

    def delete(self, using=None, keep_parents=False):
        self.archive()

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.email = self._normalized_email(self.email)
        self.phone = (self.phone or "").strip()
        self.check_in_identifier = (self.check_in_identifier or "").strip()
        self.notes = (self.notes or "").strip()
        if self.group_id:
            self.organization_id = self.group.organization_id
        self._assert_same_workspace()
        if not self.name:
            raise ValidationError({"name": "Name is required."})
        if self.status == GroupOnlyParticipantStatus.ARCHIVED:
            if self.archived_at is None:
                self.archived_at = timezone.now()
        else:
            self.archived_at = None
        if is_uncommitted_file(self.photo):
            stem = f"participant-{self.group_id}-{self.name}"
            self.photo = optimize_uploaded_image(self.photo, stem=stem)
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        self.name = (self.name or "").strip()
        if self.group_id:
            self.organization_id = self.group.organization_id
        self._assert_same_workspace()

    def _assert_same_workspace(self):
        if not self.group_id:
            return
        if self.organization_id and self.organization_id != self.group.organization_id:
            raise ValidationError(
                "Group-only participants must belong to the Group's workspace."
            )

    @staticmethod
    def _normalized_email(email):
        if not email:
            return ""
        return email.strip().lower()
