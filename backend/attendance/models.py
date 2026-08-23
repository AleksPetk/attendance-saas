from django.db import models
from django.utils import timezone

from groups.models import Group, GroupOnlyParticipant
from members.models import Member
from organizations.models import Organization


class ActionType(models.TextChoices):
    CHECK_IN = "check_in", "Check-in"
    CHECK_OUT = "check_out", "Check-out"
    BREAK_START = "break_start", "Break start"
    BREAK_END = "break_end", "Break end"


class ActionSource(models.TextChoices):
    KIOSK = "kiosk", "Kiosk"
    AUTOMATIC = "automatic", "Automatic / preset"
    OWNER = "owner", "Owner / manual"


class ActionRecord(models.Model):
    """
    Historical record created when an Attendance Action is performed.

    This slice only implements what we need for kiosk-driven check-in/out and breaks.
    It intentionally stores display snapshots so later Member/override edits don't rewrite history.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.PROTECT,
        related_name="action_records",
    )
    group = models.ForeignKey(
        Group,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="action_records",
        help_text=(
            "Live Group link. SET_NULL when a Group is permanently deleted "
            "so snapshot fields remain the historical identity."
        ),
    )
    source_group_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text=(
            "Immutable Group primary key at record creation. Survives permanent "
            "Group deletion so attendance reports can still select that Group."
        ),
    )

    participant_kind = models.CharField(
        max_length=30,
        choices=[
            ("member", "Member"),
            ("group_only_participant", "Group-only participant"),
        ],
    )
    member = models.ForeignKey(
        Member,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="action_records",
        help_text=(
            "Live Member link. SET_NULL when a Member is permanently deleted "
            "so snapshot fields remain the historical identity."
        ),
    )
    group_only_participant = models.ForeignKey(
        GroupOnlyParticipant,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="action_records",
        help_text=(
            "Live Group-only participant link. SET_NULL when that person is "
            "removed with a permanently deleted Group."
        ),
    )

    action_type = models.CharField(max_length=30, choices=ActionType.choices)
    source = models.CharField(max_length=30, choices=ActionSource.choices, default=ActionSource.KIOSK)

    performed_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    # Snapshot fields (intentionally non-sensitive)
    participant_name_snapshot = models.CharField(max_length=150)
    participant_email_snapshot = models.EmailField(blank=True, default="")
    participant_check_in_identifier_snapshot = models.CharField(
        max_length=80, blank=True, default=""
    )

    # Optional extra info for debugging / future audits (not a workflow engine)
    kiosk_note_snapshot = models.CharField(max_length=250, blank=True, default="")
    group_name_snapshot = models.CharField(max_length=150, blank=True, default="")
    group_type_snapshot = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text=(
            "Immutable Group type at record creation (standard/structured). "
            "Survives permanent Group deletion so reports know whether Class "
            "columns apply."
        ),
    )

    # Structured Group Class (GroupSection) historical identity.
    # Standard Group records leave these null/blank.
    section = models.ForeignKey(
        "groups.GroupSection",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="action_records",
        help_text=(
            "Live Class link for Structured Group actions. SET_NULL when a "
            "Class is permanently deleted so snapshot fields remain."
        ),
    )
    source_section_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text=(
            "Immutable Class (GroupSection) primary key at record creation. "
            "Survives permanent Class deletion so attendance reports can still "
            "group by historical Class identity."
        ),
    )
    class_name_snapshot = models.CharField(
        max_length=150,
        blank=True,
        default="",
        help_text=(
            "Class display name at action time. Not rewritten on rename, "
            "archive, or permanent delete."
        ),
    )

    class Meta:
        ordering = ["-performed_at", "-id"]
        indexes = [
            models.Index(fields=["organization", "group", "performed_at"]),
            models.Index(fields=["organization", "source_group_id", "performed_at"]),
            models.Index(fields=["group", "participant_kind", "performed_at"]),
            models.Index(fields=["organization", "source_section_id", "performed_at"]),
        ]

    def __str__(self):
        return f"{self.group_id} {self.action_type} {self.participant_kind} @ {self.performed_at}"

    def clean(self):
        if self.participant_kind == "member":
            if self.group_only_participant_id:
                raise models.ValidationError("Member kind cannot set group-only participant.")
            if not self.member_id and not self.pk:
                raise models.ValidationError("Member kind requires member.")
        elif self.participant_kind == "group_only_participant":
            if not self.group_only_participant_id and not self.pk:
                raise models.ValidationError(
                    "Group-only participant kind requires group_only_participant."
                )
            if self.member_id:
                raise models.ValidationError("Group-only participant kind cannot set member.")
        else:
            raise models.ValidationError("Invalid participant_kind.")

        if (
            self.group_id
            and self.organization_id
            and self.group is not None
            and self.group.organization_id != self.organization_id
        ):
            raise models.ValidationError("ActionRecord organization must match Group organization.")

    def save(self, *args, **kwargs):
        if self.group_id and not self.source_group_id:
            self.source_group_id = self.group_id
        if self.group_id and not self.group_name_snapshot:
            self.group_name_snapshot = self.group.name
        if self.group_id and not self.group_type_snapshot:
            self.group_type_snapshot = self.group.group_type
        if self.section_id and not self.source_section_id:
            self.source_section_id = self.section_id
        if self.section_id and not self.class_name_snapshot:
            self.class_name_snapshot = self.section.name
        super().save(*args, **kwargs)
