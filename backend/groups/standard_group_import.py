"""One-time snapshot import: Standard Group participants → Structured Class."""

from dataclasses import dataclass

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from groups.models import (
    Group,
    GroupMembership,
    GroupOnlyParticipant,
    GroupSection,
    GroupStatus,
    GroupType,
)
from groups.readiness import group_setup_status_payload
from members.models import validate_member_pin


class StandardGroupImportError(Exception):
    """Raised for validation failures during Standard → Class import."""

    def __init__(self, *, code, detail, field_errors=None):
        self.code = code
        self.detail = detail
        self.field_errors = field_errors or {}
        super().__init__(detail)


@dataclass
class StandardGroupImportResult:
    section: GroupSection
    source_group_id: int
    source_group_name: str
    members_copied: int
    visitors_copied: int
    members_skipped: int
    readiness: dict

    @property
    def participants_copied(self):
        return self.members_copied + self.visitors_copied


def list_standard_import_sources(*, organization, destination_group):
    """
    Active Standard Groups in the same workspace (excluding the destination).

    Archived Groups are not importable — matches normal operational listing.
    """
    if destination_group.group_type != GroupType.STRUCTURED:
        raise StandardGroupImportError(
            code="destination_not_structured",
            detail="Only Structured Groups can import a Standard Group as a Class.",
        )
    return (
        Group.objects.filter(
            organization=organization,
            group_type=GroupType.STANDARD,
            status=GroupStatus.ACTIVE,
        )
        .exclude(pk=destination_group.pk)
        .order_by("name", "id")
    )


def import_standard_group_as_class(
    *,
    organization,
    destination_group,
    source_group_id,
    name=None,
    class_pin=None,
):
    """
    Create a Class and snapshot-copy operational participants from a Standard Group.

    Atomic: Class + all copied participations succeed together or roll back.
    Members already in the destination Structured Group are skipped (unique_member_per_group).
    """
    if destination_group.organization_id != organization.id:
        raise StandardGroupImportError(
            code="destination_wrong_workspace",
            detail="Destination Group was not found in this workspace.",
        )
    if destination_group.group_type != GroupType.STRUCTURED:
        raise StandardGroupImportError(
            code="destination_not_structured",
            detail="Only Structured Groups can import a Standard Group as a Class.",
        )
    if destination_group.status != GroupStatus.ACTIVE:
        raise StandardGroupImportError(
            code="destination_inactive",
            detail="Archived Groups cannot add Classes.",
        )

    source = Group.objects.filter(
        pk=source_group_id,
        organization=organization,
    ).first()
    if source is None:
        raise StandardGroupImportError(
            code="source_not_found",
            detail="Source Group was not found in this workspace.",
            field_errors={"source_group_id": "Source Group was not found."},
        )
    if source.group_type != GroupType.STANDARD:
        raise StandardGroupImportError(
            code="source_not_standard",
            detail="Only Standard Groups can be copied as a Class.",
            field_errors={"source_group_id": "Source must be a Standard Group."},
        )
    if source.status != GroupStatus.ACTIVE:
        raise StandardGroupImportError(
            code="source_inactive",
            detail="Archived Groups cannot be copied as a Class.",
            field_errors={"source_group_id": "Source Group is archived."},
        )

    class_name = (name or "").strip() or source.name.strip()
    if not class_name:
        raise StandardGroupImportError(
            code="invalid_name",
            detail="Class name is required.",
            field_errors={"name": "Class name is required."},
        )

    pin_value = None
    if class_pin not in (None, ""):
        try:
            pin_value = validate_member_pin(class_pin)
        except ValidationError as exc:
            raise StandardGroupImportError(
                code="invalid_class_pin",
                detail="Class PIN is invalid.",
                field_errors={"class_pin": list(exc.messages)},
            ) from exc

    try:
        with transaction.atomic():
            section = GroupSection.objects.create_section(
                group=destination_group,
                organization=organization,
                name=class_name,
            )
            if pin_value:
                section.set_class_pin(pin_value)
                section.save(update_fields=["class_pin", "updated_at"])

            already_in_destination = set(
                GroupMembership.objects.filter(
                    organization=organization,
                    group=destination_group,
                ).values_list("member_id", flat=True)
            )

            members_copied = 0
            members_skipped = 0
            for membership in (
                GroupMembership.objects.filter(
                    organization=organization,
                    group=source,
                )
                .operational()
                .select_related("member")
                .order_by("id")
            ):
                if membership.member_id in already_in_destination:
                    members_skipped += 1
                    continue
                new_membership = GroupMembership(
                    organization=organization,
                    group=destination_group,
                    member=membership.member,
                    section=section,
                    override_name=membership.override_name or "",
                    participation_email=membership.participation_email or "",
                    participation_pin=(membership.participation_pin or "").strip(),
                    status=membership.status,
                )
                new_membership.save()
                already_in_destination.add(membership.member_id)
                members_copied += 1

            visitors_copied = 0
            for visitor in (
                GroupOnlyParticipant.objects.filter(
                    organization=organization,
                    group=source,
                )
                .operational()
                .order_by("id")
            ):
                new_visitor = GroupOnlyParticipant(
                    organization=organization,
                    group=destination_group,
                    section=section,
                    name=visitor.name,
                    email=visitor.email or "",
                    participation_pin=(visitor.participation_pin or "").strip(),
                    phone=visitor.phone or "",
                    notes="",
                    check_in_identifier="",
                )
                new_visitor.save()
                visitors_copied += 1

            return StandardGroupImportResult(
                section=section,
                source_group_id=source.id,
                source_group_name=source.name,
                members_copied=members_copied,
                visitors_copied=visitors_copied,
                members_skipped=members_skipped,
                readiness=group_setup_status_payload(destination_group),
            )
    except ValidationError as exc:
        raise StandardGroupImportError(
            code="validation_error",
            detail="Could not create the Class from this Group.",
            field_errors=getattr(exc, "message_dict", {"detail": exc.messages}),
        ) from exc
    except IntegrityError as exc:
        raise StandardGroupImportError(
            code="class_name_conflict",
            detail="A Class with this name already exists in this Group.",
            field_errors={"name": "A Class with this name already exists in this Group."},
        ) from exc
