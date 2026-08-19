import re
import secrets

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

WORKSPACE_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
WORKSPACE_ID_LENGTH = 6
WORKSPACE_ID_PATTERN = rf"^[{WORKSPACE_ID_ALPHABET}]{{{WORKSPACE_ID_LENGTH}}}$"
WORKSPACE_ID_GENERATION_ATTEMPTS = 32


def generate_workspace_id():
    return "".join(
        secrets.choice(WORKSPACE_ID_ALPHABET) for _ in range(WORKSPACE_ID_LENGTH)
    )


def normalize_workspace_id(value):
    if not value:
        return ""
    return re.sub(r"[\s-]", "", str(value)).upper()


class OrganizationStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    ARCHIVED = "archived", "Archived"


class WorkspaceStaffRole(models.TextChoices):
    ADMIN = "admin", "Admin"
    STAFF = "staff", "Staff"


class WorkspaceStaffStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"


class OrganizationQuerySet(models.QuerySet):
    def delete(self):
        now = timezone.now()
        updated = self.exclude(status=OrganizationStatus.ARCHIVED).update(
            status=OrganizationStatus.ARCHIVED,
            archived_at=now,
        )
        return updated, {self.model._meta.label: updated}


class OrganizationManager(models.Manager.from_queryset(OrganizationQuerySet)):
    def create_with_owner(self, *, owner, internal_label=""):
        """Create a workspace owned by one paying customer User."""
        return self.create(owner=owner, internal_label=internal_label)


class Organization(models.Model):
    """
    Internal tenant/workspace boundary.

    Owned by exactly one paying accounts.User. Not a customer-facing
    business name. Customer-created admin/staff logins are
    WorkspaceStaffAccount rows. Archive instead of deleting.
    """

    workspace_id = models.CharField(
        max_length=WORKSPACE_ID_LENGTH,
        unique=True,
        editable=False,
        help_text=(
            "System-generated immutable Workspace ID. Used for workspace "
            "staff/admin login, not by the paying owner."
        ),
    )
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="owned_organization",
    )
    internal_label = models.CharField(
        max_length=150,
        blank=True,
        default="",
        help_text="Optional admin/support label. Not a customer-facing workspace name.",
    )
    status = models.CharField(
        max_length=20,
        choices=OrganizationStatus.choices,
        default=OrganizationStatus.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    objects = OrganizationManager()

    class Meta:
        ordering = ["workspace_id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=OrganizationStatus.values),
                name="organizations_organization_status_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(workspace_id__regex=WORKSPACE_ID_PATTERN),
                name="organizations_workspace_id_format",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "created_at"]),
        ]

    def __str__(self):
        if self.internal_label:
            return f"{self.workspace_id} ({self.internal_label})"
        return self.workspace_id

    def save(self, *args, **kwargs):
        self.internal_label = (self.internal_label or "").strip()
        self.workspace_id = normalize_workspace_id(self.workspace_id)
        self._prevent_workspace_id_change()
        if not self.workspace_id:
            self.workspace_id = self._unused_workspace_id()
        if self.status == OrganizationStatus.ARCHIVED:
            if self.archived_at is None:
                self.archived_at = timezone.now()
        else:
            self.archived_at = None
        super().save(*args, **kwargs)

    def archive(self):
        if self.status == OrganizationStatus.ARCHIVED:
            return
        self.status = OrganizationStatus.ARCHIVED
        self.save(update_fields=["status", "archived_at", "updated_at"])

    def delete(self, using=None, keep_parents=False):
        self.archive()

    def _prevent_workspace_id_change(self):
        if not self.pk:
            return
        previous = (
            Organization.objects.filter(pk=self.pk)
            .values_list("workspace_id", flat=True)
            .first()
        )
        if previous and self.workspace_id != previous:
            raise ValidationError("Workspace ID cannot be changed.")

    def _unused_workspace_id(self):
        for _ in range(WORKSPACE_ID_GENERATION_ATTEMPTS):
            candidate = generate_workspace_id()
            if not Organization.objects.filter(workspace_id=candidate).exists():
                return candidate
        raise ValidationError("Could not generate a unique Workspace ID.")


