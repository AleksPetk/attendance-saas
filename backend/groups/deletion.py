"""
Permanent deletion of an archived Group.

Normal Group `.delete()` stays archive. This path is the exceptional
irreversible workspace action: SQL-delete the Group and related operational
rows, leave ActionRecord snapshots in place, then best-effort-remove Group
and kiosk media.
"""

import logging

from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.db import models, transaction

from accounts.deletion import hard_delete_queryset
from attendance.models import ActionRecord
from groups.email_sender_models import GroupEmailDelivery, GroupEmailSender
from groups.models import Group, GroupMembership, GroupOnlyParticipant, GroupSection, GroupStatus
from kiosk_builder.models import KioskDesign, KioskSettings

logger = logging.getLogger("groups.deletion")


class PermanentGroupDeletionError(ValidationError):
    """Raised when a Group cannot be permanently deleted."""


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


def permanently_delete_group(group):
    """
    Irreversibly delete an archived Group in its own workspace.

    GroupMembership and GroupOnlyParticipant rows are removed. KioskDesign
    and kiosk media are removed. ActionRecords stay; Group and Group-only
    participant FKs are SET_NULL and snapshot fields remain historical.
    """
    if group is None or not getattr(group, "pk", None):
        raise PermanentGroupDeletionError("Group not found.")
    if group.status != GroupStatus.ARCHIVED:
        raise PermanentGroupDeletionError(
            "Archive this Group before permanently deleting."
        )

    group_id = group.pk
    organization_id = group.organization_id
    memberships = GroupMembership.objects.filter(group_id=group_id)
    participants = GroupOnlyParticipant.objects.filter(group_id=group_id)
    sections = GroupSection.objects.filter(group_id=group_id)
    designs = KioskDesign.objects.filter(group_id=group_id)
    kiosk_settings = KioskSettings.objects.filter(group_id=group_id)
    email_senders = GroupEmailSender.objects.filter(group_id=group_id)
    email_deliveries = GroupEmailDelivery.objects.filter(group_id=group_id)

    media_names = []
    media_names.extend(_collect_file_names(memberships, "override_photo"))
    media_names.extend(_collect_file_names(participants, "photo"))
    media_names.extend(_collect_file_names(designs, "header_logo"))
    media_names.extend(_collect_file_names(designs, "footer_logo"))
    media_names.extend(_collect_file_names(designs, "main_background_image"))

    with transaction.atomic():
        # Preserve source_group_id for attendance reports after the live FK is cleared.
        ActionRecord.objects.filter(group_id=group_id, source_group_id__isnull=True).update(
            source_group_id=group_id
        )
        ActionRecord.objects.filter(group_id=group_id).update(group=None)
        participant_ids = list(participants.values_list("pk", flat=True))
        ActionRecord.objects.filter(group_only_participant_id__in=participant_ids).update(
            group_only_participant=None
        )
        # Delivery audit stays at organization scope with group SET_NULL, then
        # we hard-delete sender credentials. Detach deliveries first.
        email_deliveries.update(group=None, action_record=None)
        hard_delete_queryset(email_senders)
        hard_delete_queryset(memberships)
        hard_delete_queryset(participants)
        hard_delete_queryset(sections)
        hard_delete_queryset(designs)
        hard_delete_queryset(kiosk_settings)
        hard_delete_queryset(Group.objects.filter(pk=group_id))

    _delete_storage_files(media_names)
    logger.info(
        "Permanently deleted group_id=%s organization_id=%s",
        group_id,
        organization_id,
    )
    return {"group_id": group_id, "organization_id": organization_id}
