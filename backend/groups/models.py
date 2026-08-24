from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from core.images import is_uncommitted_file, optimize_uploaded_image
from groups.templates import validate_notification_template
from members.models import MemberStatus, member_is_operationally_active, validate_member_pin


def group_membership_photo_upload_to(instance, filename):
    organization_id = instance.organization_id or "unknown"
    return f"groups/{organization_id}/memberships/{instance.pk or 'new'}.jpg"


def group_only_participant_photo_upload_to(instance, filename):
    organization_id = instance.organization_id or "unknown"
    return f"groups/{organization_id}/participants/{instance.pk or 'new'}.jpg"


MAX_BREAKS_CHOICES = (1, 2, 3)


class GroupStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    ARCHIVED = "archived", "Archived"


class GroupType(models.TextChoices):
    STANDARD = "standard", "Standard"
    STRUCTURED = "structured", "Structured"


class GroupSectionStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    ARCHIVED = "archived", "Archived"


def group_is_operationally_active(group):
    """True when the Group may be used in kiosk and attendance flows."""
    return bool(group) and group.status == GroupStatus.ACTIVE


def group_is_structured(group):
    return bool(group) and group.group_type == GroupType.STRUCTURED


def group_is_standard(group):
    return bool(group) and group.group_type == GroupType.STANDARD