class WorkspaceStaffAccountQuerySet(models.QuerySet):
    def delete(self):
        count = 0
        for account in self:
            account.deactivate()
            count += 1
        return count, {self.model._meta.label: count}


class WorkspaceStaffAccountManager(models.Manager.from_queryset(WorkspaceStaffAccountQuerySet)):
    def create_account(self, *, organization, username, password, role, email=""):
        account = self.model(
            organization=organization,
            username=username,
            email=email,
            role=role,
            status=WorkspaceStaffStatus.ACTIVE,
        )
        account.set_password(password)
        account.save()
        return account


class WorkspaceStaffAccount(models.Model):
    """
    Customer-created workspace admin/staff login, scoped to one Organization.

    This is not accounts.User, not the paying owner, and not a Member.
    Username uniqueness is per Organization only.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.PROTECT,
        related_name="staff_accounts",
    )
    username = models.CharField(
        max_length=150,
        help_text="Login username unique within this workspace only.",
    )
    email = models.EmailField(blank=True, default="")
    password = models.CharField(max_length=128)
    role = models.CharField(max_length=20, choices=WorkspaceStaffRole.choices)
    status = models.CharField(
        max_length=20,
        choices=WorkspaceStaffStatus.choices,
        default=WorkspaceStaffStatus.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)

    objects = WorkspaceStaffAccountManager()

    class Meta:
        ordering = ["organization_id", "username"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "username"],
                name="unique_staff_username_per_organization",
            ),
            models.UniqueConstraint(
                fields=["organization", "email"],
                condition=models.Q(email__gt=""),
                name="unique_staff_email_per_organization",
            ),
            models.CheckConstraint(
                condition=models.Q(role__in=WorkspaceStaffRole.values),
                name="organizations_staff_role_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=WorkspaceStaffStatus.values),
                name="organizations_staff_status_valid",
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "status"]),
        ]

    def __str__(self):
        return f"{self.username} ({self.role}) — {self.organization.workspace_id}"

    @property
    def is_authenticated(self):
        return True

    @property
    def is_active(self):
        """
        Django auth compatibility for `login()` / auth middleware.

        Workspace staff can be deactivated without affecting Members/history.
        """
        return self.status == WorkspaceStaffStatus.ACTIVE

    @property
    def is_anonymous(self):
        return False

    def get_username(self):
        # Used by Django's auth session machinery.
        return self.username

    def set_password(self, raw_password):
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password)

    def save(self, *args, **kwargs):
        # Django's user_logged_in signal calls save(update_fields=["last_login"]).
        # This model is not AbstractBaseUser and has no last_login field.
        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            filtered = [field for field in update_fields if field != "last_login"]
            if not filtered:
                return
            kwargs["update_fields"] = filtered

        self.username = self._normalized_username(self.username)
        self.email = self._normalized_email(self.email)
        self._validate_username()
        self._prevent_organization_move()
        self._sync_deactivated_at()
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        self.username = self._normalized_username(self.username)
        self.email = self._normalized_email(self.email)
        self._validate_username()
        self._prevent_organization_move()

    def deactivate(self):
        if self.status == WorkspaceStaffStatus.INACTIVE:
            return
        self.status = WorkspaceStaffStatus.INACTIVE
        self.save(update_fields=["status", "deactivated_at", "updated_at"])

    def delete(self, using=None, keep_parents=False):
        self.deactivate()

    def _sync_deactivated_at(self):
        if self.status == WorkspaceStaffStatus.INACTIVE:
            if self.deactivated_at is None:
                self.deactivated_at = timezone.now()
        else:
            self.deactivated_at = None

    def _prevent_organization_move(self):
        if not self.pk:
            return
        previous_organization_id = (
            WorkspaceStaffAccount.objects.filter(pk=self.pk)
            .values_list("organization_id", flat=True)
            .first()
        )
        if (
            previous_organization_id
            and self.organization_id != previous_organization_id
        ):
            raise ValidationError(
                "Workspace staff accounts cannot move between Organizations."
            )

    def _validate_username(self):
        if not self.username:
            raise ValidationError("Username is required.")

    @staticmethod
    def _normalized_username(username):
        if not username:
            return ""
        return username.strip().lower()

    @staticmethod
    def _normalized_email(email):
        if not email:
            return ""
        return email.strip().lower()
