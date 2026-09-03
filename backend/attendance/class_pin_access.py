"""
Short-lived Class PIN verification grants for Structured kiosk flow.

Raw Class PINs must never travel in GET query strings. After a successful
POST verify-pin, the server records a session-bound grant. people / identify /
perform then check that grant instead of trusting client-supplied pin flags.
"""

import time

from groups.models import GroupType

SESSION_CLASS_PIN_GRANT = "kiosk_class_pin_grant"
# Bound to the browser session lifetime; also cleared on kiosk exit / group change.
CLASS_PIN_GRANT_TTL_SECONDS = 8 * 60 * 60


def class_pin_required_for_group(group):
    return bool(
        getattr(group, "group_type", None) == GroupType.STRUCTURED
        and getattr(group, "require_class_pin", False)
    )


def clear_class_pin_grant(request):
    if SESSION_CLASS_PIN_GRANT in request.session:
        request.session.pop(SESSION_CLASS_PIN_GRANT, None)
        request.session.modified = True


def grant_class_pin_access(request, *, organization_id, group_id, section_id):
    """Replace any prior Class grant with access to this Class only."""
    request.session[SESSION_CLASS_PIN_GRANT] = {
        "organization_id": int(organization_id),
        "group_id": int(group_id),
        "section_id": int(section_id),
        "verified_at": time.time(),
    }
    request.session.modified = True


def _grant_payload(request):
    raw = request.session.get(SESSION_CLASS_PIN_GRANT)
    if not isinstance(raw, dict):
        return None
    try:
        verified_at = float(raw.get("verified_at") or 0)
        organization_id = int(raw["organization_id"])
        group_id = int(raw["group_id"])
        section_id = int(raw["section_id"])
    except (KeyError, TypeError, ValueError):
        clear_class_pin_grant(request)
        return None
    if verified_at <= 0 or (time.time() - verified_at) > CLASS_PIN_GRANT_TTL_SECONDS:
        clear_class_pin_grant(request)
        return None
    return {
        "organization_id": organization_id,
        "group_id": group_id,
        "section_id": section_id,
        "verified_at": verified_at,
    }


def has_class_pin_access(request, *, organization_id, group_id, section_id):
    grant = _grant_payload(request)
    if grant is None:
        return False
    return (
        grant["organization_id"] == int(organization_id)
        and grant["group_id"] == int(group_id)
        and grant["section_id"] == int(section_id)
    )


def require_class_pin_access(request, *, organization_id, group_id, section_id):
    """
    Return None when access is granted, else a (payload, status) tuple for Response.
    """
    if has_class_pin_access(
        request,
        organization_id=organization_id,
        group_id=group_id,
        section_id=section_id,
    ):
        return None
    return (
        {
            "code": "class_pin_required",
            "detail": "Enter the Class PIN before continuing.",
        },
        403,
    )
