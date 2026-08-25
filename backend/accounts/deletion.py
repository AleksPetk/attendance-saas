"""
Permanent destruction of a paying customer's User + Organization workspace.

Normal `.delete()` on tenant models stays archive/deactivate. This service is
the exceptional irreversible path: it SQL-deletes tenant rows in dependency
order inside a transaction, then best-effort removes tenant media files.
"""

import logging
import shutil
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.db import models, transaction

from accounts.sessions import invalidate_owner_sessions
from attendance.models import ActionRecord
from groups.email_sender_models import GroupEmailDelivery, GroupEmailSender
from groups.models import Group, GroupMembership, GroupOnlyParticipant, GroupSection
from kiosk_builder.models import KioskDesign, KioskSettings
from members.models import Member
from organizations.models import Organization, WorkspaceStaffAccount, WorkspaceStaffGroupAccess

STAFF_BACKEND = "organizations.authentication.WorkspaceStaffSessionAuthenticationBackend"

logger = logging.getLogger("accounts.deletion")
User = get_user_model()

DELETE_CONFIRMATION_TEXT = "DELETE"


class PermanentDeletionError(ValidationError):
    """Raised when a permanent delete cannot proceed."""


def hard_delete_queryset(queryset):
    """SQL DELETE that bypasses archive/deactivate QuerySet overrides."""
    if queryset is None:
        return 0, {}
    return models.QuerySet.delete(queryset)


def _is_platform_operator(user):
    return bool(getattr(user, "is_staff", False) or getattr(user, "is_superuser", False))


def _collect_file_names(queryset, field_name):
    names = []
    for instance in queryset.iterator():
        field_file = getattr(instance, field_name, None)
        name = getattr(field_file, "name", "") or ""
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


def invalidate_staff_sessions_for_organization(organization_id):
    """Remove workspace-staff browser sessions for this tenant only."""
    from django.contrib.sessions.models import Session
    from django.utils import timezone

    staff_ids = {
        str(pk)
        for pk in WorkspaceStaffAccount.objects.filter(
            organization_id=organization_id
        ).values_list("pk", flat=True)
    }
    if not staff_ids:
        return
    now = timezone.now()
    for session in Session.objects.filter(expire_date__gte=now):
        data = session.get_decoded()
        if str(data.get("_auth_user_id") or "") not in staff_ids:
            continue
        backend = data.get("_auth_user_backend") or ""
        if backend != STAFF_BACKEND:
            continue
        session.delete()


def _delete_tenant_media_directories(organization_id):
    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or "")
    if not media_root:
        return
    try:
        media_root = media_root.resolve()
    except OSError:
        return
    for relative in (f"members/{organization_id}", f"groups/{organization_id}", f"kiosks/{organization_id}"):
        directory = media_root / relative
        try:
            resolved = directory.resolve()
            if resolved.is_dir() and media_root in resolved.parents:
                shutil.rmtree(resolved, ignore_errors=True)
        except Exception:
            logger.warning("Could not remove tenant media directory %s", directory)


def permanently_delete_customer_account(user):
    """
    Irreversibly delete a paying customer User and their owned workspace.

    Refuses platform operator accounts. Tenant isolation is enforced by
    always scoping child queries to the owned Organization id.
    """
    if user is None or not getattr(user, "pk", None):
        raise PermanentDeletionError("Account not found.")
    if _is_platform_operator(user):
        raise PermanentDeletionError(
            "Platform operator accounts cannot be permanently deleted this way."
        )

    organization = Organization.objects.filter(owner=user).first()
    organization_id = organization.pk if organization is not None else None
    user_id = user.pk
    email = user.email

    member_photos = []
    membership_photos = []
    participant_photos = []
    kiosk_logos = []
    kiosk_footer_logos = []
    kiosk_backgrounds = []
    if organization_id is not None:
        members = Member.objects.filter(organization_id=organization_id)
        memberships = GroupMembership.objects.filter(organization_id=organization_id)
        participants = GroupOnlyParticipant.objects.filter(organization_id=organization_id)
        kiosk_designs = KioskDesign.objects.filter(organization_id=organization_id)
        member_photos = _collect_file_names(members, "photo")
        membership_photos = _collect_file_names(memberships, "override_photo")
        participant_photos = _collect_file_names(participants, "photo")
        kiosk_logos = _collect_file_names(kiosk_designs, "header_logo")
        kiosk_footer_logos = _collect_file_names(kiosk_designs, "footer_logo")
        kiosk_backgrounds = _collect_file_names(kiosk_designs, "main_background_image")

    with transaction.atomic():
        invalidate_owner_sessions(user)
        if organization_id is not None:
            invalidate_staff_sessions_for_organization(organization_id)
            hard_delete_queryset(
                ActionRecord.objects.filter(organization_id=organization_id)
            )
            hard_delete_queryset(
                GroupEmailDelivery.objects.filter(organization_id=organization_id)
            )
            hard_delete_queryset(
                GroupEmailSender.objects.filter(organization_id=organization_id)
            )
            hard_delete_queryset(
                GroupMembership.objects.filter(organization_id=organization_id)
            )
            hard_delete_queryset(
                GroupOnlyParticipant.objects.filter(organization_id=organization_id)
            )
            hard_delete_queryset(
                GroupSection.objects.filter(organization_id=organization_id)
            )
            hard_delete_queryset(KioskDesign.objects.filter(organization_id=organization_id))
            hard_delete_queryset(KioskSettings.objects.filter(organization_id=organization_id))
            hard_delete_queryset(
                WorkspaceStaffGroupAccess.objects.filter(
                    staff_account__organization_id=organization_id
                )
            )
            hard_delete_queryset(Group.objects.filter(organization_id=organization_id))
            hard_delete_queryset(Member.objects.filter(organization_id=organization_id))
            hard_delete_queryset(
                WorkspaceStaffAccount.objects.filter(organization_id=organization_id)
            )
            hard_delete_queryset(Organization.objects.filter(pk=organization_id))
        user.delete()

    _delete_storage_files(
        member_photos
        + membership_photos
        + participant_photos
        + kiosk_logos
        + kiosk_footer_logos
        + kiosk_backgrounds
    )
    if organization_id is not None:
        _delete_tenant_media_directories(organization_id)

    logger.info(
        "Permanently deleted customer user_id=%s organization_id=%s",
        user_id,
        organization_id,
    )
    return {"user_id": user_id, "email": email, "organization_id": organization_id}
