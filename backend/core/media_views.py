"""
Authenticated media serving for production-safe local file storage.

Member and Group photos use guessable paths (org id + member id). They must
not be world-readable via a blanket nginx /media/ alias. Kiosk logos and
backgrounds also require a workspace session (or kiosk lock) so they are not
anonymous public assets.

DEBUG no longer mounts django.conf.urls.static for /media/; this view is the
single media entry point in all environments.
"""

import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse, HttpResponseForbidden, HttpResponseNotModified
from django.utils.http import http_date, parse_http_date_safe
from django.views import View

from attendance.kiosk_lock import is_kiosk_locked, locked_group_id
from groups.models import Group
from organizations.permissions import get_active_workspace_organization


def _media_etag(path: Path) -> str:
    stat = path.stat()
    return f'W/"{stat.st_mtime_ns}-{stat.st_size}"'


def _media_last_modified(path: Path) -> str:
    return http_date(path.stat().st_mtime)


def _normalize_etag(value: str) -> str:
    value = value.strip()
    if value.startswith("W/"):
        value = value[2:].strip()
    if value.startswith('"') and value.endswith('"') and len(value) >= 2:
        value = value[1:-1]
    return value


def _if_none_match_matches(header_value: str | None, etag: str) -> bool:
    if not header_value:
        return False
    candidates = [part.strip() for part in header_value.split(",") if part.strip()]
    if "*" in candidates:
        return True
    target = _normalize_etag(etag)
    return any(_normalize_etag(candidate) == target for candidate in candidates)


def _not_modified_since(header_value: str | None, path: Path) -> bool:
    if not header_value:
        return False
    since = parse_http_date_safe(header_value)
    if since is None:
        return False
    return int(path.stat().st_mtime) <= int(since)

_ORG_PATH_PREFIXES = (
    "members/",
    "groups/",
    "kiosks/",
)


def _safe_media_path(relative_path: str) -> Path | None:
    if not relative_path or "\\" in relative_path:
        return None
    if relative_path.startswith("/") or ".." in Path(relative_path).parts:
        return None
    root = Path(settings.MEDIA_ROOT).resolve()
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def _organization_id_from_media_path(relative_path: str):
    for prefix in _ORG_PATH_PREFIXES:
        if not relative_path.startswith(prefix):
            continue
        rest = relative_path[len(prefix) :]
        org_part = rest.split("/", 1)[0]
        try:
            return int(org_part)
        except (TypeError, ValueError):
            return None
    return None


def user_may_access_media(request, relative_path: str) -> bool:
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return False

    org_id = _organization_id_from_media_path(relative_path)
    if org_id is None:
        return False

    try:
        organization = get_active_workspace_organization(user)
    except Exception:
        organization = None
    if organization is not None and int(organization.pk) == int(org_id):
        return True

    if is_kiosk_locked(request):
        group_id = locked_group_id(request)
        if group_id is None:
            return False
        return Group.objects.filter(
            pk=group_id,
            organization_id=org_id,
        ).exists()

    return False


class ProtectedMediaView(View):
    """Serve MEDIA_ROOT files only to authorized workspace/kiosk sessions."""

    def get(self, request, relative_path):
        return self._serve(request, relative_path, head_only=False)

    def head(self, request, relative_path):
        return self._serve(request, relative_path, head_only=True)

    def _serve(self, request, relative_path, *, head_only):
        relative_path = (relative_path or "").lstrip("/")
        path = _safe_media_path(relative_path)
        if path is None or not path.is_file():
            raise Http404()
        if not user_may_access_media(request, relative_path):
            return HttpResponseForbidden("Forbidden")

        content_type, _encoding = mimetypes.guess_type(str(path))
        content_type = content_type or "application/octet-stream"
        etag = _media_etag(path)
        last_modified = _media_last_modified(path)

        if_none_match = request.META.get("HTTP_IF_NONE_MATCH")
        if_modified_since = request.META.get("HTTP_IF_MODIFIED_SINCE")
        if _if_none_match_matches(if_none_match, etag) or (
            not if_none_match and _not_modified_since(if_modified_since, path)
        ):
            response = HttpResponseNotModified()
            response["ETag"] = etag
            response["Last-Modified"] = last_modified
            return response

        if head_only:
            response = HttpResponse(status=200, content_type=content_type)
            response["Content-Length"] = str(path.stat().st_size)
            response["ETag"] = etag
            response["Last-Modified"] = last_modified
            return response
        response = FileResponse(
            path.open("rb"),
            as_attachment=False,
            content_type=content_type,
        )
        response["ETag"] = etag
        response["Last-Modified"] = last_modified
        return response
