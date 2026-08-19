"""
Block Django admin pages until platform-operator TOTP is complete.

Runs after AuthenticationMiddleware. Uses the admin session already selected
by PlatformAdminSessionIsolationMiddleware, so customer cookies are untouched.
"""

from django.shortcuts import redirect

from accounts.two_factor import (
    RECOVERY_ONCE_KEY,
    admin_session_is_grandfathered,
    clear_pending_platform_2fa,
    has_confirmed_platform_totp,
    is_allowed_pre_2fa_admin_path,
    is_platform_operator,
    load_pending_user,
    pending_user_id,
    session_has_completed_2fa,
)
from config.session_isolation import is_platform_admin_request


def _pending_redirect(request):
    user = load_pending_user(request)
    if user is None:
        if pending_user_id(request):
            clear_pending_platform_2fa(request)
        return redirect("admin:login")
    if request.session.get(RECOVERY_ONCE_KEY):
        return redirect("two_factor:recovery_codes")
    if has_confirmed_platform_totp(user):
        return redirect("two_factor:challenge")
    return redirect("two_factor:setup")


class PlatformAdminTwoFactorMiddleware:
    """Require completed TOTP (or a grandfathered pre-2FA session) for /admin/."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not is_platform_admin_request(request):
            return self.get_response(request)

        path = request.path or ""
        if is_allowed_pre_2fa_admin_path(path):
            return self.get_response(request)

        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated and is_platform_operator(user):
            if session_has_completed_2fa(request, user) or admin_session_is_grandfathered(
                request, user
            ):
                return self.get_response(request)
            from django.contrib.auth import logout

            logout(request)
            return _pending_redirect(request)

        if pending_user_id(request):
            return _pending_redirect(request)

        return self.get_response(request)
