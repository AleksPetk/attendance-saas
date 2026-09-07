from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound


def _request_hostname(request):
    return request.get_host().partition(":")[0].strip().lower()


def is_manager_host(request):
    configured = getattr(settings, "MANAGER_HOST", "manager.checkstation.app")
    return _request_hostname(request) == str(configured).strip().lower()


class ManagerNoIndexMiddleware:
    """Keep every response on the private platform-manager host out of indexes."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if is_manager_host(request):
            response["X-Robots-Tag"] = "noindex, nofollow"
        return response


def manager_robots_txt(request):
    if not is_manager_host(request):
        return HttpResponseNotFound("Not found", content_type="text/plain")
    return HttpResponse(
        "User-agent: *\nDisallow: /\n",
        content_type="text/plain; charset=utf-8",
    )
