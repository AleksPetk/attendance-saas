"""Native iOS Sign in with Apple completion (JSON session; no browser redirect).

Reuses OwnerAuthProviderLink matching and complete_owner_authentication.
Does not alter browser Apple OAuth redirect handlers.
"""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework.response import Response

from accounts.apple_oauth import (
    AppleIdentity,
    AppleOAuthResultCode,
    _register_new_apple_owner,
    _validate_apple_identity_for_registration,
    apply_apple_provider_link,
    create_apple_provider_link,
    get_apple_provider_link,
    get_owner_apple_link,
    parse_apple_identity,
    update_apple_provider_link_snapshot,
)
from accounts.apple_oauth_client import (
    AppleOAuthClientError,
    verify_apple_native_id_token,
)
from accounts.apple_oauth_settings import apple_native_ios_is_configured
from accounts.apple_oauth_state import (
    INTENT_LINK,
    INTENT_LOGIN,
    INTENT_REGISTER,
    INTENT_VERIFY,
)
from accounts.email_uniqueness import (
    email_ownership_established,
    get_provisional_unverified_owner,
)
from accounts.owner_auth_provider_models import OwnerAuthProvider
from accounts.owner_authentication import complete_owner_authentication
from accounts.owner_sensitive_auth import record_owner_oauth_reauth
from accounts.provisional_ownership import (
    ProvisionalClaimError,
    claim_provisional_owner_with_oauth,
)

logger = logging.getLogger("accounts.apple_native")
User = get_user_model()

NATIVE_INTENTS = frozenset({INTENT_LOGIN, INTENT_REGISTER, INTENT_VERIFY, INTENT_LINK})

_APPLE_LINK_DETAILS = {
    AppleOAuthResultCode.LINKED: "Apple is now connected to your account.",
    AppleOAuthResultCode.ALREADY_LINKED: "Apple is already connected to your account.",
    AppleOAuthResultCode.APPLE_ALREADY_LINKED: (
        "This Apple account is connected to another CheckStation account."
    ),
    AppleOAuthResultCode.DIFFERENT_APPLE_LINKED: (
        "A different Apple account is already connected. Disconnect it first."
    ),
    AppleOAuthResultCode.AUTHENTICATION_FAILED: "Apple could not be connected.",
    AppleOAuthResultCode.AUTHENTICATION_REQUIRED: (
        "Sign in to connect Apple to your CheckStation account."
    ),
}


def _error_response(code: str, *, detail: str, status: int = 400) -> Response:
    return Response({"detail": detail, "code": code}, status=status)


def _apply_optional_full_name(user, full_name: dict | None) -> None:
    """Apply Apple fullName only when provided and fields are currently blank."""
    if not full_name or not isinstance(full_name, dict):
        return
    given = str(
        full_name.get("givenName")
        or full_name.get("given_name")
        or full_name.get("first_name")
        or ""
    ).strip()[:150]
    family = str(
        full_name.get("familyName")
        or full_name.get("family_name")
        or full_name.get("last_name")
        or ""
    ).strip()[:150]
    update_fields = []
    if given and not (user.first_name or "").strip():
        user.first_name = given
        update_fields.append("first_name")
    if family and not (user.last_name or "").strip():
        user.last_name = family
        update_fields.append("last_name")
    if update_fields:
        user.save(update_fields=update_fields)


def _finalize_native_login(request, user, *, full_name: dict | None = None) -> Response:
    _apply_optional_full_name(user, full_name)
    return complete_owner_authentication(request, user)


def process_apple_native_login(request, identity: AppleIdentity, *, full_name=None) -> Response:
    link = get_apple_provider_link(subject=identity.subject)
    if link is not None:
        update_apple_provider_link_snapshot(link, identity)
        return _finalize_native_login(request, link.user, full_name=full_name)

    if identity.email and email_ownership_established(identity.email):
        return _error_response(
            AppleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
            detail=(
                "An account with this email already exists. "
                "Sign in with your CheckStation password, then connect Apple "
                "from Account Security."
            ),
        )
    return _error_response(
        AppleOAuthResultCode.NO_ACCOUNT,
        detail="No CheckStation account is linked to this Apple ID. Create an account first.",
    )


