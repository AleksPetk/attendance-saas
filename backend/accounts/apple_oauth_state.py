"""Session-backed OAuth state and nonce for owner Apple sign-in."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import timedelta

from django.utils import timezone

from accounts.apple_oauth_settings import apple_oauth_state_ttl_seconds

OWNER_APPLE_OAUTH_SESSION_KEY = "_owner_apple_oauth_pending"

INTENT_LOGIN = "login"
INTENT_REGISTER = "register"
INTENT_LINK = "link"
INTENT_VERIFY = "verify"
VALID_INTENTS = frozenset({INTENT_LOGIN, INTENT_REGISTER, INTENT_LINK, INTENT_VERIFY})


class AppleOAuthStateError(Exception):
    """Raised when OAuth state validation fails."""


@dataclass(frozen=True)
class AppleOAuthPendingState:
    state: str
    nonce: str
    intent: str
    session_key: str
    created_at: str
    legal_acknowledgement: bool = False
    owner_user_id: int | None = None


def _parse_timestamp(raw: str | None):
    if not raw:
        return None
    try:
        parsed = timezone.datetime.fromisoformat(raw)
    except (TypeError, ValueError):
        return None
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def create_apple_oauth_state(
    request,
    *,
    intent: str,
    legal_acknowledgement: bool = False,
    owner_user_id: int | None = None,
) -> AppleOAuthPendingState:
    if intent not in VALID_INTENTS:
        raise ValueError(f"Unsupported Apple OAuth intent: {intent}")

    if not request.session.session_key:
        request.session.save()

    pending = AppleOAuthPendingState(
        state=secrets.token_urlsafe(32),
        nonce=secrets.token_urlsafe(32),
        intent=intent,
        session_key=request.session.session_key or "",
        created_at=timezone.now().isoformat(),
        legal_acknowledgement=bool(legal_acknowledgement),
        owner_user_id=owner_user_id,
    )
    request.session[OWNER_APPLE_OAUTH_SESSION_KEY] = {
        "state": pending.state,
        "nonce": pending.nonce,
        "intent": pending.intent,
        "session_key": pending.session_key,
        "created_at": pending.created_at,
        "legal_acknowledgement": pending.legal_acknowledgement,
        "owner_user_id": pending.owner_user_id,
    }
    request.session.modified = True
    return pending


def load_apple_oauth_state(request) -> AppleOAuthPendingState | None:
    raw = request.session.get(OWNER_APPLE_OAUTH_SESSION_KEY)
    if not isinstance(raw, dict):
        return None
    try:
        return AppleOAuthPendingState(
            state=str(raw["state"]),
            nonce=str(raw["nonce"]),
            intent=str(raw["intent"]),
            session_key=str(raw.get("session_key") or ""),
            created_at=str(raw["created_at"]),
            legal_acknowledgement=bool(raw.get("legal_acknowledgement")),
            owner_user_id=raw.get("owner_user_id"),
        )
    except (KeyError, TypeError, ValueError):
        return None


def clear_apple_oauth_state(request) -> None:
    request.session.pop(OWNER_APPLE_OAUTH_SESSION_KEY, None)
    request.session.modified = True


def consume_apple_oauth_state(request, submitted_state: str) -> AppleOAuthPendingState:
    pending = load_apple_oauth_state(request)
    if pending is None:
        raise AppleOAuthStateError("invalid_state")

    created_at = _parse_timestamp(pending.created_at)
    if created_at is None:
        clear_apple_oauth_state(request)
        raise AppleOAuthStateError("invalid_state")

    age = timezone.now() - created_at
    if age > timedelta(seconds=apple_oauth_state_ttl_seconds()):
        clear_apple_oauth_state(request)
        raise AppleOAuthStateError("expired_state")

    if not submitted_state or submitted_state != pending.state:
        raise AppleOAuthStateError("invalid_state")

    current_session_key = request.session.session_key or ""
    if pending.session_key and current_session_key != pending.session_key:
        clear_apple_oauth_state(request)
        raise AppleOAuthStateError("invalid_state")

    clear_apple_oauth_state(request)
    return pending