def member_list_kiosk_mode_allowed(*, check_in_enabled, check_out_enabled, breaks_enabled):
    if breaks_enabled:
        return False
    return (check_in_enabled and not check_out_enabled) or (
        check_out_enabled and not check_in_enabled
    )


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
    def operational(self):
        return self.filter(status=GroupStatus.ACTIVE)

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
    Reusable participation and activity configuration.

    A Group is not a folder of people and not a Member-profile requirements
    form. Creating a Group automatically gives it kiosk capability.
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
    group_type = models.CharField(
        max_length=20,
        choices=GroupType.choices,
        default=GroupType.STANDARD,
        help_text=(
            "standard: participants belong directly to the Group. "
            "structured: participants belong to Classes (GroupSection) "
            "inside the Group. Immutable after creation."
        ),
    )
    require_class_pin = models.BooleanField(
        default=False,
        help_text=(
            "Structured Groups only. When enabled, Classes require a PIN "
            "for future kiosk class entry. Stored now; kiosk behavior deferred."
        ),
    )

    check_in_enabled = models.BooleanField(default=True)
    check_out_enabled = models.BooleanField(default=False)
    breaks_enabled = models.BooleanField(default=False)
    max_breaks = models.PositiveSmallIntegerField(null=True, blank=True)

    automatic_check_in_enabled = models.BooleanField(
        default=False,
        help_text=(
            "Deprecated. Automatic check-in was removed from the customer "
            "product. Column retained for migration compatibility only."
        ),
    )
    automatic_check_in_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Deprecated with automatic_check_in_enabled.",
    )

    require_email = models.BooleanField(
        default=False,
        help_text=(
            "When enabled, every operational Group participant must have a "
            "Group-specific participation email."
        ),
    )
    require_photo = models.BooleanField(
        default=False,
        help_text=(
            "Deprecated compatibility field. Not a Group basic setting. "
            "Kept until kiosk/participation identification is redesigned."
        ),
    )
    require_check_in_identifier = models.BooleanField(
        default=False,
        help_text=(
            "Deprecated compatibility field. Not a Group basic setting. "
            "Kept until kiosk/participation identification is redesigned."
        ),
    )
    require_pin = models.BooleanField(
        default=False,
        help_text=(
            "When enabled, every operational Group participant must have a "
            "Group-specific participation PIN (attendance check-in code)."
        ),
    )

    send_email_after_check_in = models.BooleanField(default=False)
    check_in_email_template = models.TextField(blank=True, default="")
    send_email_after_check_out = models.BooleanField(default=False)
    check_out_email_template = models.TextField(blank=True, default="")
    send_email_after_break = models.BooleanField(default=False)
    break_email_template = models.TextField(blank=True, default="")
    forward_emails = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "Optional Group-level forwarding recipients (max 3). "
            "After-action emails also send private copies to these addresses. "
            "Not part of GroupEmailSender credentials."
        ),
    )
    email_sender_mode = models.CharField(
        max_length=20,
        choices=EmailSenderMode.choices,
        default=EmailSenderMode.PLATFORM,
        help_text=(
            "Deprecated. Group outgoing email uses GroupEmailSender. "
            "Platform Resend remains for account emails only."
        ),
    )

    # Kiosk behavior fields remain here until the Kiosk product cleanup.
    # Every Group is kiosk-capable; there is no customer-facing enable toggle.
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
                condition=models.Q(group_type__in=GroupType.values),
                name="groups_group_type_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(email_sender_mode__in=EmailSenderMode.values),
                name="groups_email_sender_mode_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(breaks_enabled=False)
                | models.Q(max_breaks__in=list(MAX_BREAKS_CHOICES)),
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
                condition=models.Q(kiosk_mode__in=KioskMode.values),
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

    def restore(self):
        if self.status != GroupStatus.ARCHIVED:
            return
        self.status = GroupStatus.ACTIVE
        self.save(update_fields=["status", "archived_at", "updated_at"])

    def delete(self, using=None, keep_parents=False):
        self.archive()

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self._prevent_organization_move()
        self._prevent_group_type_change()
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
        from groups.forward_emails import normalize_forward_emails

        self.check_in_email_template = validate_notification_template(
            self.check_in_email_template
        )
        self.check_out_email_template = validate_notification_template(
            self.check_out_email_template
        )
        self.break_email_template = validate_notification_template(
            self.break_email_template
        )
        self.forward_emails = normalize_forward_emails(self.forward_emails)
        if not self.email_sender_mode:
            self.email_sender_mode = EmailSenderMode.PLATFORM
        if not self.group_type:
            self.group_type = GroupType.STANDARD
        if self.group_type != GroupType.STRUCTURED:
            self.require_class_pin = False
        # Automatic check-in removed from the product; keep columns inert.
        self.automatic_check_in_enabled = False
        self.automatic_check_in_time = None
        if self.kiosk_mode == KioskMode.MEMBER_LIST and not member_list_kiosk_mode_allowed(
            check_in_enabled=self.check_in_enabled,
            check_out_enabled=self.check_out_enabled,
            breaks_enabled=self.breaks_enabled,
        ):
            # Creating/editing Group actions must not require a kiosk-mode
            # picker. Invalid member-list configs become input mode.
            self.kiosk_mode = KioskMode.INPUT

    def _validate_configuration(self):
        errors = {}
        if self.group_type not in GroupType.values:
            errors["group_type"] = "Invalid Group type."
        if self.breaks_enabled and self.max_breaks not in MAX_BREAKS_CHOICES:
            errors["max_breaks"] = (
                "Maximum breaks must be 1, 2, or 3 when breaks are enabled."
            )
        # Kiosk input-field shape validation stays until the Kiosk cleanup.
        # Group participation require_email/require_pin are independent and
        # must not be coupled to kiosk_input_field selection here.
        if self.kiosk_mode == KioskMode.MEMBER_LIST:
            if not member_list_kiosk_mode_allowed(
                check_in_enabled=self.check_in_enabled,
                check_out_enabled=self.check_out_enabled,
                breaks_enabled=self.breaks_enabled,
            ):
                errors["kiosk_mode"] = (
                    "Member list mode is only available for Groups with exactly "
                    "one manual action: either check-in only or check-out only, "
                    "and with breaks off."
                )
        elif self.kiosk_mode == KioskMode.INPUT:
            non_pin_fields = {self.kiosk_input_field_1, self.kiosk_input_field_2} - {
                "",
                KioskIdentifierField.PIN,
            }
            if not non_pin_fields:
                errors["kiosk_input_field_1"] = (
                    "PIN cannot be the only kiosk identification field."
                )
            if self.kiosk_input_field_2 and self.kiosk_input_field_1 == self.kiosk_input_field_2:
                errors["kiosk_input_field_2"] = "Select two different identification fields."
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

    def _prevent_group_type_change(self):
        if not self.pk:
            return
        previous_type = (
            Group.objects.filter(pk=self.pk).values_list("group_type", flat=True).first()
        )
        if previous_type and previous_type != self.group_type:
            raise ValidationError(
                {
                    "group_type": (
                        "Group type cannot be changed after creation."
                    )
                }
            )


