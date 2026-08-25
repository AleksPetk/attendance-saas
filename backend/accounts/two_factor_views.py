"""Platform-operator TOTP setup, challenge, recovery, and regeneration views."""

from django.contrib import messages
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import redirect, render
from django.urls import reverse
from django.views.decorators.cache import never_cache
from django.views.decorators.debug import sensitive_post_parameters
from django.views.decorators.http import require_http_methods

from accounts.two_factor import (
    authenticator_label,
    complete_authenticator_replacement,
    complete_platform_admin_authentication,
    confirm_unconfirmed_device,
    consume_recovery_code,
    decrypt_totp_secret,
    get_device,
    get_or_create_unconfirmed_device,
    has_confirmed_platform_totp,
    has_recent_recovery_authentication,
    is_platform_operator,
    load_pending_user,
    lock_is_active,
    logger,
    normalize_recovery_code,
    operator_may_use_admin,
    pending_next_url,
    plaintext_recovery_codes,
    pop_plaintext_recovery_codes,
    provisioning_uri,
    qr_png_data_uri,
    register_failure_on_device,
    register_success_on_device,
    replace_recovery_codes,
    replacement_in_progress,
    recovery_auth_seconds_remaining,
    seconds_until,
    start_authenticator_replacement,
    store_plaintext_recovery_codes,
    unused_recovery_count,
    verify_totp_code,
)

GENERIC_CODE_ERROR = "That authentication code was not valid."
GENERIC_RECOVERY_ERROR = "That recovery code was not valid."
LOCK_ERROR = "Too many attempts. Try again in {seconds} seconds."
ACK_ERROR = "Confirm that you have saved these recovery codes before continuing."
REPLACE_AUTH_ERROR = (
    "Replacing the authenticator requires a current authenticator code, "
    "or a recovery-code sign-in from the last 10 minutes."
)


def _pending_or_login(request):
    user = load_pending_user(request)
    if user is None:
        return None, redirect("admin:login")
    return user, None


def _lock_message(device):
    if device is None or not lock_is_active(device.locked_until):
        return ""
    return LOCK_ERROR.format(seconds=seconds_until(device.locked_until))


def _verify_device_code(device, raw_code):
    if device is None:
        return False, None, GENERIC_CODE_ERROR
    lock_msg = _lock_message(device)
    if lock_msg:
        return False, None, lock_msg
    secret = decrypt_totp_secret(device.secret_encrypted)
    ok, timestep = verify_totp_code(
        secret, raw_code, last_timestep=device.last_verified_timestep
    )
    if not ok:
        register_failure_on_device(device)
        lock_msg = _lock_message(device)
        return False, None, lock_msg or GENERIC_CODE_ERROR
    return True, timestep, ""


@never_cache
@require_http_methods(["GET", "POST"])
@sensitive_post_parameters("code")
def setup_view(request):
    user, failure = _pending_or_login(request)
    if failure:
        return failure
    if plaintext_recovery_codes(request):
        return redirect("two_factor:recovery_codes")
    if has_confirmed_platform_totp(user):
        return redirect("two_factor:challenge")

    rotate = request.method == "POST" and request.POST.get("action") == "rotate"
    device, secret = get_or_create_unconfirmed_device(user, rotate=rotate)
    error = _lock_message(device)

    if request.method == "POST" and request.POST.get("action") != "rotate" and not error:
        ok, timestep, error = _verify_device_code(device, request.POST.get("code"))
        if ok:
            confirm_unconfirmed_device(device, timestep)
            codes = replace_recovery_codes(user)
            store_plaintext_recovery_codes(request, codes)
            return redirect("two_factor:recovery_codes")
        device = get_device(user)

    uri = provisioning_uri(user.email, secret)
    context = {
        "title": "Secure your Check Station admin account",
        "email": user.email,
        "issuer": "Check Station",
        "label": authenticator_label(user.email),
        "setup_key": secret,
        "qr_data_uri": qr_png_data_uri(uri),
        "error": error,
        "locked": bool(_lock_message(device)),
    }
    return render(request, "admin/two_factor/setup.html", context)


