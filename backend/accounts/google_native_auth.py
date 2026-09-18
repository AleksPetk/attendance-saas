"""Native iOS Google Sign-In completion (JSON session; no browser redirect).

Reuses OwnerAuthProviderLink matching and complete_owner_authentication.
Does not alter browser Google OAuth redirect handlers.
"""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework.response import Response

from accounts.google_oauth import (
    GoogleIdentity,
    GoogleOAuthResultCode,
    _register_new_google_owner,
    _validate_google_identity_for_registration,
    create_google_provider_link,
    get_google_provider_link,
    get_owner_google_link,
    parse_google_identity,
    update_google_provider_link_snapshot,
)
from accounts.google_oauth_client import (
    GoogleOAuthClientError,
    verify_google_native_id_token,
)
from accounts.google_oauth_settings import google_native_ios_is_configured
from accounts.google_oauth_state import INTENT_LOGIN, INTENT_REGISTER, INTENT_VERIFY
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

logger = logging.getLogger("accounts.google_native")
User = get_user_model()

NATIVE_INTENTS = frozenset({INTENT_LOGIN, INTENT_REGISTER, INTENT_VERIFY})


def _error_response(code: str, *, detail: str, status: int = 400) -> Response:
    return Response({"detail": detail, "code": code}, status=status)


def _finalize_native_login(request, user) -> Response:
    return complete_owner_authentication(request, user)


def process_google_native_login(request, identity: GoogleIdentity) -> Response:
    link = get_google_provider_link(subject=identity.subject)
    if link is not None:
        update_google_provider_link_snapshot(link, identity)
        return _finalize_native_login(request, link.user)

    if identity.email and email_ownership_established(identity.email):
        return _error_response(
            GoogleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
            detail=(
                "An account with this email already exists. "
                "Sign in with your CheckStation password, then connect Google "
                "from Account Security."
            ),
        )
    return _error_response(
        GoogleOAuthResultCode.NO_ACCOUNT,
        detail="No CheckStation account is linked to this Google account. Create an account first.",
    )


@transaction.atomic
def process_google_native_register(
    request,
    identity: GoogleIdentity,
    *,
    legal_acknowledgement: bool,
) -> Response:
    if not legal_acknowledgement:
        return _error_response(
            GoogleOAuthResultCode.LEGAL_ACKNOWLEDGEMENT_REQUIRED,
            detail="You must accept the Terms of Use and Privacy Policy.",
        )

    validation_error = _validate_google_identity_for_registration(identity)
    if validation_error == GoogleOAuthResultCode.EMAIL_MISSING:
        return _error_response(
            GoogleOAuthResultCode.EMAIL_MISSING,
            detail="Google did not share an email address. Try again or use email registration.",
        )
    if validation_error == GoogleOAuthResultCode.EMAIL_NOT_VERIFIED:
        return _error_response(
            GoogleOAuthResultCode.EMAIL_NOT_VERIFIED,
            detail="Google email must be verified.",
        )
    if validation_error is not None:
        return _error_response(
            GoogleOAuthResultCode.AUTHENTICATION_FAILED,
            detail="Google sign-in could not be completed.",
        )

    if get_google_provider_link(subject=identity.subject) is not None:
        return _error_response(
            GoogleOAuthResultCode.GOOGLE_ALREADY_LINKED,
            detail="This Google account is already linked to a CheckStation account. Sign in instead.",
        )

    from billing.markets import lock_market_for_new_registration

    billing_market = lock_market_for_new_registration(request)
    provisional = get_provisional_unverified_owner(identity.email)

    if provisional is not None:
        if email_ownership_established(identity.email, exclude_user=provisional):
            return _error_response(
                GoogleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
                detail=(
                    "An account with this email already exists. "
                    "Sign in with your CheckStation password, then connect Google "
                    "from Account Security."
                ),
            )
        try:
            user = claim_provisional_owner_with_oauth(
                provisional,
                identity_email=identity.email,
                billing_market=billing_market,
                create_provider_link=create_google_provider_link,
                identity=identity,
            )
        except ProvisionalClaimError:
            if email_ownership_established(identity.email):
                return _error_response(
                    GoogleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
                    detail=(
                        "An account with this email already exists. "
                        "Sign in with your CheckStation password, then connect Google "
                        "from Account Security."
                    ),
                )
            return _error_response(
                GoogleOAuthResultCode.AUTHENTICATION_FAILED,
                detail="Google sign-in could not be completed.",
            )
        return _finalize_native_login(request, user)

    if email_ownership_established(identity.email):
        return _error_response(
            GoogleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
            detail=(
                "An account with this email already exists. "
                "Sign in with your CheckStation password, then connect Google "
                "from Account Security."
            ),
        )

    try:
        user = _register_new_google_owner(identity, billing_market=billing_market)
    except IntegrityError:
        logger.warning("Native Google registration race for subject=%s", identity.subject)
        link = get_google_provider_link(subject=identity.subject)
        if link is not None:
            update_google_provider_link_snapshot(link, identity)
            return _finalize_native_login(request, link.user)
        provisional = get_provisional_unverified_owner(identity.email)
        if provisional is not None and not email_ownership_established(
            identity.email, exclude_user=provisional
        ):
            try:
                user = claim_provisional_owner_with_oauth(
                    provisional,
                    identity_email=identity.email,
                    billing_market=billing_market,
                    create_provider_link=create_google_provider_link,
                    identity=identity,
                )
                return _finalize_native_login(request, user)
            except ProvisionalClaimError:
                pass
        if email_ownership_established(identity.email):
            return _error_response(
                GoogleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED,
                detail=(
                    "An account with this email already exists. "
                    "Sign in with your CheckStation password, then connect Google "
                    "from Account Security."
                ),
            )
        return _error_response(
            GoogleOAuthResultCode.AUTHENTICATION_FAILED,
            detail="Google sign-in could not be completed.",
        )

    return _finalize_native_login(request, user)


