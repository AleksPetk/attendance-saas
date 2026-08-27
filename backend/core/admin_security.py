"""Reusable platform-admin step-up password and reason helpers.

Uses request.user.check_password. Do not call the customer /api/auth/reauth/
endpoint — that uses the Check Station app session, not /admin/.
"""

from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import PermissionDenied

from core.models import PlatformAdminAction, PlatformAdminActionType

REASON_MIN_LENGTH = 10
REASON_MAX_LENGTH = 500


def require_platform_operator(request):
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        raise PermissionDenied
    if not (getattr(user, "is_staff", False) or getattr(user, "is_superuser", False)):
        raise PermissionDenied
    return user


def require_superuser(request):
    user = require_platform_operator(request)
    if not user.is_superuser:
        raise PermissionDenied
    return user


def validate_admin_password(user, password):
    if not password:
        return "Enter your current platform-admin password."
    if not user.check_password(password):
        return "That password was not correct."
    return ""


def validate_admin_reason(reason):
    text = (reason or "").strip()
    if len(text) < REASON_MIN_LENGTH:
        return "", f"Enter a reason (at least {REASON_MIN_LENGTH} characters)."
    if len(text) > REASON_MAX_LENGTH:
        return "", f"Reason must be {REASON_MAX_LENGTH} characters or fewer."
    return text, ""


def record_platform_admin_action(
    *,
    request,
    action_type,
    reason,
    target=None,
    target_kind="",
    target_id_snapshot="",
    workspace_id_snapshot="",
    owner_email_snapshot="",
    old_value="",
    new_value="",
    log_message="",
):
    actor = getattr(request, "user", None)
    if target is not None:
        target_kind = target_kind or target._meta.label
        target_id_snapshot = target_id_snapshot or str(getattr(target, "pk", "") or "")
    PlatformAdminAction.objects.create(
        action_type=action_type,
        actor=actor if getattr(actor, "pk", None) else None,
        actor_email_snapshot=getattr(actor, "email", "") or "",
        target_kind=target_kind,
        target_id_snapshot=str(target_id_snapshot or ""),
        workspace_id_snapshot=(workspace_id_snapshot or "")[:16],
        owner_email_snapshot=owner_email_snapshot or "",
        old_value=(old_value or "")[:255],
        new_value=(new_value or "")[:255],
        reason=reason,
    )
    if target is not None and log_message:
        LogEntry.objects.log_action(
            user_id=actor.pk,
            content_type_id=ContentType.objects.get_for_model(target, for_concrete_model=False).pk,
            object_id=str(target.pk),
            object_repr=str(target)[:200],
            action_flag=CHANGE,
            change_message=log_message,
        )


def confirmation_form_errors(request, *, require_typed_delete=False):
    """Validate password + reason (+ optional DELETE) from a confirmation POST."""
    user = require_platform_operator(request)
    errors = {}
    password_error = validate_admin_password(
        user, request.POST.get("admin_password")
    )
    if password_error:
        errors["admin_password"] = password_error
    reason, reason_error = validate_admin_reason(request.POST.get("reason"))
    if reason_error:
        errors["reason"] = reason_error
    if require_typed_delete:
        confirmation = (request.POST.get("confirmation") or "").strip()
        if confirmation != "DELETE":
            errors["confirmation"] = "Type DELETE to confirm."
    return user, reason, errors


# Re-export action types for callers.
ACTION = PlatformAdminActionType
