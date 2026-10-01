"""
Scoped kiosk-exit credentials for PIN-protected exit after session expiry.

When an authenticated cookie session opens a Group kiosk, the server issues an
opaque high-entropy token. The raw token is returned once to the client and
only a SHA-256 digest is stored in the Django cache (LocMem locally, Redis in
production) with org/group scope and a bounded TTL.

The token authorizes ONLY kiosk exit PIN verification for that Group. It does
not restore a workspace session and cannot call members/groups/account APIs.

No database migration: cache-backed, same pattern as Apple OAuth JTI storage.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache

KIOSK_EXIT_TOKEN_CACHE_PREFIX = "kiosk_exit_token:v1:"
KIOSK_EXIT_ACTIVE_CACHE_PREFIX = "kiosk_exit_active:v1:"

# Always-on tablets may stay in kiosk for days/weeks. 30 days bounds exposure;
# each new authenticated kiosk launch replaces the active token for that Group.
DEFAULT_KIOSK_EXIT_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60


@dataclass(frozen=True)
class KioskExitTokenRecord:
    organization_id: int
    group_id: int
    token_hash: str


def kiosk_exit_token_ttl_seconds() -> int:
    raw = getattr(settings, "KIOSK_EXIT_TOKEN_TTL_SECONDS", None)
    if raw is None:
        return DEFAULT_KIOSK_EXIT_TOKEN_TTL_SECONDS
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_KIOSK_EXIT_TOKEN_TTL_SECONDS
    return max(60, value)


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _token_cache_key(token_hash: str) -> str:
    return f"{KIOSK_EXIT_TOKEN_CACHE_PREFIX}{token_hash}"


def _active_cache_key(*, organization_id: int, group_id: int) -> str:
    return f"{KIOSK_EXIT_ACTIVE_CACHE_PREFIX}{int(organization_id)}:{int(group_id)}"


def issue_kiosk_exit_token(*, organization_id: int, group_id: int) -> str:
    """
    Issue a new opaque exit token for one org/group and make it the only active
    credential for that Group (previous active digest is overwritten).
    """
    raw = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw)
    ttl = kiosk_exit_token_ttl_seconds()
    record = {
        "organization_id": int(organization_id),
        "group_id": int(group_id),
        "token_hash": token_hash,
    }
    cache.set(_token_cache_key(token_hash), record, timeout=ttl)
    cache.set(
        _active_cache_key(organization_id=organization_id, group_id=group_id),
        token_hash,
        timeout=ttl,
    )
    return raw


def lookup_kiosk_exit_token(raw_token: str | None) -> KioskExitTokenRecord | None:
    token = str(raw_token or "").strip()
    if not token or len(token) > 256:
        return None
    token_hash = _hash_token(token)
    record = cache.get(_token_cache_key(token_hash))
    if not isinstance(record, dict):
        return None
    try:
        organization_id = int(record["organization_id"])
        group_id = int(record["group_id"])
        stored_hash = str(record.get("token_hash") or token_hash)
    except (KeyError, TypeError, ValueError):
        return None
    if stored_hash != token_hash:
        return None
    active = cache.get(
        _active_cache_key(organization_id=organization_id, group_id=group_id)
    )
    if active != token_hash:
        # Replaced by a newer launch for this Group, or explicitly cleared.
        return None
    return KioskExitTokenRecord(
        organization_id=organization_id,
        group_id=group_id,
        token_hash=token_hash,
    )


def revoke_kiosk_exit_token(raw_token: str | None) -> None:
    record = lookup_kiosk_exit_token(raw_token)
    if record is None:
        # Still try to drop a digest even if active pointer already moved.
        token = str(raw_token or "").strip()
        if token:
            cache.delete(_token_cache_key(_hash_token(token)))
        return
    cache.delete(_token_cache_key(record.token_hash))
    active_key = _active_cache_key(
        organization_id=record.organization_id,
        group_id=record.group_id,
    )
    if cache.get(active_key) == record.token_hash:
        cache.delete(active_key)


def revoke_active_kiosk_exit_token(*, organization_id: int, group_id: int) -> None:
    active_key = _active_cache_key(
        organization_id=organization_id,
        group_id=group_id,
    )
    token_hash = cache.get(active_key)
    cache.delete(active_key)
    if token_hash:
        cache.delete(_token_cache_key(str(token_hash)))
