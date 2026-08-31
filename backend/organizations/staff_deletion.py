"""Permanent deletion for inactive workspace-scoped staff/admin logins."""

from django.contrib.sessions.models import Session
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from organizations.models import WorkspaceStaffAccount, WorkspaceStaffStatus


STAFF_SESSION_BACKEND = (
    "organizations.authentication.WorkspaceStaffSessionAuthenticationBackend"
)


class WorkspaceStaffPermanentDeletionError(ValidationError):
    """Raised when a workspace staff account is not eligible for hard deletion."""


def _invalidate_staff_sessions(staff_id):
    """Delete live browser sessions belonging to one workspace staff identity."""
    expected_id = str(staff_id)
    for session in Session.objects.filter(expire_date__gte=timezone.now()):
        data = session.get_decoded()
        if str(data.get("_auth_user_id") or "") != expected_id:
            continue
        if data.get("_auth_user_backend") != STAFF_SESSION_BACKEND:
            continue
        session.delete()


def permanently_delete_workspace_staff_account(staff_account):
    """
    Irreversibly remove one inactive WorkspaceStaffAccount and private dependents.

    The normal model/queryset delete behavior intentionally deactivates accounts.
    This explicit service is the only customer-workspace hard-delete path.
    """
    if staff_account is None or not getattr(staff_account, "pk", None):
        raise WorkspaceStaffPermanentDeletionError("Workspace account not found.")

    with transaction.atomic():
        account = (
            WorkspaceStaffAccount.objects.select_for_update()
            .filter(
                pk=staff_account.pk,
                organization_id=staff_account.organization_id,
            )
            .first()
        )
        if account is None:
            raise WorkspaceStaffPermanentDeletionError("Workspace account not found.")
        if account.status != WorkspaceStaffStatus.INACTIVE:
            raise WorkspaceStaffPermanentDeletionError(
                "Deactivate this account before deleting it permanently."
            )

        deleted = {
            "id": account.pk,
            "organization_id": account.organization_id,
            "username": account.username,
            "role": account.role,
        }
        _invalidate_staff_sessions(account.pk)

        # Bypass WorkspaceStaffAccount.delete(), whose normal safety behavior is
        # reversible deactivation. Django's collector still applies declared
        # CASCADE rules to Group access and announcement acknowledgement rows.
        models.Model.delete(account)

    return deleted
