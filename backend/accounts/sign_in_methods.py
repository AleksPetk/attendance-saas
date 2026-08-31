"""Owner sign-in method status and invariants (password, Google, Apple)."""

from __future__ import annotations

from accounts.owner_auth_provider_models import OwnerAuthProvider, OwnerAuthProviderLink


def owner_password_enabled(user) -> bool:
    return bool(user and user.has_usable_password())


def get_owner_provider_link(user, provider: str) -> OwnerAuthProviderLink | None:
    if user is None or not getattr(user, "pk", None):
        return None
    return OwnerAuthProviderLink.objects.filter(user=user, provider=provider).first()


def owner_linked_providers(user) -> dict[str, OwnerAuthProviderLink]:
    if user is None or not getattr(user, "pk", None):
        return {}
    return {
        row.provider: row
        for row in OwnerAuthProviderLink.objects.filter(user=user)
    }


def count_owner_sign_in_methods(user) -> int:
    links = owner_linked_providers(user)
    total = 0
    if owner_password_enabled(user):
        total += 1
    if OwnerAuthProvider.GOOGLE in links:
        total += 1
    if OwnerAuthProvider.APPLE in links:
        total += 1
    return total


def can_unlink_owner_provider(user, provider: str) -> bool:
    """
    A provider may be unlinked only when at least one other sign-in method remains.
    """
    links = owner_linked_providers(user)
    if provider not in links:
        return False
    return count_owner_sign_in_methods(user) > 1


def _provider_payload(link: OwnerAuthProviderLink | None) -> dict:
    return {
        "linked": link is not None,
        "provider_email": link.provider_email if link and link.provider_email else None,
        "provider_email_verified": bool(link.provider_email_verified) if link else False,
        "linked_at": link.linked_at.isoformat() if link and link.linked_at else None,
        "last_used_at": link.last_used_at.isoformat() if link and link.last_used_at else None,
    }


def sign_in_methods_payload(user) -> dict:
    """
    Structured sign-in method status for owner account APIs.

    Used by GET /api/auth/account/ and future Account → Security UI (Phase 5).
    """
    links = owner_linked_providers(user)
    password_enabled = owner_password_enabled(user)
    google_link = links.get(OwnerAuthProvider.GOOGLE)
    apple_link = links.get(OwnerAuthProvider.APPLE)
    method_count = count_owner_sign_in_methods(user)

    return {
        "password": {"enabled": password_enabled},
        "google": _provider_payload(google_link),
        "apple": _provider_payload(apple_link),
        "method_count": method_count,
        "can_unlink_google": can_unlink_owner_provider(user, OwnerAuthProvider.GOOGLE),
        "can_unlink_apple": can_unlink_owner_provider(user, OwnerAuthProvider.APPLE),
        "must_keep_one_method": True,
    }
