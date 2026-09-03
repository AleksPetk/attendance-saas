"""Resolve the client IP for rate limiting and abuse protection.

By default only REMOTE_ADDR is used. When the app runs behind a known reverse
proxy (e.g. nginx on localhost), set USE_X_FORWARDED_FOR=True and list the
proxy addresses in TRUSTED_PROXY_IPS so X-Forwarded-For is honored only from
those hops — never from arbitrary public clients.
"""

from django.conf import settings


def get_client_ip(request) -> str:
    remote = (request.META.get("REMOTE_ADDR") or "0.0.0.0").strip()
    if not getattr(settings, "USE_X_FORWARDED_FOR", False):
        return remote.split(",")[0].strip() or "0.0.0.0"

    trusted = set(getattr(settings, "TRUSTED_PROXY_IPS", []) or [])
    if remote not in trusted:
        return remote.split(",")[0].strip() or "0.0.0.0"

    forwarded = (request.META.get("HTTP_X_FORWARDED_FOR") or "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip() or remote
    return remote.split(",")[0].strip() or "0.0.0.0"