@never_cache
@require_http_methods(["GET", "POST"])
@sensitive_post_parameters("code")
def challenge_view(request):
    user, failure = _pending_or_login(request)
    if failure:
        return failure
    if plaintext_recovery_codes(request):
        return redirect("two_factor:recovery_codes")
    if not has_confirmed_platform_totp(user):
        return redirect("two_factor:setup")

    device = get_device(user)
    error = _lock_message(device)
    if request.method == "POST" and not error:
        ok, timestep, error = _verify_device_code(device, request.POST.get("code"))
        if ok:
            register_success_on_device(device, timestep)
            next_url = pending_next_url(request)
            remaining = complete_platform_admin_authentication(request, user)
            messages.info(
                request,
                f"Two-factor authentication succeeded. {remaining} recovery codes remaining.",
            )
            return HttpResponseRedirect(next_url)
        device = get_device(user)

    context = {
        "title": "Two-factor authentication",
        "error": error,
        "locked": bool(_lock_message(device)),
        "recovery_url": reverse("two_factor:recovery"),
    }
    return render(request, "admin/two_factor/challenge.html", context)


@never_cache
@require_http_methods(["GET", "POST"])
@sensitive_post_parameters("recovery_code")
def recovery_view(request):
    user, failure = _pending_or_login(request)
    if failure:
        return failure
    if not has_confirmed_platform_totp(user):
        return redirect("two_factor:setup")

    device = get_device(user)
    error = _lock_message(device)
    if request.method == "POST" and not error:
        submitted = normalize_recovery_code(request.POST.get("recovery_code"))
        if not submitted:
            error = GENERIC_RECOVERY_ERROR
        elif consume_recovery_code(user, submitted):
            if device is not None:
                register_success_on_device(device)
            next_url = pending_next_url(request)
            complete_platform_admin_authentication(
                request, user, recovery_authenticated=True
            )
            messages.warning(
                request,
                "Signed in with a recovery code. "
                "If you lost your authenticator, use Platform security below.",
            )
            return HttpResponseRedirect(next_url)
        else:
            if device is not None:
                register_failure_on_device(device)
                device = get_device(user)
            error = _lock_message(device) or GENERIC_RECOVERY_ERROR

    context = {
        "title": "Use a recovery code",
        "error": error,
        "locked": bool(_lock_message(device)),
        "challenge_url": reverse("two_factor:challenge"),
    }
    return render(request, "admin/two_factor/recovery.html", context)


def _recovery_codes_context(request, *, continue_label):
    codes = plaintext_recovery_codes(request)
    return {
        "title": "Save your recovery codes",
        "codes": codes,
        "codes_text": "\n".join(codes),
        "download_url": reverse("two_factor:download"),
        "continue_label": continue_label,
        "error": "",
    }


@never_cache
@require_http_methods(["GET", "POST"])
def recovery_codes_view(request):
    codes = plaintext_recovery_codes(request)
    if not codes:
        if operator_may_use_admin(request, request.user):
            return redirect("admin:index")
        user = load_pending_user(request)
        if user is None:
            return redirect("admin:login")
        if has_confirmed_platform_totp(user):
            return redirect("two_factor:challenge")
        return redirect("two_factor:setup")

    pending_user = load_pending_user(request)
    continue_label = (
        "Continue to admin" if pending_user is not None else "Back to admin"
    )
    context = _recovery_codes_context(request, continue_label=continue_label)
    if request.method == "POST":
        acknowledged = request.POST.get("acknowledged") in {"on", "true", "1", "yes"}
        if not acknowledged:
            context["error"] = ACK_ERROR
            return render(request, "admin/two_factor/recovery_codes.html", context)
        pop_plaintext_recovery_codes(request)
        if pending_user is not None:
            next_url = pending_next_url(request)
            remaining = complete_platform_admin_authentication(request, pending_user)
            messages.info(
                request,
                f"Two-factor authentication is on. {remaining} recovery codes saved.",
            )
            return HttpResponseRedirect(next_url)
        messages.info(request, "New recovery codes are now active.")
        return redirect("admin:index")

    return render(request, "admin/two_factor/recovery_codes.html", context)


@never_cache
@require_http_methods(["GET"])
def download_recovery_codes_view(request):
    codes = plaintext_recovery_codes(request)
    if not codes:
        return redirect("two_factor:recovery_codes")
    user = load_pending_user(request)
    if user is None and operator_may_use_admin(request, request.user):
        user = request.user
    if user is None:
        return redirect("admin:login")
    body = (
        "Check Station platform admin recovery codes\n"
        f"Account: {user.email}\n"
        "Each code can be used once. Store these somewhere safe.\n\n"
        + "\n".join(codes)
        + "\n"
    )
    response = HttpResponse(body, content_type="text/plain; charset=utf-8")
    response["Content-Disposition"] = (
        'attachment; filename="check-station-recovery-codes.txt"'
    )
    return response