def process_google_native_verify(request, identity: GoogleIdentity) -> Response:
    """
    Re-verify the currently authenticated owner's linked Google identity.

    Writes `_owner_oauth_reauth` into the existing session. Does not call
    complete_owner_authentication (would rotate/replace the session).
    """
    actor = getattr(request, "user", None)
    if actor is None or not getattr(actor, "is_authenticated", False):
        return _error_response(
            GoogleOAuthResultCode.AUTHENTICATION_REQUIRED,
            detail="Sign in to confirm your identity with Google.",
            status=403,
        )
    if not isinstance(actor, User):
        return _error_response(
            GoogleOAuthResultCode.AUTHENTICATION_REQUIRED,
            detail="Only the paying workspace owner can confirm with Google.",
            status=403,
        )
    if getattr(actor, "is_staff", False) or getattr(actor, "is_superuser", False):
        return _error_response(
            GoogleOAuthResultCode.AUTHENTICATION_FAILED,
            detail="Google identity could not be confirmed.",
        )

    owner_link = get_owner_google_link(actor)
    if owner_link is None or owner_link.provider_subject != identity.subject:
        return _error_response(
            GoogleOAuthResultCode.AUTHENTICATION_FAILED,
            detail="Google identity could not be confirmed.",
        )

    update_google_provider_link_snapshot(owner_link, identity)
    record_owner_oauth_reauth(request, actor, OwnerAuthProvider.GOOGLE)
    return Response(
        {
            "code": GoogleOAuthResultCode.VERIFIED,
            "detail": "Identity confirmed with Google.",
        }
    )


def complete_google_native_authentication(
    request,
    *,
    identity_token: str,
    intent: str,
    legal_acknowledgement: bool = False,
) -> Response:
    if not google_native_ios_is_configured():
        return _error_response(
            GoogleOAuthResultCode.OAUTH_NOT_CONFIGURED,
            detail="Google sign-in is not available.",
            status=503,
        )

    intent_normalized = (intent or "").strip().lower()
    if intent_normalized not in NATIVE_INTENTS:
        return _error_response(
            GoogleOAuthResultCode.INVALID_INTENT,
            detail="Invalid Google sign-in intent.",
        )

    token = (identity_token or "").strip()
    if not token:
        return _error_response(
            GoogleOAuthResultCode.AUTHENTICATION_FAILED,
            detail="Google identity token is missing.",
        )

    try:
        claims = verify_google_native_id_token(token)
    except GoogleOAuthClientError as exc:
        code = str(exc) or "invalid_id_token"
        if code == "expired_id_token":
            return _error_response(
                GoogleOAuthResultCode.AUTHENTICATION_FAILED,
                detail="Google sign-in expired. Try again.",
            )
        if code == "invalid_audience":
            return _error_response(
                GoogleOAuthResultCode.AUTHENTICATION_FAILED,
                detail="Google sign-in could not be verified for this app.",
            )
        return _error_response(
            GoogleOAuthResultCode.AUTHENTICATION_FAILED,
            detail="Google sign-in could not be completed.",
        )

    identity = parse_google_identity(claims)
    if intent_normalized == INTENT_LOGIN:
        return process_google_native_login(request, identity)
    if intent_normalized == INTENT_VERIFY:
        return process_google_native_verify(request, identity)
    return process_google_native_register(
        request,
        identity,
        legal_acknowledgement=legal_acknowledgement,
    )
