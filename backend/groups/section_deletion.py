"""
Permanent deletion of an archived Class (GroupSection).

Normal `.delete()` archives. This path removes the Class and its
participation rows while leaving Group-level ActionRecord history intact.
"""

import logging

from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.db import transaction

from accounts.deletion import hard_delete_queryset
from attendance.models import ActionRecord
from groups.models import (
    GroupMembership,
    GroupOnlyParticipant,
    GroupSection,
    GroupSectionStatus,
)

logger = logging.getLogger("groups.section_deletion")


class PermanentSectionDeletionError(ValidationError):
    """Raised when a Class cannot be permanently deleted."""


def _file_name(field_file):
    return getattr(field_file, "name", "") or ""


def _collect_file_names(queryset, field_name):
    names = []
    for instance in queryset.iterator():
        name = _file_name(getattr(instance, field_name, None))
        if name:
            names.append(name)
    return names


def _delete_storage_files(names):
    for name in names:
        try:
            if name and default_storage.exists(name):
                default_storage.delete(name)
        except Exception:
            logger.warning("Could not delete media file %s", name)


def permanently_delete_section(section):
    """
    Irreversibly delete an archived Class in its Structured Group.

    Membership and Group-only participant rows for the Class are removed.
    ActionRecords stay at the parent Group; participant FKs are cleared
    where needed. Class historical identity remains via ActionRecord
    `source_section_id` and `class_name_snapshot` (live `section` SET_NULL).
    """
    if section is None or not getattr(section, "pk", None):
        raise PermanentSectionDeletionError("Class not found.")
    if section.status != GroupSectionStatus.ARCHIVED:
        raise PermanentSectionDeletionError(
            "Archive this Class before permanently deleting."
        )

    section_id = section.pk
    group_id = section.group_id
    organization_id = section.organization_id
    memberships = GroupMembership.objects.filter(section_id=section_id)
    participants = GroupOnlyParticipant.objects.filter(section_id=section_id)

    media_names = []
    media_names.extend(_collect_file_names(memberships, "override_photo"))
    media_names.extend(_collect_file_names(participants, "photo"))

    with transaction.atomic():
        participant_ids = list(participants.values_list("pk", flat=True))
        ActionRecord.objects.filter(group_only_participant_id__in=participant_ids).update(
            group_only_participant=None
        )
        hard_delete_queryset(memberships)
        hard_delete_queryset(participants)
        hard_delete_queryset(GroupSection.objects.filter(pk=section_id))

    _delete_storage_files(media_names)
    logger.info(
        "Permanently deleted section_id=%s group_id=%s organization_id=%s",
        section_id,
        group_id,
        organization_id,
    )
    return {
        "section_id": section_id,
        "group_id": group_id,
        "organization_id": organization_id,
    }
