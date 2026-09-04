"""Apple OAuth state/nonce for owner sign-in (form_post safe).

Apple's web flow uses response_mode=form_post. That cross-site POST from
appleid.apple.com typically does not include SameSite=Lax session cookies, so
pending OAuth data cannot live only in the normal Django session.

The `state` parameter sent to Apple is a Django-signed payload carrying intent,
nonce, and optional owner binding. Replay protection uses a cache-backed JTI.
The normal CheckStation session cookie stays SameSite=Lax globally.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass

from django.core import signing
from django.core.cache import cache
from django.utils import timezone

from accounts.apple_oauth_settings import apple_oauth_state_ttl_seconds

OWNER_APPLE_OAUTH_SESSION_KEY = "_owner_apple_oauth_pending"
APPLE_OAUTH_STATE_SALT = "accounts.apple_oauth.state.v1"
APPLE_OAUTH_JTI_CACHE_PREFIX = "apple_oauth_used_jti:"

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
    jti: str = ""


def _jti_cache_key(jti: str) -> str:
    return f"{APPLE_OAUTH_JTI_CACHE_PREFIX}{jti}"


def _sign_payload(payload: dict) -> str:
    return signing.dumps(payload, salt=APPLE_OAUTH_STATE_SALT, compress=True)


def _unsign_payload(token: str) -> dict:
    return signing.loads(
        token,
        salt=APPLE_OAUTH_STATE_SALT,
        max_age=apple_oauth_state_ttl_seconds(),
    )


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

    nonce = secrets.token_urlsafe(32)
    jti = secrets.token_urlsafe(32)
    created_at = timezone.now().isoformat()
    payload = {
        "v": 1,
        "nonce": nonce,
        "intent": intent,
        "legal": bool(legal_acknowledgement),
        "owner_id": owner_user_id,
        "jti": jti,
        "iat": created_at,
    }
    signed_state = _sign_payload(payload)

    pending = AppleOAuthPendingState(
        state=signed_state,
        nonce=nonce,
        intent=intent,
        session_key=request.session.session_key or "",
        created_at=created_at,
        legal_acknowledgement=bool(legal_acknowledgement),
        owner_user_id=owner_user_id,
        jti=jti,
    )
    # Best-effort same-browser mirror only. Callback must not require it.
    request.session[OWNER_APPLE_OAUTH_SESSION_KEY] = {
        "state": pending.state,
        "nonce": pending.nonce,
        "intent": pending.intent,
        "session_key": pending.session_key,
        "created_at": pending.created_at,
        "legal_acknowledgement": pending.legal_acknowledgement,
        "owner_user_id": pending.owner_user_id,
        "jti": pending.jti,
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
            jti=str(raw.get("jti") or ""),
        )
    except (KeyError, TypeError, ValueError):
        return None


def clear_apple_oauth_state(request) -> None:
    if OWNER_APPLE_OAUTH_SESSION_KEY in request.session:
        request.session.pop(OWNER_APPLE_OAUTH_SESSION_KEY, None)
        request.session.modified = True


def consume_apple_oauth_state(request, submitted_state: str) -> AppleOAuthPendingState:
    """
    Validate and single-use-consume the signed Apple `state` parameter.

    Does not require the Lax session cookie. Session mirror is cleared when present.
    """
    if not submitted_state or not isinstance(submitted_state, str):
        raise AppleOAuthStateError("invalid_state")

    try:
        payload = _unsign_payload(submitted_state)
    except signing.SignatureExpired as exc:
        clear_apple_oauth_state(request)
        raise AppleOAuthStateError("expired_state") from exc
    except signing.BadSignature as exc:
        clear_apple_oauth_state(request)
        raise AppleOAuthStateError("invalid_state") from exc

    if not isinstance(payload, dict) or int(payload.get("v") or 0) != 1:
        clear_apple_oauth_state(request)
        raise AppleOAuthStateError("invalid_state")

    intent = str(payload.get("intent") or "")
    nonce = str(payload.get("nonce") or "")
    jti = str(payload.get("jti") or "")
    if intent not in VALID_INTENTS or not nonce or not jti:
        clear_apple_oauth_state(request)
        raise AppleOAuthStateError("invalid_state")

    owner_user_id = payload.get("owner_id")
    if owner_user_id is not None:
        try:
            owner_user_id = int(owner_user_id)
        except (TypeError, ValueError) as exc:
            clear_apple_oauth_state(request)
            raise AppleOAuthStateError("invalid_state") from exc

    ttl = apple_oauth_state_ttl_seconds()
    # cache.add is atomic: fails if JTI was already consumed (replay).
    if not cache.add(_jti_cache_key(jti), "1", timeout=max(ttl, 1)):
        clear_apple_oauth_state(request)
        raise AppleOAuthStateError("invalid_state")

    clear_apple_oauth_state(request)
    return AppleOAuthPendingState(
        state=submitted_state,
        nonce=nonce,
        intent=intent,
        session_key="",
        created_at=str(payload.get("iat") or ""),
        legal_acknowledgement=bool(payload.get("legal")),
        owner_user_id=owner_user_id,
        jti=jti,
    )
