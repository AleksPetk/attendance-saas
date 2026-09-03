"""External HTTP probes. Never include raw error text in results."""

import json
import urllib.error
import urllib.request

from status_service.states import (
    RESULT_DEGRADED,
    RESULT_FAILURE,
    RESULT_SUCCESS,
    RESULT_UNCONFIGURED,
)

USER_AGENT = "CheckStation-Status/1.0"

# Production Django uses SECURE_SSL_REDIRECT behind the reverse proxy.
# Internal HTTP probes must advertise HTTPS so urllib is not redirected to
# an unreachable https://… URL on the Docker network.
DJANGO_INTERNAL_PROBE_HEADERS = {
    "X-Forwarded-Proto": "https",
}


class ProbeResult:
    def __init__(self, kind, description=""):
        self.kind = kind
        self.description = description


def _request(url, timeout, method="GET", headers=None):
    request_headers = {
        "Accept": "application/json, text/html;q=0.9,*/*;q=0.8",
        "User-Agent": USER_AGENT,
    }
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(
        url,
        method=method,
        headers=request_headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return response.getcode(), raw
    except urllib.error.HTTPError as exc:
        body = exc.read()
        return exc.code, body
    except Exception:
        return None, b""


def _json_status(raw):
    try:
        data = json.loads(raw.decode("utf-8", errors="replace"))
    except (TypeError, ValueError, UnicodeError):
        return None
    if not isinstance(data, dict):
        return None
    return str(data.get("status") or "").strip().lower() or None


def probe_django_health(url, timeout, headers=None):
    if not url:
        return ProbeResult(RESULT_UNCONFIGURED, "Not configured")
    code, raw = _request(url, timeout, headers=headers)
    if code is None:
        return ProbeResult(RESULT_FAILURE)
    payload_status = _json_status(raw)
    if code == 200 and payload_status == "ok":
        return ProbeResult(RESULT_SUCCESS)
    if payload_status == "unconfigured":
        return ProbeResult(RESULT_UNCONFIGURED, "Not configured")
    if payload_status == "unknown":
        return ProbeResult(RESULT_UNCONFIGURED, "Not enough health evidence")
    if payload_status == "degraded":
        return ProbeResult(RESULT_DEGRADED)
    if 500 <= (code or 0) < 600:
        return ProbeResult(RESULT_FAILURE)
    return ProbeResult(RESULT_FAILURE)


def probe_http_page(url, timeout):
    if not url:
        return ProbeResult(RESULT_UNCONFIGURED, "Not configured")
    code, _raw = _request(url, timeout)
    if code is None:
        return ProbeResult(RESULT_FAILURE)
    if 200 <= code < 300:
        return ProbeResult(RESULT_SUCCESS)
    if 500 <= code < 600:
        return ProbeResult(RESULT_FAILURE)
    return ProbeResult(RESULT_FAILURE)


def probe_csrf(url, timeout, headers=None):
    if not url:
        return ProbeResult(RESULT_UNCONFIGURED, "Not configured")
    code, raw = _request(url, timeout, headers=headers)
    if code is None:
        return ProbeResult(RESULT_FAILURE)
    if code != 200:
        return ProbeResult(RESULT_FAILURE)
    try:
        data = json.loads(raw.decode("utf-8", errors="replace"))
    except (TypeError, ValueError, UnicodeError):
        return ProbeResult(RESULT_FAILURE)
    token = data.get("csrfToken") if isinstance(data, dict) else None
    if isinstance(token, str) and token.strip():
        return ProbeResult(RESULT_SUCCESS)
    return ProbeResult(RESULT_FAILURE)


def combine_auth_results(csrf_result, api_result):
    """Auth is healthy only when CSRF works and the API/DB health is ok."""
    if api_result.kind == RESULT_DEGRADED:
        return ProbeResult(RESULT_DEGRADED)
    if csrf_result.kind == RESULT_SUCCESS and api_result.kind == RESULT_SUCCESS:
        return ProbeResult(RESULT_SUCCESS)
    if csrf_result.kind == RESULT_UNCONFIGURED or api_result.kind == RESULT_UNCONFIGURED:
        return ProbeResult(RESULT_UNCONFIGURED, "Not configured")
    return ProbeResult(RESULT_FAILURE)


class ProbeRunner:
    def __init__(self, config):
        self.config = config

    def run_all(self):
        timeout = self.config["http_timeout_seconds"]
        api = self.config["api_url"]
        website = self.config["website_url"]
        workspace = self.config["workspace_url"]
        docs = self.config["docs_url"]

        django_headers = dict(DJANGO_INTERNAL_PROBE_HEADERS)
        token = (self.config.get("status_probe_token") or "").strip()
        provider_headers = dict(django_headers)
        if token:
            provider_headers["X-Status-Probe-Token"] = token

        api_health = probe_django_health(
            f"{api}/api/health/", timeout, headers=django_headers
        )
        kiosk = probe_django_health(
            f"{api}/api/health/kiosk/", timeout, headers=django_headers
        )
        email = probe_django_health(
            f"{api}/api/health/email/", timeout, headers=provider_headers
        )
        stripe = probe_django_health(
            f"{api}/api/health/stripe/", timeout, headers=provider_headers
        )
        csrf = probe_csrf(f"{api}/api/auth/csrf/", timeout, headers=django_headers)
        auth = combine_auth_results(csrf, api_health)

        return {
            "workspace_web_app": probe_http_page(f"{workspace}/login", timeout),
            "api_backend": api_health,
            "kiosk_operations": kiosk,
            "authentication": auth,
            "email_delivery": email,
            "billing_stripe": stripe,
            "public_website": probe_http_page(f"{website}/", timeout),
            "documentation": probe_http_page(docs, timeout) if docs else ProbeResult(
                RESULT_UNCONFIGURED,
                "Not configured",
            ),
        }
