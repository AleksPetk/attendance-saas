import re
import secrets

from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from core.images import is_uncommitted_file, optimize_uploaded_image

MEMBER_INTERNAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
MEMBER_INTERNAL_CODE_LENGTH = 6
MEMBER_INTERNAL_CODE_PREFIX = "MBR"
MEMBER_INTERNAL_CODE_PATTERN = (
    rf"^{MEMBER_INTERNAL_CODE_PREFIX}-"
    rf"[{MEMBER_INTERNAL_CODE_ALPHABET}]{{{MEMBER_INTERNAL_CODE_LENGTH}}}$"
)
MEMBER_INTERNAL_CODE_GENERATION_ATTEMPTS = 32
PIN_MIN_LENGTH = 4
PIN_MAX_LENGTH = 12


def generate_member_internal_code():
    body = "".join(
        secrets.choice(MEMBER_INTERNAL_CODE_ALPHABET)
        for _ in range(MEMBER_INTERNAL_CODE_LENGTH)
    )
    return f"{MEMBER_INTERNAL_CODE_PREFIX}-{body}"


def validate_member_pin(raw_pin):
    pin = str(raw_pin or "").strip()
    if not pin:
        raise ValidationError({"pin": "PIN cannot be empty."})
    if not re.fullmatch(r"[0-9A-Za-z]+", pin):
        raise ValidationError({"pin": "PIN may contain only letters and numbers."})
    if len(pin) < PIN_MIN_LENGTH or len(pin) > PIN_MAX_LENGTH:
        raise ValidationError(
            {
                "pin": (
                    f"PIN must be between {PIN_MIN_LENGTH} and "
                    f"{PIN_MAX_LENGTH} characters."
                )
            }
        )
    return pin


def member_photo_upload_to(instance, filename):
    organization_id = instance.organization_id or "unknown"
    code = instance.internal_code or "pending"
    return f"members/{organization_id}/{code}.jpg"


class MemberStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    ARCHIVED = "archived", "Archived"


class MemberQuerySet(models.QuerySet):
    def delete(self):
        now = timezone.now()
        updated = self.exclude(status=MemberStatus.ARCHIVED).update(
            status=MemberStatus.ARCHIVED,
            archived_at=now,
        )
        return updated, {self.model._meta.label: updated}


class MemberManager(models.Manager.from_queryset(MemberQuerySet)):
    def create_member(self, *, organization, name, pin="", **extra_fields):
        member = self.model(organization=organization, name=name, **extra_fields)
        if pin:
            member.set_pin(pin)
        member.save()
        return member


class Member(models.Model):
    """
    Reusable tracked person owned by one Organization workspace.

    This is not accounts.User and not a WorkspaceStaffAccount. Members do
    not access the workspace. Name is required; other profile fields are
    optional and only become mandatory in a Group participation context.
    """

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="members",
    )
    internal_code = models.CharField(
        max_length=10,
        unique=True,
        editable=False,
        help_text="Automatically generated immutable internal Member code.",
    )
    name = models.CharField(max_length=150)
    email = models.EmailField(blank=True, default="")
    photo = models.ImageField(upload_to=member_photo_upload_to, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=32, blank=True, default="")
    check_in_identifier = models.CharField(
        max_length=80,
        blank=True,
        default="",
        help_text="Optional customer-entered identifier, e.g. STUDENT-123.",
    )
    notes = models.TextField(blank=True, default="")
    pin_hash = models.CharField(max_length=128, blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=MemberStatus.choices,
        default=MemberStatus.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    objects = MemberManager()

    class Meta:
        ordering = ["name", "internal_code"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=MemberStatus.values),
                name="members_member_status_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(internal_code__regex=MEMBER_INTERNAL_CODE_PATTERN),
                name="members_internal_code_format",
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["organization", "name"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.internal_code})"

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
        if self.status == MemberStatus.ARCHIVED:
            return
        self.status = MemberStatus.ARCHIVED
        self.save(update_fields=["status", "archived_at", "updated_at"])

    def delete(self, using=None, keep_parents=False):
        self.archive()

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.email = self._normalized_email(self.email)
        self.phone = (self.phone or "").strip()
        self.check_in_identifier = (self.check_in_identifier or "").strip()
        self.notes = (self.notes or "").strip()
        self._prevent_internal_code_change()
        self._prevent_organization_move()
        if not self.internal_code:
            self.internal_code = self._unused_internal_code()
        if not self.name:
            raise ValidationError({"name": "Name is required."})
        if self.status == MemberStatus.ARCHIVED:
            if self.archived_at is None:
                self.archived_at = timezone.now()
        else:
            self.archived_at = None
        if is_uncommitted_file(self.photo):
            self.photo = optimize_uploaded_image(
                self.photo,
                stem=self.internal_code,
            )
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        self.name = (self.name or "").strip()
        if not self.name:
            raise ValidationError({"name": "Name is required."})
        self._prevent_organization_move()

    def _prevent_internal_code_change(self):
        if not self.pk:
            return
        previous = (
            Member.objects.filter(pk=self.pk)
            .values_list("internal_code", flat=True)
            .first()
        )
        if previous and self.internal_code != previous:
            raise ValidationError("Internal Member code cannot be changed.")

    def _prevent_organization_move(self):
        if not self.pk:
            return
        previous_organization_id = (
            Member.objects.filter(pk=self.pk)
            .values_list("organization_id", flat=True)
            .first()
        )
        if previous_organization_id and self.organization_id != previous_organization_id:
            raise ValidationError("Members cannot move between Organizations.")

    def _unused_internal_code(self):
        for _ in range(MEMBER_INTERNAL_CODE_GENERATION_ATTEMPTS):
            candidate = generate_member_internal_code()
            if not Member.objects.filter(internal_code=candidate).exists():
                return candidate
        raise ValidationError("Could not generate a unique internal Member code.")

    @staticmethod
    def _normalized_email(email):
        if not email:
            return ""
        return email.strip().lower()
