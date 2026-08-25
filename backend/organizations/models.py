import re
import secrets

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from organizations.staff_email import (
    normalize_staff_email,
    validate_staff_account_email,
)

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


class OrganizationPlan(models.TextChoices):
    BASIC = "basic", "Basic"
    PLUS = "plus", "Plus"
    BUSINESS = "business", "Business"


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
    plan = models.CharField(
        max_length=20,
        choices=OrganizationPlan.choices,
        default=OrganizationPlan.BASIC,
        db_index=True,
        help_text=(
            "Internal V1 entitlement plan (basic / plus / business). "
            "Defaults to Basic until billing updates this field. "
            "Not customer-mutable via workspace APIs."
        ),
    )
    active_standard_groups_slots_resolved = models.BooleanField(default=True)
    archived_groups_slots_resolved = models.BooleanField(default=True)
    members_slots_resolved = models.BooleanField(default=True)
    workspace_admins_slots_resolved = models.BooleanField(default=True)
    workspace_staff_slots_resolved = models.BooleanField(default=True)
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
                condition=models.Q(plan__in=OrganizationPlan.values),
                name="organizations_organization_plan_valid",
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
        previous_plan = None
        if self.pk:
            previous_plan = (
                Organization.objects.filter(pk=self.pk)
                .values_list("plan", flat=True)
                .first()
            )
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
        if previous_plan is not None and previous_plan != self.plan:
            from organizations.entitlements.plan_locks import (
                sync_plan_locks_after_plan_change,
            )

            # Safety net for instance.save(). Canonical callers should use
            # apply_effective_plan(); QuerySet.update(plan=...) still bypasses this
            # and is repaired later by ensure_plan_locks_consistent().
            sync_plan_locks_after_plan_change(self)

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
    plan_unlocked = models.BooleanField(default=True, db_index=True)
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
            models.CheckConstraint(
                condition=models.Q(role=WorkspaceStaffRole.STAFF)
                | models.Q(email__gt=""),
                name="organizations_staff_admin_requires_email",
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
        self.email = normalize_staff_email(self.email)
        self._validate_username()
        self._validate_email()
        self._prevent_organization_move()
        self._sync_deactivated_at()
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        self.username = self._normalized_username(self.username)
        self.email = normalize_staff_email(self.email)
        self._validate_username()
        self._validate_email()
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

    def _validate_email(self):
        try:
            self.email = validate_staff_account_email(
                organization=self.organization,
                role=self.role,
                email=self.email,
                exclude_pk=self.pk,
            )
        except ValidationError as exc:
            if hasattr(exc, "message_dict"):
                raise ValidationError(exc.message_dict) from exc
            raise

    @staticmethod
    def _normalized_username(username):
        if not username:
            return ""
        return username.strip().lower()


class WorkspaceStaffGroupAccess(models.Model):
    """
    Explicit Group access grant for a workspace Staff account.

    Only WorkspaceStaffAccount rows with role=staff receive assignments.
    Owner and workspace Admin have implicit access to all Groups in the org.
    """

    staff_account = models.ForeignKey(
        WorkspaceStaffAccount,
        on_delete=models.CASCADE,
        related_name="group_access",
    )
    group = models.ForeignKey(
        "groups.Group",
        on_delete=models.CASCADE,
        related_name="staff_access",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["staff_account_id", "group_id"]
        constraints = [
            models.UniqueConstraint(
                fields=["staff_account", "group"],
                name="unique_staff_group_access",
            ),
        ]
        indexes = [
            models.Index(fields=["staff_account"]),
            models.Index(fields=["group"]),
        ]

    def clean(self):
        super().clean()
        if self.staff_account.role != WorkspaceStaffRole.STAFF:
            raise ValidationError(
                "Group access assignments apply to Staff accounts only."
            )
        if self.staff_account.organization_id != self.group.organization_id:
            raise ValidationError(
                "Staff account and Group must belong to the same workspace."
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

