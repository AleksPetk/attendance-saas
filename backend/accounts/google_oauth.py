"""Owner Google OAuth business logic (login, register, link)."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.http import HttpResponseRedirect
from django.utils import timezone

from accounts.email_uniqueness import (
    email_ownership_established,
    get_provisional_unverified_owner,
    normalize_owner_email,
)
from accounts.google_oauth_client import (
    GoogleOAuthClientError,
    exchange_authorization_code,
    verify_google_id_token,
)
from accounts.google_oauth_settings import (
    google_oauth_account_security_result_url,
    google_oauth_frontend_result_url,
    google_oauth_redirect_uri,
)
from accounts.google_oauth_state import (
    INTENT_LINK,
    INTENT_LOGIN,
    INTENT_REGISTER,
    INTENT_VERIFY,
    GoogleOAuthStateError,
    consume_google_oauth_state,
)
from accounts.owner_sensitive_auth import record_owner_oauth_reauth
from accounts.owner_auth_provider_models import OwnerAuthProvider, OwnerAuthProviderLink
from accounts.owner_authentication import complete_owner_authentication
from accounts.provisional_ownership import (
    ProvisionalClaimError,
    claim_provisional_owner_with_oauth,
)
from accounts.services import provision_verified_owner

logger = logging.getLogger("accounts.google_oauth")
User = get_user_model()


class GoogleOAuthResultCode:
    SUCCESS = "success"
    TWO_FACTOR_REQUIRED = "two_factor_required"
    LINKED = "linked"
    ALREADY_LINKED = "already_linked"
    EXISTING_ACCOUNT_CONNECT_REQUIRED = "existing_account_connect_required"
    NO_ACCOUNT = "no_account"
    GOOGLE_ALREADY_LINKED = "google_already_linked"
    DIFFERENT_GOOGLE_LINKED = "different_google_linked"
    LEGAL_ACKNOWLEDGEMENT_REQUIRED = "legal_acknowledgement_required"
    OAUTH_NOT_CONFIGURED = "oauth_not_configured"
    INVALID_STATE = "invalid_state"
    AUTHENTICATION_FAILED = "authentication_failed"
    EMAIL_NOT_VERIFIED = "email_not_verified"
    EMAIL_MISSING = "email_missing"
    AUTHENTICATION_REQUIRED = "authentication_required"
    INVALID_INTENT = "invalid_intent"
    VERIFIED = "verified"


@dataclass(frozen=True)
class GoogleIdentity:
    subject: str
    email: str
    email_verified: bool


def redirect_google_oauth_result(result_code: str) -> HttpResponseRedirect:
    return HttpResponseRedirect(google_oauth_frontend_result_url(result_code))


def redirect_google_account_security_result(result_code: str) -> HttpResponseRedirect:
    return HttpResponseRedirect(google_oauth_account_security_result_url(result_code))


def parse_google_identity(claims: dict) -> GoogleIdentity:
    subject = str(claims.get("sub") or "").strip()
    email = normalize_owner_email(claims.get("email") or "")
    email_verified = bool(claims.get("email_verified"))
    return GoogleIdentity(subject=subject, email=email, email_verified=email_verified)


def get_google_provider_link(*, subject: str) -> OwnerAuthProviderLink | None:
    return OwnerAuthProviderLink.objects.filter(
        provider=OwnerAuthProvider.GOOGLE,
        provider_subject=subject,
    ).select_related("user").first()


def get_owner_google_link(user) -> OwnerAuthProviderLink | None:
    return OwnerAuthProviderLink.objects.filter(
        user=user,
        provider=OwnerAuthProvider.GOOGLE,
    ).first()


def update_google_provider_link_snapshot(link: OwnerAuthProviderLink, identity: GoogleIdentity) -> None:
    link.provider_email = identity.email or ""
    link.provider_email_verified = identity.email_verified
    link.last_used_at = timezone.now()
    link.save(
        update_fields=[
            "provider_email",
            "provider_email_verified",
            "last_used_at",
        ]
    )


def create_google_provider_link(user, identity: GoogleIdentity) -> OwnerAuthProviderLink:
    return OwnerAuthProviderLink.objects.create(
        user=user,
        provider=OwnerAuthProvider.GOOGLE,
        provider_subject=identity.subject,
        provider_email=identity.email or "",
        provider_email_verified=identity.email_verified,
        last_used_at=timezone.now(),
    )


def _finalize_owner_login(request, user) -> HttpResponseRedirect:
    response = complete_owner_authentication(request, user)
    if response.status_code == 200:
        return redirect_google_oauth_result(GoogleOAuthResultCode.SUCCESS)
    if response.status_code == 403:
        code = response.data.get("code")
        if code == "two_factor_required":
            return redirect_google_oauth_result(GoogleOAuthResultCode.TWO_FACTOR_REQUIRED)
        if code == "email_not_verified":
            return redirect_google_oauth_result(GoogleOAuthResultCode.EMAIL_NOT_VERIFIED)
    if response.status_code == 404:
        return redirect_google_oauth_result(GoogleOAuthResultCode.AUTHENTICATION_FAILED)
    return redirect_google_oauth_result(GoogleOAuthResultCode.AUTHENTICATION_FAILED)


def _validate_google_identity_for_registration(identity: GoogleIdentity) -> str | None:
    if not identity.email:
        return GoogleOAuthResultCode.EMAIL_MISSING
    if not identity.email_verified:
        return GoogleOAuthResultCode.EMAIL_NOT_VERIFIED
    return None


def _login_existing_google_link(request, link: OwnerAuthProviderLink, identity: GoogleIdentity):
    update_google_provider_link_snapshot(link, identity)
    return _finalize_owner_login(request, link.user)


@transaction.atomic
def _register_new_google_owner(identity: GoogleIdentity, *, billing_market: str):
    user = User.objects.create_user(
        email=identity.email,
        password=None,
        email_verified=True,
        signup_billing_market=billing_market,
    )
    user.set_unusable_password()
    user.save(update_fields=["password"])
    create_google_provider_link(user, identity)
    provision_verified_owner(user, billing_market=billing_market)
    return user


def handle_google_oauth_login(request, identity: GoogleIdentity) -> HttpResponseRedirect:
    link = get_google_provider_link(subject=identity.subject)
    if link is not None:
        return _login_existing_google_link(request, link, identity)

    # Unverified provisional signups do not establish ownership — direct the
    # user to register so verified Google can claim the address.
    if identity.email and email_ownership_established(identity.email):
        return redirect_google_oauth_result(
            GoogleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED
        )
    return redirect_google_oauth_result(GoogleOAuthResultCode.NO_ACCOUNT)


def handle_google_oauth_register(
    request,
    identity: GoogleIdentity,
    *,
    legal_acknowledgement: bool,
) -> HttpResponseRedirect:
    if not legal_acknowledgement:
        return redirect_google_oauth_result(
            GoogleOAuthResultCode.LEGAL_ACKNOWLEDGEMENT_REQUIRED
        )

    validation_error = _validate_google_identity_for_registration(identity)
    if validation_error is not None:
        return redirect_google_oauth_result(validation_error)

    if get_google_provider_link(subject=identity.subject) is not None:
        return redirect_google_oauth_result(GoogleOAuthResultCode.GOOGLE_ALREADY_LINKED)

    from billing.markets import lock_market_for_new_registration

    billing_market = lock_market_for_new_registration(request)
    provisional = get_provisional_unverified_owner(identity.email)

    if provisional is not None:
        # Another account may already own this address as backup/pending.
        if email_ownership_established(identity.email, exclude_user=provisional):
            return redirect_google_oauth_result(
                GoogleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED
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
                return redirect_google_oauth_result(
                    GoogleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED
                )
            return redirect_google_oauth_result(
                GoogleOAuthResultCode.AUTHENTICATION_FAILED
            )
        return _finalize_owner_login(request, user)

    if email_ownership_established(identity.email):
        return redirect_google_oauth_result(
            GoogleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED
        )

    try:
        user = _register_new_google_owner(identity, billing_market=billing_market)
    except IntegrityError:
        logger.warning("Google registration race for subject=%s", identity.subject)
        link = get_google_provider_link(subject=identity.subject)
        if link is not None:
            return _login_existing_google_link(request, link, identity)
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
                return _finalize_owner_login(request, user)
            except ProvisionalClaimError:
                pass
        if email_ownership_established(identity.email):
            return redirect_google_oauth_result(
                GoogleOAuthResultCode.EXISTING_ACCOUNT_CONNECT_REQUIRED
            )
        return redirect_google_oauth_result(GoogleOAuthResultCode.AUTHENTICATION_FAILED)

    return _finalize_owner_login(request, user)
def handle_google_oauth_link(
    request,
    identity: GoogleIdentity,
    *,
    owner_user_id: int,
) -> HttpResponseRedirect:
    actor = request.user
    if not getattr(actor, "is_authenticated", False) or actor.pk != owner_user_id:
        return redirect_google_account_security_result(GoogleOAuthResultCode.AUTHENTICATION_REQUIRED)

    if getattr(actor, "is_staff", False) or getattr(actor, "is_superuser", False):
        return redirect_google_account_security_result(GoogleOAuthResultCode.AUTHENTICATION_FAILED)

    existing_for_subject = get_google_provider_link(subject=identity.subject)
    if existing_for_subject is not None and existing_for_subject.user_id != actor.pk:
        return redirect_google_account_security_result(GoogleOAuthResultCode.GOOGLE_ALREADY_LINKED)

    owner_link = get_owner_google_link(actor)
    if owner_link is not None:
        if owner_link.provider_subject == identity.subject:
            update_google_provider_link_snapshot(owner_link, identity)
            return redirect_google_account_security_result(GoogleOAuthResultCode.ALREADY_LINKED)
        return redirect_google_account_security_result(GoogleOAuthResultCode.DIFFERENT_GOOGLE_LINKED)

    try:
        create_google_provider_link(actor, identity)
    except IntegrityError:
        existing_for_subject = get_google_provider_link(subject=identity.subject)
        if existing_for_subject is not None and existing_for_subject.user_id == actor.pk:
            update_google_provider_link_snapshot(existing_for_subject, identity)
            return redirect_google_account_security_result(GoogleOAuthResultCode.ALREADY_LINKED)
        return redirect_google_account_security_result(GoogleOAuthResultCode.GOOGLE_ALREADY_LINKED)

    return redirect_google_account_security_result(GoogleOAuthResultCode.LINKED)


def handle_google_oauth_verify(
    request,
    identity: GoogleIdentity,
    *,
    owner_user_id: int,
) -> HttpResponseRedirect:
    actor = request.user
    if not getattr(actor, "is_authenticated", False) or actor.pk != owner_user_id:
        return redirect_google_account_security_result(GoogleOAuthResultCode.AUTHENTICATION_REQUIRED)

    if getattr(actor, "is_staff", False) or getattr(actor, "is_superuser", False):
        return redirect_google_account_security_result(GoogleOAuthResultCode.AUTHENTICATION_FAILED)

    owner_link = get_owner_google_link(actor)
    if owner_link is None or owner_link.provider_subject != identity.subject:
        return redirect_google_account_security_result(GoogleOAuthResultCode.AUTHENTICATION_FAILED)

    update_google_provider_link_snapshot(owner_link, identity)
    record_owner_oauth_reauth(request, actor, OwnerAuthProvider.GOOGLE)
    return redirect_google_account_security_result(GoogleOAuthResultCode.VERIFIED)


def process_google_oauth_callback(request, *, code: str | None, state: str | None) -> HttpResponseRedirect:
    if not code or not state:
        return redirect_google_oauth_result(GoogleOAuthResultCode.AUTHENTICATION_FAILED)

    try:
        pending = consume_google_oauth_state(request, state)
    except GoogleOAuthStateError as exc:
        result = GoogleOAuthResultCode.INVALID_STATE
        if str(exc) == "expired_state":
            result = GoogleOAuthResultCode.INVALID_STATE
        return redirect_google_oauth_result(result)

    redirect_uri = google_oauth_redirect_uri(request)
    try:
        token_data = exchange_authorization_code(redirect_uri=redirect_uri, code=code)
        claims = verify_google_id_token(
            token_data["id_token"],
            expected_nonce=pending.nonce,
        )
    except GoogleOAuthClientError:
        return redirect_google_oauth_result(GoogleOAuthResultCode.AUTHENTICATION_FAILED)

    identity = parse_google_identity(claims)

    if pending.intent == INTENT_LOGIN:
        return handle_google_oauth_login(request, identity)
    if pending.intent == INTENT_REGISTER:
        return handle_google_oauth_register(
            request,
            identity,
            legal_acknowledgement=pending.legal_acknowledgement,
        )
    if pending.intent == INTENT_LINK:
        if pending.owner_user_id is None:
            return redirect_google_account_security_result(GoogleOAuthResultCode.INVALID_STATE)
        return handle_google_oauth_link(
            request,
            identity,
            owner_user_id=int(pending.owner_user_id),
        )
    if pending.intent == INTENT_VERIFY:
        if pending.owner_user_id is None:
            return redirect_google_account_security_result(GoogleOAuthResultCode.INVALID_STATE)
        return handle_google_oauth_verify(
            request,
            identity,
            owner_user_id=int(pending.owner_user_id),
        )
    return redirect_google_oauth_result(GoogleOAuthResultCode.INVALID_INTENT)
