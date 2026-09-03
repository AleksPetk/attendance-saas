"""Failure-safe operational resource metrics for the Platform Admin dashboard."""

from __future__ import annotations

import logging
import os
import posixpath
import subprocess
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.db import connection

logger = logging.getLogger(__name__)

RESOURCE_SIZE_CACHE_SECONDS = 10 * 60
UNAVAILABLE_VALUE = "—"

APPLICATION_EXCLUDED_DIRECTORIES = frozenset(
    {
        ".git",
        ".hg",
        ".svn",
        ".venv",
        "venv",
        "env",
        "node_modules",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        ".cache",
        ".parcel-cache",
        ".turbo",
        "tests",
        "coverage",
        "htmlcov",
        "tmp",
        "temp",
        "logs",
        "media",
        "original_assets",
        # Generated copies are excluded because source/public static assets are counted.
        "staticfiles",
        "dist",
        "build",
        "out",
    }
)


def format_size(byte_count):
    """Format bytes compactly for dashboard cards; None is unavailable."""
    if byte_count is None:
        return UNAVAILABLE_VALUE
    try:
        size = max(0, int(byte_count))
    except (TypeError, ValueError):
        return UNAVAILABLE_VALUE
    units = ("B", "KB", "MB", "GB", "TB")
    value = float(size)
    unit = units[0]
    for candidate in units:
        unit = candidate
        if value < 1024 or candidate == units[-1]:
            break
        value /= 1024
    if unit == "B":
        return f"{int(value)} {unit}"
    if value < 10 and not value.is_integer():
        return f"{value:.1f} {unit}"
    return f"{value:.0f} {unit}"


def _is_application_file(path):
    name = path.name.lower()
    if name in {".ds_store", ".coverage", ".env"} or name.startswith(".env."):
        return False
    if name.endswith((".pyc", ".pyo", ".log", ".tmp", ".temp", ".sqlite3", ".sqlite3-journal")):
        return False
    if name.startswith("test_") and name.endswith(".py"):
        return False
    if name.startswith("tests") and name.endswith(".py"):
        return False
    if name.endswith((".test.js", ".test.jsx", ".spec.js", ".spec.jsx")):
        return False
    return True


def configured_application_roots():
    configured = getattr(settings, "PLATFORM_APPLICATION_SIZE_ROOTS", None)
    if configured:
        candidates = [Path(item) for item in configured]
    else:
        backend_root = Path(settings.BASE_DIR)
        project_root = backend_root.parent
        candidates = [
            backend_root,
            project_root / "frontend",
            project_root / "docs",
            project_root / "status",
        ]
    roots = []
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if not resolved.exists() or resolved.name in APPLICATION_EXCLUDED_DIRECTORIES:
            continue
        if any(resolved == root or root in resolved.parents for root in roots):
            continue
        roots.append(resolved)
    return tuple(roots)


def application_size_bytes(*, roots=None):
    """Size of project-owned application files without runtime/development data."""
    roots = tuple(Path(root) for root in (roots or configured_application_roots()))
    total = 0
    seen_files = set()
    stack = list(roots)
    while stack:
        current = stack.pop()
        if current.name in APPLICATION_EXCLUDED_DIRECTORIES:
            continue
        try:
            if current.is_symlink():
                continue
            if current.is_file():
                if not _is_application_file(current):
                    continue
                stat = current.stat()
                identity = (stat.st_dev, stat.st_ino)
                if identity not in seen_files:
                    seen_files.add(identity)
                    total += stat.st_size
                continue
            with os.scandir(current) as entries:
                for entry in entries:
                    if entry.is_symlink():
                        continue
                    if entry.is_dir(follow_symlinks=False):
                        if entry.name not in APPLICATION_EXCLUDED_DIRECTORIES:
                            stack.append(Path(entry.path))
                    elif entry.is_file(follow_symlinks=False):
                        stack.append(Path(entry.path))
        except OSError as exc:
            raise OSError("Could not read the application footprint.") from exc
    return total


def media_storage_size_bytes(*, storage=None):
    """Recursively sum the configured Django default storage namespace."""
    storage = storage or default_storage
    total = 0
    pending = [""]
    visited = set()
    while pending:
        directory = pending.pop()
        if directory in visited:
            continue
        visited.add(directory)
        directories, files = storage.listdir(directory)
        for child in directories:
            pending.append(posixpath.join(directory, child) if directory else child)
        for filename in files:
            name = posixpath.join(directory, filename) if directory else filename
            total += int(storage.size(name))
    return total


def database_size_bytes(*, database_connection=None):
    """Return physical database allocation using the active engine's native data."""
    db = database_connection or connection
    if db.vendor == "postgresql":
        with db.cursor() as cursor:
            cursor.execute("SELECT pg_database_size(current_database())")
            row = cursor.fetchone()
        return int(row[0]) if row and row[0] is not None else None

    if db.vendor == "sqlite":
        name = str(db.settings_dict.get("NAME") or "")
        in_memory = name == ":memory:" or (
            name.startswith("file:") and "mode=memory" in name
        )
        if name and not in_memory:
            path = Path(name)
            total = path.stat().st_size
            for suffix in ("-wal", "-shm", "-journal"):
                sidecar = Path(f"{path}{suffix}")
                if sidecar.exists():
                    total += sidecar.stat().st_size
            return total
        with db.cursor() as cursor:
            cursor.execute("PRAGMA page_count")
            page_count = int(cursor.fetchone()[0])
            cursor.execute("PRAGMA page_size")
            page_size = int(cursor.fetchone()[0])
        return page_count * page_size

    return None


def current_process_memory_bytes(*, proc_status_path="/proc/self/status"):
    """Current RSS for the Django process serving this dashboard request."""
    try:
        for line in Path(proc_status_path).read_text(encoding="utf-8").splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1]) * 1024
    except (OSError, ValueError, IndexError):
        pass

    try:
        result = subprocess.run(
            ["ps", "-o", "rss=", "-p", str(os.getpid())],
            check=True,
            capture_output=True,
            text=True,
            timeout=1,
        )
        return int(result.stdout.strip()) * 1024
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def _cached_measurement(cache_key, collector):
    try:
        cached = cache.get(cache_key)
        if isinstance(cached, dict) and "bytes" in cached:
            return cached["bytes"]
        value = collector()
        cache.set(cache_key, {"bytes": value}, RESOURCE_SIZE_CACHE_SECONDS)
        return value
    except Exception:
        logger.warning("Could not collect an operational dashboard metric.", exc_info=True)
        return None


def _live_measurement(collector):
    try:
        return collector()
    except Exception:
        logger.warning("Could not collect a live operational dashboard metric.", exc_info=True)
        return None


def build_operational_metrics():
    application = _cached_measurement(
        "platform-dashboard:application-size:v1", application_size_bytes
    )
    media = _cached_measurement(
        "platform-dashboard:media-size:v1", media_storage_size_bytes
    )
    database = _cached_measurement(
        "platform-dashboard:database-size:v1", database_size_bytes
    )
    memory = _live_measurement(current_process_memory_bytes)
    return (
        {"label": "Application size", "value": format_size(application), "hint": "Code + static assets"},
        {"label": "Media storage", "value": format_size(media), "hint": "Workspace uploads"},
        {"label": "Database size", "value": format_size(database), "hint": "Application data"},
        {"label": "Memory usage", "value": format_size(memory), "hint": "Current process usage"},
    )
