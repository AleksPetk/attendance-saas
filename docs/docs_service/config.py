"""Environment configuration for the public Docs website."""

import os
from pathlib import Path


def _int(name, default):
    raw = os.environ.get(name, "")
    if raw is None or str(raw).strip() == "":
        return int(default)
    return int(raw)


def _url(name, default=""):
    return str(os.environ.get(name, default) or "").strip().rstrip("/")


def load_config():
    api_base = _url("DOCS_API_BASE_URL", "http://localhost:8000")
    return {
        "host": os.environ.get("DOCS_HOST", "0.0.0.0").strip() or "0.0.0.0",
        "port": _int("DOCS_PORT", 8091),
        # Browser-facing Django origin. Never a Docker-internal hostname.
        "api_base_url": api_base,
        # Optional in-network origin for server-side meta fetch in Compose.
        "internal_api_url": _url("DOCS_INTERNAL_API_URL", api_base),
        "public_url": _url("DOCS_PUBLIC_URL", "http://localhost:8091"),
        "main_site_url": _url("DOCS_MAIN_SITE_URL", "http://localhost:5173"),
        "status_public_url": _url("STATUS_PUBLIC_URL", "http://localhost:8090"),
        "static_dir": Path(__file__).resolve().parent.parent / "static",
    }