class GroupSectionQuerySet(models.QuerySet):
    def operational(self):
        return self.filter(
            status=GroupSectionStatus.ACTIVE,
            group__status=GroupStatus.ACTIVE,
        )

    def delete(self):
        now = timezone.now()
        updated = self.exclude(status=GroupSectionStatus.ARCHIVED).update(
            status=GroupSectionStatus.ARCHIVED,
            archived_at=now,
        )
        return updated, {self.model._meta.label: updated}


class GroupSectionManager(models.Manager.from_queryset(GroupSectionQuerySet)):
    def create_section(self, *, group, name, **extra_fields):
        section = self.model(group=group, name=name, **extra_fields)
        section.save()
        return section


class GroupSection(models.Model):
    """
    Child section inside a Structured Group.

    Product label is currently **Class**. Backend name stays generic so
    later labels (Department, Team, Section) can reuse the same entity.
    """

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="group_sections",
    )
    group = models.ForeignKey(
        Group,
        on_delete=models.PROTECT,
        related_name="sections",
    )
    name = models.CharField(max_length=150)
    class_pin = models.CharField(
        max_length=12,
        blank=True,
        default="",
        help_text=(
            "Low-security Class PIN for Structured kiosk Class entry when "
            "the parent Group has require_class_pin enabled. Not a password."
        ),
    )
    status = models.CharField(
        max_length=20,
        choices=GroupSectionStatus.choices,
        default=GroupSectionStatus.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    objects = GroupSectionManager()

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=GroupSectionStatus.values),
                name="groups_section_status_valid",
            ),
            models.UniqueConstraint(
                Lower("name"),
                models.F("group"),
                condition=models.Q(status=GroupSectionStatus.ACTIVE),
                name="unique_active_section_name_per_group",
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["group", "status"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.group})"

    @property
    def has_class_pin(self):
        return bool((self.class_pin or "").strip())

    def set_class_pin(self, raw_pin):
        pin = validate_member_pin(raw_pin)
        self.class_pin = pin

    def clear_class_pin(self):
        self.class_pin = ""

    def check_class_pin(self, raw_pin):
        stored = (self.class_pin or "").strip()
        if not stored:
            return False
        return str(raw_pin or "") == stored

    def archive(self):
        if self.status == GroupSectionStatus.ARCHIVED:
            return
        self.status = GroupSectionStatus.ARCHIVED
        self.save(update_fields=["status", "archived_at", "updated_at"])

    def restore(self):
        if self.status != GroupSectionStatus.ARCHIVED:
            return
        self.status = GroupSectionStatus.ACTIVE
        self.save(update_fields=["status", "archived_at", "updated_at"])

    def delete(self, using=None, keep_parents=False):
        self.archive()

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.class_pin = (self.class_pin or "").strip()
        if self.group_id:
            self.organization_id = self.group.organization_id
        self._assert_structured_group()
        self._assert_same_workspace()
        if not self.name:
            raise ValidationError({"name": "Class name is required."})
        if self.status == GroupSectionStatus.ARCHIVED:
            if self.archived_at is None:
                self.archived_at = timezone.now()
        else:
            self.archived_at = None
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        self.name = (self.name or "").strip()
        if self.group_id:
            self.organization_id = self.group.organization_id
        self._assert_structured_group()
        self._assert_same_workspace()

    def _assert_structured_group(self):
        if not self.group_id:
            return
        if self.group.group_type != GroupType.STRUCTURED:
            raise ValidationError(
                {"group": "Classes can only belong to Structured Groups."}
            )

    def _assert_same_workspace(self):
        if not self.group_id:
            return
        if self.organization_id and self.organization_id != self.group.organization_id:
            raise ValidationError(
                "Classes must belong to the Group's workspace."
            )


