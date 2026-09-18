"""Native iOS Sign in with Apple completion view (JSON; no browser redirect)."""

from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from accounts.apple_native_auth import complete_apple_native_authentication


def _coerce_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


class AppleNativeCompleteView(APIView):
    """
    POST /api/auth/apple/native/

    Accepts a native Apple identityToken + raw nonce from the iOS app,
    verifies audience app.checkstation.client (APPLE_NATIVE_IOS_CLIENT_ID).

    Intents:
    - login / register: OwnerAuthProviderLink + complete_owner_authentication
    - verify: authenticated owner re-check; records `_owner_oauth_reauth`
      on the existing session (no login completion / session replace)
    - link: authenticated owner connects Apple using the same provider-link
      rules as Browser intent=link (JSON; no redirect / no session replace)
    """

    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data if hasattr(request, "data") else {}
        identity_token = data.get("identity_token") or data.get("identityToken") or ""
        raw_nonce = data.get("nonce") or data.get("raw_nonce") or ""
        intent = data.get("intent") or ""
        legal_acknowledgement = _coerce_bool(data.get("legal_acknowledgement"))
        full_name = data.get("full_name") or data.get("fullName")
        if full_name is not None and not isinstance(full_name, dict):
            full_name = None

        return complete_apple_native_authentication(
            request,
            identity_token=str(identity_token),
            raw_nonce=str(raw_nonce),
            intent=str(intent),
            legal_acknowledgement=legal_acknowledgement,
            full_name=full_name,
        )