@transaction.atomic
def process_apple_native_register(
    request,
    identity: AppleIdentity,
    *,
    legal_acknowledgement: bool,
    full_name=None,
) -> Response:
    if not legal_acknowledgement:
        return _error_response(
            AppleOAuthResultCode.LEGAL_ACKNOWLEDGEMENT_REQUIRED,
            detail="You must accept the Terms of Use and Privacy Policy.",
        )

    validation_error = _validate_apple_identity_for_registration(identity)
    if validation_error == AppleOAuthResultCode.EMAIL_MISSING:
        return _error_response(
            AppleOAuthResultCode.EMAIL_MISSING,
            detail="Apple did not share an email address. Try again or use email registration.",
        )
    if validation_error == AppleOAuthResultCode.EMAIL_NOT_VERIFIED:
        return _error_response(
            AppleOAuthResultCode.EMAIL_NOT_VERIFIED,
            detail="Apple email must be verified.",
        )
    if validation_error is not None:
        return _error_response(
            AppleOAuthResultCode.AUTHENTICATION_FAILED,
            detail="Apple sign-in could not be completed.",
        )

    if get_apple_provider_link(subject=identity.subject) is not None:
        return _error_response(
            AppleOAuthResultCode.APPLE_ALREADY_LINKED,
            detail="This Apple ID is already linked to a CheckStation account. Sign in instead.",
        )

    from billing.markets import lock_market_for_new_registration

    billing_market = lock_market_for_new_registration(request)
    provisional = get_provisional_unverified_owner(identity.email)

    if provisional is not None:
        if email_ownership_established(identity.email, exclude_user=provisional):
            return _error_response(
                AppleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
                detail=(
                    "An account with this email already exists. "
                    "Sign in with your CheckStation password, then connect Apple "
                    "from Account Security."
                ),
            )
        try:
            user = claim_provisional_owner_with_oauth(
                provisional,
                identity_email=identity.email,
                billing_market=billing_market,
                create_provider_link=create_apple_provider_link,
                identity=identity,
            )
        except ProvisionalClaimError:
            if email_ownership_established(identity.email):
                return _error_response(
                    AppleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
                    detail=(
                        "An account with this email already exists. "
                        "Sign in with your CheckStation password, then connect Apple "
                        "from Account Security."
                    ),
                )
            return _error_response(
                AppleOAuthResultCode.AUTHENTICATION_FAILED,
                detail="Apple sign-in could not be completed.",
            )
        return _finalize_native_login(request, user, full_name=full_name)

    if email_ownership_established(identity.email):
        return _error_response(
            AppleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
            detail=(
                "An account with this email already exists. "
                "Sign in with your CheckStation password, then connect Apple "
                "from Account Security."
            ),
        )

    try:
        user = _register_new_apple_owner(identity, billing_market=billing_market)
    except IntegrityError:
        logger.warning("Native Apple registration race for subject=%s", identity.subject)
        link = get_apple_provider_link(subject=identity.subject)
        if link is not None:
            update_apple_provider_link_snapshot(link, identity)
            return _finalize_native_login(request, link.user, full_name=full_name)
        if email_ownership_established(identity.email):
            return _error_response(
                AppleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
                detail=(
                    "An account with this email already exists. "
                    "Sign in with your CheckStation password, then connect Apple "
                    "from Account Security."
                ),
            )
        return _error_response(
            AppleOAuthResultCode.AUTHENTICATION_FAILED,
            detail="Apple sign-in could not be completed.",
        )

    return _finalize_native_login(request, user, full_name=full_name)


def process_apple_native_verify(request, identity: AppleIdentity) -> Response:
    """
    Re-verify the currently authenticated owner's linked Apple identity.

    Writes `_owner_oauth_reauth` into the existing session. Does not call
    complete_owner_authentication (would rotate/replace the session).
    """
    actor = getattr(request, "user", None)
    if actor is None or not getattr(actor, "is_authenticated", False):
        return _error_response(
            AppleOAuthResultCode.AUTHENTICATION_REQUIRED,
            detail="Sign in to confirm your identity with Apple.",
            status=403,
        )
    if not isinstance(actor, User):
        return _error_response(
            AppleOAuthResultCode.AUTHENTICATION_REQUIRED,
            detail="Only the paying workspace owner can confirm with Apple.",
            status=403,
        )
    if getattr(actor, "is_staff", False) or getattr(actor, "is_superuser", False):
        return _error_response(
            AppleOAuthResultCode.AUTHENTICATION_FAILED,
            detail="Apple identity could not be confirmed.",
        )

    owner_link = get_owner_apple_link(actor)
    if owner_link is None or owner_link.provider_subject != identity.subject:
        return _error_response(
            AppleOAuthResultCode.AUTHENTICATION_FAILED,
            detail="Apple identity could not be confirmed.",
        )

    update_apple_provider_link_snapshot(owner_link, identity)
    record_owner_oauth_reauth(request, actor, OwnerAuthProvider.APPLE)
    return Response(
        {
            "code": AppleOAuthResultCode.VERIFIED,
            "detail": "Identity confirmed with Apple.",
        }
    )


