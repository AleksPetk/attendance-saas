"""Test helpers for the isolated Django admin session cookie."""

import re
from unittest.mock import patch

import pyotp
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.sessions.backends.db import SessionStore

from accounts.two_factor import (
    COMPLETE_USER_KEY,
    TOTP_INTERVAL,
    current_timestep,
    decrypt_totp_secret,
    has_confirmed_platform_totp,
)
from accounts.two_factor_models import PlatformTOTPDevice

SETUP_KEY_RE = re.compile(r'id="totp-setup-key">([A-Z2-7]+)')
RECOVERY_CODE_RE = re.compile(r"<li>([A-Z0-9]{4}-[A-Z0-9]{4})</li>")


def force_platform_admin_login(client, user):
    """
    Log a platform operator into the admin session cookie used by /admin/.

    `Client.force_login()` writes the Check Station app session cookie.
    Admin requests ignore that cookie, so tests that hit /admin/ must also
    attach the admin cookie. The two cookies share one test session here,
    which is fine for admin-only tests. Isolation tests log in through
    /admin/login/ and /api/auth/login/ so they get distinct session keys.

    Marks platform 2FA complete on that session so middleware does not treat
    the test login as an unfinished password-only attempt.
    """
    client.force_login(user)
    session = client.session
    session[COMPLETE_USER_KEY] = user.pk
    session.save()
    _copy_client_cookie(
        client,
        settings.SESSION_COOKIE_NAME,
        settings.ADMIN_SESSION_COOKIE_NAME,
    )
    _copy_client_cookie(
        client,
        settings.CSRF_COOKIE_NAME,
        settings.ADMIN_CSRF_COOKIE_NAME,
    )
    return client


def extract_totp_setup_key(response):
    match = SETUP_KEY_RE.search(response.content.decode())
    if match is None:
        raise AssertionError("TOTP setup key was not found on the setup page.")
    return match.group(1)


def extract_recovery_codes(response):
    codes = RECOVERY_CODE_RE.findall(response.content.decode())
    if not codes:
        raise AssertionError("Recovery codes were not shown.")
    return codes


def totp_code(secret, step=None):
    totp = pyotp.TOTP(secret, digits=6, interval=TOTP_INTERVAL)
    if step is None:
        return totp.now()
    return totp.at(step * TOTP_INTERVAL)


def totp_step_for_user(user):
    """Pick a timestep that is not already consumed on this operator's device."""
    step = current_timestep()
    device = PlatformTOTPDevice.objects.filter(user=user).first()
    if device is not None and device.last_verified_timestep is not None:
        if device.last_verified_timestep >= step - 1:
            step = device.last_verified_timestep + 1
    return step


def post_totp(client, path, secret, user):
    """POST a TOTP code, advancing the timestep if this window was already used."""
    step = totp_step_for_user(user)
    with patch("accounts.two_factor.current_timestep", return_value=step):
        return client.post(path, {"code": totp_code(secret, step)})


def login_platform_admin_through_2fa(client, email, password, *, next_url="/admin/"):
    """Password login plus mandatory TOTP setup or challenge."""
    response = client.post(
        "/admin/login/",
        {
            "username": email,
            "password": password,
            "next": next_url,
        },
    )
    if response.status_code != 302:
        raise AssertionError(f"Admin password login failed ({response.status_code}).")

    User = get_user_model()
    user = User.objects.get(email=email)
    if has_confirmed_platform_totp(user):
        secret = decrypt_totp_secret(
            PlatformTOTPDevice.objects.get(user=user).secret_encrypted
        )
        challenge = post_totp(client, "/admin/two-factor/challenge/", secret, user)
        if challenge.status_code != 302:
            raise AssertionError(
                f"TOTP challenge failed ({challenge.status_code})."
            )
        return secret, []

    setup = client.get("/admin/two-factor/setup/")
    if setup.status_code != 200:
        raise AssertionError(f"2FA setup page failed ({setup.status_code}).")
    secret = extract_totp_setup_key(setup)
    verified = client.post("/admin/two-factor/setup/", {"code": totp_code(secret)})
    if verified.status_code != 302:
        raise AssertionError(f"2FA setup verify failed ({verified.status_code}).")
    codes_page = client.get("/admin/two-factor/recovery-codes/")
    codes = extract_recovery_codes(codes_page)
    acknowledged = client.post(
        "/admin/two-factor/recovery-codes/",
        {"acknowledged": "on"},
    )
    if acknowledged.status_code != 302:
        raise AssertionError(
            f"Recovery-code acknowledgement failed ({acknowledged.status_code})."
        )
    return secret, codes


def admin_session_store(client):
    morsel = client.cookies.get(settings.ADMIN_SESSION_COOKIE_NAME)
    if morsel is None:
        raise AssertionError("Admin session cookie is missing.")
    store = SessionStore(session_key=morsel.value)
    store.load()
    return store


def login_platform_admin_with_recovery_code(client, email, password, recovery_code):
    response = client.post(
        "/admin/login/",
        {
            "username": email,
            "password": password,
            "next": "/admin/",
        },
    )
    if response.status_code != 302:
        raise AssertionError(f"Admin password login failed ({response.status_code}).")
    verified = client.post(
        "/admin/two-factor/recovery/",
        {"recovery_code": recovery_code},
    )
    if verified.status_code != 302:
        raise AssertionError(
            f"Recovery-code login failed ({verified.status_code})."
        )
    return verified


def _copy_client_cookie(client, from_name, to_name):
    source = client.cookies.get(from_name)
    if source is None:
        return
    client.cookies[to_name] = source.value
    dest = client.cookies[to_name]
    for attr in ("path", "domain", "secure", "httponly", "samesite", "expires"):
        value = source.get(attr)
        if value:
            dest[attr] = value
    if from_name == settings.SESSION_COOKIE_NAME:
        dest["path"] = settings.ADMIN_SESSION_COOKIE_PATH
    if from_name == settings.CSRF_COOKIE_NAME:
        dest["path"] = settings.ADMIN_SESSION_COOKIE_PATH
