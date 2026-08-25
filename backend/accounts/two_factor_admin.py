"""Wire platform-operator TOTP into the default Django admin site."""

from django.contrib import admin
from django.contrib.admin.forms import AdminAuthenticationForm
from django.contrib.auth import REDIRECT_FIELD_NAME
from django.contrib.auth.views import LoginView
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.debug import sensitive_post_parameters

from accounts.two_factor import (
    begin_pending_platform_2fa,
    check_platform_2fa_encryption_key,
    has_confirmed_platform_totp,
    has_recent_recovery_authentication,
    is_platform_operator,
    operator_may_use_admin,
    recovery_auth_seconds_remaining,
    replacement_in_progress,
    unused_recovery_count,
)

_INSTALLED = False


def _format_remaining(seconds):
    seconds = max(0, int(seconds or 0))
    minutes, secs = divmod(seconds, 60)
    if minutes:
        return f"{minutes}m {secs:02d}s"
    return f"{secs}s"


class PlatformAdminLoginView(LoginView):
    """Accept email/password, then hold a pending-2FA session instead of login()."""

    redirect_authenticated_user = False

    @method_decorator(sensitive_post_parameters())
    @method_decorator(never_cache)
    def dispatch(self, request, *args, **kwargs):
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        user = form.get_user()
        next_url = self.get_redirect_url() or reverse("admin:index")
        if not is_platform_operator(user):
            return super().form_valid(form)
        begin_pending_platform_2fa(self.request, user, next_url=next_url)
        if has_confirmed_platform_totp(user):
            return HttpResponseRedirect(reverse("two_factor:challenge"))
        return HttpResponseRedirect(reverse("two_factor:setup"))


@never_cache
@sensitive_post_parameters()
def platform_admin_login(request, extra_context=None):
    site = admin.site
    if request.method == "GET" and operator_may_use_admin(request, request.user):
        return HttpResponseRedirect(reverse("admin:index", current_app=site.name))

    context = {
        **site.each_context(request),
        "title": "Log in",
        "subtitle": None,
        "app_path": request.get_full_path(),
        "username": request.user.get_username(),
    }
    if (
        REDIRECT_FIELD_NAME not in request.GET
        and REDIRECT_FIELD_NAME not in request.POST
    ):
        context[REDIRECT_FIELD_NAME] = reverse("admin:index", current_app=site.name)
    context.update(extra_context or {})
    defaults = {
        "extra_context": context,
        "authentication_form": site.login_form or AdminAuthenticationForm,
        "template_name": site.login_template or "admin/login.html",
    }
    request.current_app = site.name
    return PlatformAdminLoginView.as_view(**defaults)(request)


_original_each_context = None


def _each_context(request):
    context = _original_each_context(request)
    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated and is_platform_operator(user):
        if has_confirmed_platform_totp(user) or replacement_in_progress(user):
            context["platform_2fa_recovery_remaining"] = unused_recovery_count(user)
            context["platform_2fa_regenerate_url"] = reverse("two_factor:regenerate")
            context["platform_2fa_replace_url"] = reverse("two_factor:replace")
            remaining = recovery_auth_seconds_remaining(request, user)
            context["platform_2fa_recovery_auth"] = has_recent_recovery_authentication(
                request, user
            )
            context["platform_2fa_recovery_auth_seconds"] = remaining
            context["platform_2fa_recovery_auth_remaining_label"] = (
                _format_remaining(remaining)
            )
            context["platform_2fa_replacement_in_progress"] = replacement_in_progress(
                user
            )
        else:
            context["platform_2fa_recovery_remaining"] = None
            context["platform_2fa_regenerate_url"] = ""
            context["platform_2fa_replace_url"] = ""
            context["platform_2fa_recovery_auth"] = False
            context["platform_2fa_recovery_auth_seconds"] = 0
            context["platform_2fa_recovery_auth_remaining_label"] = ""
            context["platform_2fa_replacement_in_progress"] = False
    return context


def install_platform_2fa():
    global _INSTALLED, _original_each_context
    if _INSTALLED:
        return
    from django.core.checks import Tags, register

    register(check_platform_2fa_encryption_key, Tags.security)
    admin.site.login = platform_admin_login
    # Index template is owned by core.admin_branding (platform dashboard).
    _original_each_context = admin.site.each_context
    admin.site.each_context = _each_context
    _INSTALLED = True