class GroupMembershipQuerySet(models.QuerySet):
    def operational(self):
        """
        Memberships that may be used in Group, kiosk, and attendance flows.

        The GroupMembership row can remain after a Member is archived so
        Restore reactivates the same relationship. Operational queries must
        still require an active Member. Structured participation also requires
        an active Class (section).
        """
        return self.filter(
            status=GroupMembershipStatus.ACTIVE,
            member__status=MemberStatus.ACTIVE,
            group__status=GroupStatus.ACTIVE,
        ).filter(
            models.Q(
                group__group_type=GroupType.STANDARD,
                section__isnull=True,
            )
            | models.Q(
                group__group_type=GroupType.STRUCTURED,
                section__isnull=False,
                section__status=GroupSectionStatus.ACTIVE,
            )
        )

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
    section = models.ForeignKey(
        GroupSection,
        on_delete=models.PROTECT,
        related_name="memberships",
        null=True,
        blank=True,
        help_text=(
            "Required for Structured Groups (Class). Must be null for "
            "Standard Groups."
        ),
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
    group_participant_code = models.CharField(max_length=20, blank=True, default="")
    participation_email = models.EmailField(
        blank=True,
        default="",
        help_text=(
            "Deprecated scalar mirror of participation_emails[0]. "
            "Prefer participation_emails."
        ),
    )
    participation_emails = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "Up to 3 Group participation notification emails. "
            "Independent of Member profile email."
        ),
    )
    participation_pin = models.CharField(max_length=12, blank=True, default="")
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
            models.UniqueConstraint(
                fields=["group", "group_participant_code"],
                condition=~models.Q(group_participant_code=""),
                name="unique_group_membership_participant_code",
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
        from groups.participation_emails import (
            participation_emails_for_membership,
            primary_participation_email,
        )

        primary = primary_participation_email(
            participation_emails_for_membership(self)
        )
        if primary:
            return primary
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
    def has_participation_pin(self):
        return bool((self.participation_pin or "").strip()) or self.has_override_pin

    @property
    def has_effective_photo(self):
        return self.has_override_photo or self.member.has_photo

    @property
    def has_effective_pin(self):
        return self.has_participation_pin or self.member.has_pin

    @property
    def is_operational(self):
        if (
            self.status != GroupMembershipStatus.ACTIVE
            or not member_is_operationally_active(self.member)
            or not group_is_operationally_active(self.group)
        ):
            return False
        if self.group.group_type == GroupType.STANDARD:
            return self.section_id is None
        if self.group.group_type == GroupType.STRUCTURED:
            return (
                self.section_id is not None
                and self.section.status == GroupSectionStatus.ACTIVE
            )
        return False

    def set_participation_pin(self, raw_pin):
        pin = validate_member_pin(raw_pin)
        self.participation_pin = pin
        self.override_pin_hash = ""

    def clear_participation_pin(self):
        self.participation_pin = ""
        self.override_pin_hash = ""

    def set_override_pin(self, raw_pin):
        """Legacy hash storage; prefer set_participation_pin for new data."""
        pin = validate_member_pin(raw_pin)
        self.participation_pin = pin
        self.override_pin_hash = ""

    def clear_override_pin(self):
        self.clear_participation_pin()

    def check_effective_pin(self, raw_pin):
        entered = str(raw_pin or "")
        if self.participation_pin:
            return entered == self.participation_pin
        if self.override_pin_hash:
            return check_password(entered, self.override_pin_hash)
        return self.member.check_pin(raw_pin)

    def deactivate(self):
        if self.status == GroupMembershipStatus.INACTIVE:
            return
        self.status = GroupMembershipStatus.INACTIVE
        self.save(update_fields=["status", "deactivated_at", "updated_at"])

    def delete(self, using=None, keep_parents=False):
        self.deactivate()

    def save(self, *args, **kwargs):
        from groups.participant_codes import assign_group_participant_code

        self.override_name = (self.override_name or "").strip()
        self.override_email = self._normalized_email(self.override_email)
        from groups.participation_emails import (
            normalize_participation_emails,
            primary_participation_email,
        )

        emails = normalize_participation_emails(
            getattr(self, "participation_emails", None) or []
        )
        if not emails:
            legacy = self._normalized_email(self.participation_email)
            if legacy:
                # Promote scalar-only writes (legacy API / tests).
                emails = [legacy]
        self.participation_emails = emails
        self.participation_email = primary_participation_email(emails)
        self.participation_pin = (self.participation_pin or "").strip()
        self.override_check_in_identifier = (
            self.override_check_in_identifier or ""
        ).strip()
        if self.group_id:
            self.organization_id = self.group.organization_id
        self._assert_same_workspace()
        self._assert_section_rules()
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
        is_create = self.pk is None
        super().save(*args, **kwargs)
        if is_create or not self.group_participant_code:
            assign_group_participant_code(self, model_class=GroupMembership)
            super().save(update_fields=["group_participant_code", "updated_at"])

    def clean(self):
        super().clean()
        if self.group_id:
            self.organization_id = self.group.organization_id
        self._assert_same_workspace()
        self._assert_section_rules()

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

    def _assert_section_rules(self):
        if not self.group_id:
            return
        group = self.group
        if group.group_type == GroupType.STANDARD:
            if self.section_id is not None:
                raise ValidationError(
                    {"section": "Standard Groups cannot assign Classes."}
                )
            return
        if group.group_type == GroupType.STRUCTURED:
            if self.section_id is None:
                raise ValidationError(
                    {"section": "Structured Group participants must belong to a Class."}
                )
            if self.section.group_id != group.pk:
                raise ValidationError(
                    {"section": "Class must belong to this Group."}
                )
            if self.section.organization_id != group.organization_id:
                raise ValidationError(
                    {"section": "Class must belong to this workspace."}
                )

    @staticmethod
    def _normalized_email(email):
        if not email:
            return ""
        return email.strip().lower()


class GroupOnlyParticipantQuerySet(models.QuerySet):
    def operational(self):
        return self.filter(
            status=GroupOnlyParticipantStatus.ACTIVE,
            group__status=GroupStatus.ACTIVE,
        ).filter(
            models.Q(
                group__group_type=GroupType.STANDARD,
                section__isnull=True,
            )
            | models.Q(
                group__group_type=GroupType.STRUCTURED,
                section__isnull=False,
                section__status=GroupSectionStatus.ACTIVE,
            )
        )

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
    section = models.ForeignKey(
        GroupSection,
        on_delete=models.PROTECT,
        related_name="group_only_participants",
        null=True,
        blank=True,
        help_text=(
            "Required for Structured Groups (Class). Must be null for "
            "Standard Groups."
        ),
    )
    name = models.CharField(max_length=150)
    email = models.EmailField(
        blank=True,
        default="",
        help_text=(
            "Deprecated scalar mirror of participation_emails[0]. "
            "Prefer participation_emails."
        ),
    )
    participation_emails = models.JSONField(
        default=list,
        blank=True,
        help_text="Up to 3 Group participation notification emails for this visitor.",
    )
    photo = models.ImageField(
        upload_to=group_only_participant_photo_upload_to,
        blank=True,
    )
    date_of_birth = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=32, blank=True, default="")
    check_in_identifier = models.CharField(max_length=80, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    group_participant_code = models.CharField(max_length=20, blank=True, default="")
    participation_pin = models.CharField(max_length=12, blank=True, default="")
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
            models.UniqueConstraint(
                fields=["group", "group_participant_code"],
                condition=~models.Q(group_participant_code=""),
                name="unique_group_only_participant_code",
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
        return bool((self.participation_pin or "").strip()) or bool(self.pin_hash)

    @property
    def has_photo(self):
        return bool(self.photo)

    def set_participation_pin(self, raw_pin):
        pin = validate_member_pin(raw_pin)
        self.participation_pin = pin
        self.pin_hash = ""

    def clear_participation_pin(self):
        self.participation_pin = ""
        self.pin_hash = ""

    def set_pin(self, raw_pin):
        self.set_participation_pin(raw_pin)

    def clear_pin(self):
        self.clear_participation_pin()

    def check_pin(self, raw_pin):
        entered = str(raw_pin or "")
        if self.participation_pin:
            return entered == self.participation_pin
        if not self.pin_hash:
            return False
        return check_password(entered, self.pin_hash)

    def archive(self):
        if self.status == GroupOnlyParticipantStatus.ARCHIVED:
            return
        self.status = GroupOnlyParticipantStatus.ARCHIVED
        self.save(update_fields=["status", "archived_at", "updated_at"])

    def delete(self, using=None, keep_parents=False):
        self.archive()

    def save(self, *args, **kwargs):
        from groups.participant_codes import assign_group_participant_code
        from groups.participation_emails import (
            normalize_participation_emails,
            primary_participation_email,
        )

        self.name = (self.name or "").strip()
        emails = normalize_participation_emails(
            getattr(self, "participation_emails", None) or []
        )
        if not emails:
            legacy = self._normalized_email(self.email)
            if legacy:
                emails = [legacy]
        self.participation_emails = emails
        self.email = primary_participation_email(emails)
        self.participation_pin = (self.participation_pin or "").strip()
        self.phone = (self.phone or "").strip()
        self.check_in_identifier = (self.check_in_identifier or "").strip()
        self.notes = (self.notes or "").strip()
        if self.group_id:
            self.organization_id = self.group.organization_id
        self._assert_same_workspace()
        self._assert_section_rules()
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
        is_create = self.pk is None
        super().save(*args, **kwargs)
        if is_create or not self.group_participant_code:
            assign_group_participant_code(self, model_class=GroupOnlyParticipant)
            super().save(update_fields=["group_participant_code", "updated_at"])

    def clean(self):
        super().clean()
        self.name = (self.name or "").strip()
        if self.group_id:
            self.organization_id = self.group.organization_id
        self._assert_same_workspace()
        self._assert_section_rules()

    def _assert_same_workspace(self):
        if not self.group_id:
            return
        if self.organization_id and self.organization_id != self.group.organization_id:
            raise ValidationError(
                "Group-only participants must belong to the Group's workspace."
            )

    def _assert_section_rules(self):
        if not self.group_id:
            return
        group = self.group
        if group.group_type == GroupType.STANDARD:
            if self.section_id is not None:
                raise ValidationError(
                    {"section": "Standard Groups cannot assign Classes."}
                )
            return
        if group.group_type == GroupType.STRUCTURED:
            if self.section_id is None:
                raise ValidationError(
                    {"section": "Structured Group participants must belong to a Class."}
                )
            if self.section.group_id != group.pk:
                raise ValidationError(
                    {"section": "Class must belong to this Group."}
                )
            if self.section.organization_id != group.organization_id:
                raise ValidationError(
                    {"section": "Class must belong to this workspace."}
                )

    @staticmethod
    def _normalized_email(email):
        if not email:
            return ""
        return email.strip().lower()


# Register email-sender models with the groups app for migrations/admin.
from groups.email_sender_models import GroupEmailDelivery, GroupEmailSender  # noqa: E402,F401
