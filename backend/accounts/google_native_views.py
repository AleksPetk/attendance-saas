"""Native iOS Google Sign-In completion view (JSON; no browser redirect)."""

from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from accounts.google_native_auth import complete_google_native_authentication


def _coerce_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


class GoogleNativeCompleteView(APIView):
    """
    POST /api/auth/google/native/

    Accepts a native Google ID token from the iOS app and verifies audience
    against GOOGLE_OAUTH_CLIENT_ID (Web/server client / webClientId).

    Intents:
    - login / register: OwnerAuthProviderLink + complete_owner_authentication
    - verify: authenticated owner re-check; records `_owner_oauth_reauth`
      on the existing session (no login completion / session replace)
    """

    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data if hasattr(request, "data") else {}
        identity_token = data.get("identity_token") or data.get("identityToken") or ""
        intent = data.get("intent") or ""
        legal_acknowledgement = _coerce_bool(data.get("legal_acknowledgement"))

        return complete_google_native_authentication(
            request,
            identity_token=str(identity_token),
            intent=str(intent),
            legal_acknowledgement=legal_acknowledgement,
        )
