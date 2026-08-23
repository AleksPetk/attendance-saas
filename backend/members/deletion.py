"""
Permanent deletion of an archived Member.

Normal Member `.delete()` stays archive. This path is the exceptional
irreversible workspace action: SQL-delete the Member and related
GroupMembership rows, leave ActionRecord snapshots in place, then
best-effort-remove Member media.
"""

import logging

from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.db import models, transaction

from accounts.deletion import hard_delete_queryset
from groups.models import GroupMembership
from members.models import Member, MemberStatus

logger = logging.getLogger("members.deletion")


class PermanentMemberDeletionError(ValidationError):
    """Raised when a Member cannot be permanently deleted."""


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


def permanently_delete_member(member):
    """
    Irreversibly delete an archived Member in its own workspace.

    GroupMembership rows are removed so the person is no longer attached
    to Groups. ActionRecords stay; their Member FK is SET_NULL and
    snapshot fields remain the historical identity. Photo files are
    removed best-effort after the database commit.
    """
    if member is None or not getattr(member, "pk", None):
        raise PermanentMemberDeletionError("Member not found.")
    if member.status != MemberStatus.ARCHIVED:
        raise PermanentMemberDeletionError(
            "Archive this Member before permanently deleting."
        )

    member_id = member.pk
    organization_id = member.organization_id
    memberships = GroupMembership.objects.filter(member_id=member_id)
    photo_names = []
    member_photo = _file_name(member.photo)
    if member_photo:
        photo_names.append(member_photo)
    photo_names.extend(_collect_file_names(memberships, "override_photo"))

    with transaction.atomic():
        hard_delete_queryset(memberships)
        hard_delete_queryset(Member.objects.filter(pk=member_id))

    _delete_storage_files(photo_names)
    logger.info(
        "Permanently deleted member_id=%s organization_id=%s",
        member_id,
        organization_id,
    )
    return {"member_id": member_id, "organization_id": organization_id}
