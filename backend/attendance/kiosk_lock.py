"""
App-session kiosk lock for the Check Station cookie session.

Starting a Group kiosk from a browser session marks that Check Station app
session as kiosk-locked. Workspace pages and APIs stay denied until the
owner/staff exits with password reauthentication.

This lock lives only on the Check Station app session cookie. It does not
use the isolated Django /admin/ session, and it does not replicate to other
browsers or devices.
"""

from rest_framework.authentication import SessionAuthentication

from groups.models import Group, GroupStatus
from organizations.permissions import get_active_workspace_organization

SESSION_KIOSK_LOCKED = "kiosk_locked"
SESSION_KIOSK_GROUP_ID = "kiosk_group_id"


def uses_cookie_session_auth(request):
    """True when DRF authenticated this request via the app session cookie."""
    return isinstance(
        getattr(request, "successful_authenticator", None),
        SessionAuthentication,
    )


def is_kiosk_locked(request):
    return bool(request.session.get(SESSION_KIOSK_LOCKED))


def locked_group_id(request):
    if not is_kiosk_locked(request):
        return None
    raw = request.session.get(SESSION_KIOSK_GROUP_ID)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def lock_kiosk_session(request, group_id):
    """
    Mark the current Check Station app session as kiosk-locked.

    HTTP Basic API clients are left alone so existing machine-style kiosk
    tests and non-browser callers do not inherit a browser lock.
    """
    if not uses_cookie_session_auth(request):
        return
    request.session[SESSION_KIOSK_LOCKED] = True
    request.session[SESSION_KIOSK_GROUP_ID] = int(group_id)
    request.session.modified = True


def clear_kiosk_lock(request):
    request.session.pop(SESSION_KIOSK_LOCKED, None)
    request.session.pop(SESSION_KIOSK_GROUP_ID, None)
    request.session.modified = True


def kiosk_group_is_operable(user, group_id):
    organization = get_active_workspace_organization(user)
    if organization is None or group_id is None:
        return False
    return (
        Group.objects.filter(
            pk=group_id,
            organization=organization,
        )
        .exclude(status=GroupStatus.ARCHIVED)
        .exists()
    )


def kiosk_status_payload(request):
    locked = is_kiosk_locked(request)
    group_id = locked_group_id(request) if locked else None
    available = False
    user = getattr(request, "user", None)
    if locked and group_id and getattr(user, "is_authenticated", False):
        available = kiosk_group_is_operable(user, group_id)
    return {
        "kiosk_locked": locked,
        "kiosk_group_id": group_id,
        "kiosk_available": available,
    }


def attach_kiosk_status(request, payload):
    payload.update(kiosk_status_payload(request))
    return payload
