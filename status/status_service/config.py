"""Environment configuration for the independent Status service."""

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
    data_dir = Path(os.environ.get("STATUS_DATA_DIR", "") or "./data").resolve()
    return {
        "host": os.environ.get("STATUS_HOST", "0.0.0.0").strip() or "0.0.0.0",
        "port": _int("STATUS_PORT", 8090),
        "api_url": _url("STATUS_API_URL", "http://localhost:8000"),
        "website_url": _url("STATUS_WEBSITE_URL", "http://localhost:5173"),
        "workspace_url": _url("STATUS_WORKSPACE_URL", "http://localhost:5173"),
        "docs_url": _url("STATUS_DOCS_URL", ""),
        "probe_interval_seconds": max(5, _int("STATUS_PROBE_INTERVAL_SECONDS", 60)),
        "stale_threshold_seconds": max(30, _int("STATUS_STALE_THRESHOLD_SECONDS", 180)),
        "http_timeout_seconds": max(2, _int("STATUS_HTTP_TIMEOUT_SECONDS", 8)),
        "browser_poll_seconds": max(5, _int("STATUS_BROWSER_POLL_SECONDS", 30)),
        "data_dir": data_dir,
        "database_path": data_dir / "status.sqlite3",
        "static_dir": Path(__file__).resolve().parent.parent / "static",
    }