def process_apple_native_link(request, identity: AppleIdentity) -> Response:
    """
    Link Apple to the currently authenticated owner (JSON; no redirect).

    Reuses apply_apple_provider_link — the same rules as Browser intent=link.
    Does not create owners, switch sessions, or merge by email.
    """
    actor = getattr(request, "user", None)
    if actor is None or not getattr(actor, "is_authenticated", False):
        return _error_response(
            AppleOAuthResultCode.AUTHENTICATION_REQUIRED,
            detail=_APPLE_LINK_DETAILS[AppleOAuthResultCode.AUTHENTICATION_REQUIRED],
            status=403,
        )
    if not isinstance(actor, User):
        return _error_response(
            AppleOAuthResultCode.AUTHENTICATION_REQUIRED,
            detail="Only the paying workspace owner can connect Apple.",
            status=403,
        )

    code = apply_apple_provider_link(actor, identity)
    detail = _APPLE_LINK_DETAILS.get(code, "Apple could not be connected.")
    if code in (
        AppleOAuthResultCode.LINKED,
        AppleOAuthResultCode.ALREADY_LINKED,
    ):
        return Response({"code": code, "detail": detail})
    status = 403 if code == AppleOAuthResultCode.AUTHENTICATION_REQUIRED else 400
    return _error_response(code, detail=detail, status=status)


def complete_apple_native_authentication(
    request,
    *,
    identity_token: str,
    raw_nonce: str,
    intent: str,
    legal_acknowledgement: bool = False,
    full_name: dict | None = None,
) -> Response:
    if not apple_native_ios_is_configured():
        return _error_response(
            AppleOAuthResultCode.OAUTH_NOT_CONFIGURED,
            detail="Apple sign-in is not available.",
            status=503,
        )

    intent_normalized = (intent or "").strip().lower()
    if intent_normalized not in NATIVE_INTENTS:
        return _error_response(
            AppleOAuthResultCode.INVALID_INTENT,
            detail="Invalid Apple sign-in intent.",
        )

    token = (identity_token or "").strip()
    nonce = (raw_nonce or "").strip()
    if not token:
        return _error_response(
            AppleOAuthResultCode.AUTHENTICATION_FAILED,
            detail="Apple identity token is missing.",
        )
    if not nonce:
        return _error_response(
            AppleOAuthResultCode.AUTHENTICATION_FAILED,
            detail="Apple nonce is missing.",
        )

    try:
        claims = verify_apple_native_id_token(token, expected_raw_nonce=nonce)
    except AppleOAuthClientError as exc:
        code = str(exc) or "invalid_id_token"
        if code == "expired_id_token":
            return _error_response(
                AppleOAuthResultCode.AUTHENTICATION_FAILED,
                detail="Apple sign-in expired. Try again.",
            )
        if code == "invalid_nonce":
            return _error_response(
                AppleOAuthResultCode.AUTHENTICATION_FAILED,
                detail="Apple sign-in could not be verified. Try again.",
            )
        if code == "invalid_audience":
            return _error_response(
                AppleOAuthResultCode.AUTHENTICATION_FAILED,
                detail="Apple sign-in could not be verified for this app.",
            )
        return _error_response(
            AppleOAuthResultCode.AUTHENTICATION_FAILED,
            detail="Apple sign-in could not be completed.",
        )

    identity = parse_apple_identity(claims)
    if intent_normalized == INTENT_LOGIN:
        return process_apple_native_login(request, identity, full_name=full_name)
    if intent_normalized == INTENT_VERIFY:
        return process_apple_native_verify(request, identity)
    if intent_normalized == INTENT_LINK:
        return process_apple_native_link(request, identity)
    return process_apple_native_register(
        request,
        identity,
        legal_acknowledgement=legal_acknowledgement,
        full_name=full_name,
    )
