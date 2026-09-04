"""Claim abandoned unverified password signups with verified OAuth identity."""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from accounts.email_uniqueness import normalize_owner_email
from accounts.owner_auth_provider_models import OwnerAuthProviderLink
from accounts.services import provision_verified_owner
from accounts.sessions import invalidate_owner_sessions

logger = logging.getLogger("accounts.provisional_ownership")
User = get_user_model()


class ProvisionalClaimError(Exception):
    """Raised when a provisional signup cannot be safely claimed."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@transaction.atomic
def claim_provisional_owner_with_oauth(
    provisional_user,
    *,
    identity_email: str,
    billing_market: str,
    create_provider_link,
    identity,
):
    """
    Convert an unverified password signup into a verified OAuth-owned account.

    - Invalidates the attacker-controlled password
    - Invalidates existing owner sessions and verification/reset tokens
    - Attaches the verified provider link
    - Provisions the workspace (idempotent if a legacy pending org exists)
    """
    user = User.objects.select_for_update().get(pk=provisional_user.pk)

    if user.email_verified or user.is_staff or user.is_superuser:
        raise ProvisionalClaimError("not_provisional")

    if normalize_owner_email(user.email) != normalize_owner_email(identity_email):
        raise ProvisionalClaimError("email_mismatch")

    if OwnerAuthProviderLink.objects.filter(user=user).exists():
        raise ProvisionalClaimError("not_provisional")

    invalidate_owner_sessions(user)
    user.set_unusable_password()
    user.is_active = True
    user.email_verified = True
    user.email_verified_at = timezone.now()
    user.signup_billing_market = str(billing_market or "").strip().lower()
    user.save(
        update_fields=[
            "password",
            "is_active",
            "email_verified",
            "email_verified_at",
            "signup_billing_market",
        ]
    )

    create_provider_link(user, identity)
    _, organization, _created = provision_verified_owner(
        user, billing_market=billing_market
    )
    logger.info(
        "Claimed provisional signup user_id=%s organization_id=%s market=%s",
        user.pk,
        getattr(organization, "pk", None),
        billing_market,
    )
    return user
