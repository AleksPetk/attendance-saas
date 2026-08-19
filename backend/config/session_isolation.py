"""
Isolate Django admin sessions from Check Station customer/workspace sessions.

Root cause: Django stores one session in one cookie (`sessionid` by default).
`login()` / `logout()` on `/api/auth/*` therefore replace or flush the same
session used by `/admin/`.

This middleware, placed immediately before SessionMiddleware and
CsrfViewMiddleware, makes `/admin/` read and write a separate cookie pair.
The browser can hold both at once. CSRF protection stays enabled; each
domain uses its own CSRF cookie so a rotate-on-login in one app cannot
invalidate the other.
"""

from django.conf import settings


def is_platform_admin_request(request):
    path = request.path or ""
    return path == "/admin" or path.startswith("/admin/")


def _copy_morsel(source, dest, *, path=None):
    for attr in (
        "expires",
        "path",
        "comment",
        "domain",
        "max-age",
        "secure",
        "httponly",
        "samesite",
        "version",
    ):
        value = source.get(attr)
        if value:
            dest[attr] = value
    if path is not None:
        dest["path"] = path


class PlatformAdminSessionIsolationMiddleware:
    """
    Swap session/CSRF cookies for Django admin requests.

    App cookies: SESSION_COOKIE_NAME / CSRF_COOKIE_NAME (path=/).
    Admin cookies: ADMIN_SESSION_COOKIE_NAME / ADMIN_CSRF_COOKIE_NAME
    (path=/admin so they are not sent to /api/).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if is_platform_admin_request(request):
            self._bind_admin_cookies_for_request(request)
        response = self.get_response(request)
        if is_platform_admin_request(request):
            self._emit_admin_cookies_on_response(response)
        return response

    def _bind_admin_cookies_for_request(self, request):
        session_name = settings.SESSION_COOKIE_NAME
        csrf_name = settings.CSRF_COOKIE_NAME
        admin_session = settings.ADMIN_SESSION_COOKIE_NAME
        admin_csrf = settings.ADMIN_CSRF_COOKIE_NAME

        if admin_session in request.COOKIES:
            request.COOKIES[session_name] = request.COOKIES[admin_session]
        else:
            request.COOKIES.pop(session_name, None)

        if admin_csrf in request.COOKIES:
            request.COOKIES[csrf_name] = request.COOKIES[admin_csrf]
        else:
            request.COOKIES.pop(csrf_name, None)

    def _emit_admin_cookies_on_response(self, response):
        admin_path = settings.ADMIN_SESSION_COOKIE_PATH
        self._rename_cookie(
            response,
            settings.SESSION_COOKIE_NAME,
            settings.ADMIN_SESSION_COOKIE_NAME,
            path=admin_path,
        )
        self._rename_cookie(
            response,
            settings.CSRF_COOKIE_NAME,
            settings.ADMIN_CSRF_COOKIE_NAME,
            path=admin_path,
        )

    def _rename_cookie(self, response, from_name, to_name, *, path):
        if from_name not in response.cookies:
            return
        source = response.cookies[from_name]
        response.cookies[to_name] = source.value
        _copy_morsel(source, response.cookies[to_name], path=path)
        del response.cookies[from_name]
