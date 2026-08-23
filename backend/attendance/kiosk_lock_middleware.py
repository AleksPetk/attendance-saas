"""Deny normal workspace APIs while a Check Station app session is kiosk-locked."""

import re

from django.http import JsonResponse

from attendance.kiosk_lock import is_kiosk_locked, kiosk_status_payload, locked_group_id
from config.session_isolation import is_platform_admin_request

KIOSK_GROUP_API_RE = re.compile(
    r"^/api/groups/(?P<group_id>\d+)/kiosk(?:/identify|/perform)?$"
)


def _normalized_path(path):
    if not path:
        return "/"
    if len(path) > 1 and path.endswith("/"):
        return path[:-1]
    return path


def _locked_response(request, status=403):
    payload = kiosk_status_payload(request)
    payload["detail"] = "This Check Station session is locked in kiosk mode."
    payload["code"] = "kiosk_locked"
    return JsonResponse(payload, status=status)


def _is_allowed_during_kiosk_lock(request):
    if request.method == "OPTIONS":
        return True

    path = _normalized_path(request.path)
    method = request.method.upper()
    group_id = locked_group_id(request)

    # Uploaded media is already public when unlocked (DEBUG static serve / CDN).
    # Kiosk lock must not rewrite /media/ into JSON 403 — Header/Footer logos,
    # backgrounds, and participant photos are loaded as <img> with session cookies.
    if path.startswith("/media/") and method in {"GET", "HEAD"}:
        return True

    if path == "/api/health" and method == "GET":
        return True
    if path == "/api/auth/csrf" and method == "GET":
        return True
    if path == "/api/auth/logout" and method == "POST":
        return True
    if path == "/api/kiosk/exit" and method == "POST":
        return True
    if path == "/api/workspace" and method == "GET":
        return True

    match = KIOSK_GROUP_API_RE.match(path)
    if match and group_id is not None:
        try:
            requested_id = int(match.group("group_id"))
        except (TypeError, ValueError):
            return False
        if requested_id != group_id:
            return False
        if path.endswith("/identify") or path.endswith("/perform"):
            return method == "POST"
        return method in {"GET", "POST"}

    return False


class KioskLockMiddleware:
    """
    Enforce the kiosk lock on the Check Station app session only.

    Django /admin/ uses a different cookie and is skipped here.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if is_platform_admin_request(request):
            return self.get_response(request)
        if not is_kiosk_locked(request):
            return self.get_response(request)
        if not _is_allowed_during_kiosk_lock(request):
            return _locked_response(request)
        return self.get_response(request)
