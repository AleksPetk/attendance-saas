"""
Selective CORS for credentialed workspace traffic vs anonymous public origins.

Credentialed origins (workspace SPA only) receive Access-Control-Allow-Credentials.

Anonymous origins (promo, Docs, Status) may receive ACAO for the public endpoints
they need, but never credentials — so a script on those origins cannot read
authenticated workspace API responses even when sibling-domain cookies would
otherwise be sent with a credentialed fetch.

CSRF_TRUSTED_ORIGINS is independent of this middleware. Public Contact is
csrf_exempt and uses Turnstile; it must not force promo into credentialed CORS.
"""

from django.conf import settings
from django.http import HttpResponse
from django.utils.cache import patch_vary_headers


def credentialed_origins():
    return [
        origin.rstrip("/")
        for origin in getattr(settings, "CORS_CREDENTIALED_ORIGINS", [])
        if origin
    ]


def anonymous_origins():
    return [
        origin.rstrip("/")
        for origin in getattr(settings, "CORS_ANONYMOUS_ORIGINS", [])
        if origin
    ]


def _request_origin(request):
    return (request.META.get("HTTP_ORIGIN") or "").rstrip("/")


def is_anonymous_only_origin(origin):
    if not origin:
        return False
    if origin in credentialed_origins():
        return False
    return origin in anonymous_origins()


class AnonymousOriginCorsMiddleware:
    """
    CORS for promo/Docs/Status without Allow-Credentials.

    Must run before CorsMiddleware so anonymous OPTIONS preflights are handled.
    CorsMiddleware continues to handle the workspace credentialed origin.
    Allows GET/HEAD/POST/OPTIONS so public Contact and Content/catalog work.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        origin = _request_origin(request)
        if is_anonymous_only_origin(origin) and request.method == "OPTIONS":
            response = HttpResponse(status=204)
            self._apply_headers(response, origin)
            return response

        response = self.get_response(request)
        if is_anonymous_only_origin(origin):
            self._apply_headers(response, origin)
            if "Access-Control-Allow-Credentials" in response:
                del response["Access-Control-Allow-Credentials"]
        return response

    def _apply_headers(self, response, origin):
        response["Access-Control-Allow-Origin"] = origin
        response["Access-Control-Allow-Methods"] = "GET, HEAD, POST, OPTIONS"
        response["Access-Control-Allow-Headers"] = (
            "Accept, Accept-Language, Content-Type, Authorization, X-CSRFToken"
        )
        patch_vary_headers(response, ("Origin",))