@never_cache
@require_http_methods(["GET", "POST"])
@sensitive_post_parameters("code")
def regenerate_view(request):
    user = request.user
    if not operator_may_use_admin(request, user):
        pending = load_pending_user(request)
        if pending is not None:
            return redirect("two_factor:challenge")
        return redirect("admin:login")
    if not is_platform_operator(user) or not has_confirmed_platform_totp(user):
        messages.error(
            request,
            "Set up authenticator 2FA before regenerating recovery codes.",
        )
        return redirect("admin:index")

    recovery_auth = has_recent_recovery_authentication(request, user)
    device = get_device(user)
    error = _lock_message(device)
    if request.method == "POST" and not error:
        if recovery_auth:
            codes = replace_recovery_codes(user)
            store_plaintext_recovery_codes(request, codes)
            logger.info(
                "platform_2fa_recovery_codes_regenerated user_id=%s via_recovery_auth=1",
                user.pk,
            )
            return redirect("two_factor:recovery_codes")
        ok, timestep, error = _verify_device_code(device, request.POST.get("code"))
        if ok:
            register_success_on_device(device, timestep)
            codes = replace_recovery_codes(user)
            store_plaintext_recovery_codes(request, codes)
            logger.info("platform_2fa_recovery_codes_regenerated user_id=%s", user.pk)
            return redirect("two_factor:recovery_codes")
        device = get_device(user)

    context = {
        "title": "Regenerate recovery codes",
        "error": error,
        "locked": bool(_lock_message(device)),
        "remaining": unused_recovery_count(user),
        "recovery_auth": recovery_auth,
        "recovery_auth_seconds": recovery_auth_seconds_remaining(request, user),
    }
    return render(request, "admin/two_factor/regenerate.html", context)


def _replace_enroll_context(user, device, secret, error=""):
    uri = provisioning_uri(user.email, secret)
    return {
        "title": "Replace authenticator",
        "enrolling": True,
        "email": user.email,
        "label": authenticator_label(user.email),
        "setup_key": secret,
        "qr_data_uri": qr_png_data_uri(uri),
        "error": error,
        "locked": bool(_lock_message(device)),
        "recovery_auth": False,
        "require_totp": False,
    }


@never_cache
@require_http_methods(["GET", "POST"])
@sensitive_post_parameters("code")
def replace_view(request):
    user = request.user
    if not operator_may_use_admin(request, user):
        pending = load_pending_user(request)
        if pending is not None:
            return redirect("two_factor:challenge")
        return redirect("admin:login")
    if not is_platform_operator(user):
        return redirect("admin:index")
    if plaintext_recovery_codes(request):
        return redirect("two_factor:recovery_codes")

    recovery_auth = has_recent_recovery_authentication(request, user)
    in_progress = replacement_in_progress(user)
    device = get_device(user)

    if in_progress:
        rotate = request.method == "POST" and request.POST.get("action") == "rotate"
        device, secret = get_or_create_unconfirmed_device(user, rotate=rotate)
        error = _lock_message(device)
        if (
            request.method == "POST"
            and request.POST.get("action") != "rotate"
            and not error
        ):
            ok, timestep, error = _verify_device_code(device, request.POST.get("code"))
            if ok:
                complete_authenticator_replacement(request, user, device, timestep)
                messages.info(
                    request,
                    "Authenticator replaced. Save the new recovery codes. "
                    "The previous authenticator and recovery codes no longer work.",
                )
                return redirect("two_factor:recovery_codes")
            device = get_device(user)
            secret = decrypt_totp_secret(device.secret_encrypted)
        return render(
            request,
            "admin/two_factor/replace.html",
            _replace_enroll_context(user, device, secret, error),
        )

    if not has_confirmed_platform_totp(user):
        messages.error(
            request,
            "Set up authenticator 2FA before replacing the authenticator.",
        )
        return redirect("admin:index")

    error = _lock_message(device)
    if request.method == "POST" and not error:
        if recovery_auth:
            start_authenticator_replacement(user)
            return redirect("two_factor:replace")
        submitted = request.POST.get("code")
        if not submitted:
            error = REPLACE_AUTH_ERROR
        else:
            ok, timestep, error = _verify_device_code(device, submitted)
            if ok:
                register_success_on_device(device, timestep)
                start_authenticator_replacement(user)
                return redirect("two_factor:replace")
            device = get_device(user)

    context = {
        "title": "Replace authenticator",
        "enrolling": False,
        "error": error,
        "locked": bool(_lock_message(device)),
        "recovery_auth": recovery_auth,
        "recovery_auth_seconds": recovery_auth_seconds_remaining(request, user),
        "require_totp": not recovery_auth,
        "remaining": unused_recovery_count(user),
    }
    return render(request, "admin/two_factor/replace.html", context)
