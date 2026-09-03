from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.cache import cache
from django.core.files.storage import FileSystemStorage
from django.test import SimpleTestCase

from core.operational_metrics import (
    RESOURCE_SIZE_CACHE_SECONDS,
    application_size_bytes,
    build_operational_metrics,
    current_process_memory_bytes,
    database_size_bytes,
    format_size,
    media_storage_size_bytes,
)


class FakeCursor:
    def __init__(self, rows):
        self.rows = iter(rows)
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def execute(self, sql):
        self.executed.append(sql)

    def fetchone(self):
        return next(self.rows)


class FakeDatabaseConnection:
    def __init__(self, vendor, *, rows=(), name=""):
        self.vendor = vendor
        self.settings_dict = {"NAME": name}
        self.fake_cursor = FakeCursor(rows)

    def cursor(self):
        return self.fake_cursor


class OperationalMetricsTests(SimpleTestCase):
    def tearDown(self):
        cache.clear()

    def test_human_readable_size_formatting(self):
        self.assertEqual(format_size(None), "—")
        self.assertEqual(format_size(843 * 1024), "843 KB")
        self.assertEqual(format_size(612 * 1024**2), "612 MB")
        self.assertEqual(format_size(int(1.4 * 1024**3)), "1.4 GB")
        self.assertEqual(format_size(3 * 1024**4), "3 TB")

    def test_application_size_excludes_media_dependencies_builds_and_tests(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "app.py").write_bytes(b"a" * 100)
            (root / "public").mkdir()
            (root / "public" / "logo.webp").write_bytes(b"b" * 200)
            excluded = {
                "media": 300,
                "node_modules": 400,
                "dist": 500,
                "original_assets": 600,
                ".git": 700,
                "__pycache__": 800,
                "tests": 850,
            }
            for name, size in excluded.items():
                (root / name).mkdir()
                (root / name / "ignored.bin").write_bytes(b"x" * size)
            (root / "test_feature.py").write_bytes(b"t" * 900)
            (root / "widget.test.js").write_bytes(b"t" * 1000)

            self.assertEqual(application_size_bytes(roots=[root]), 300)

    def test_media_uses_configured_storage_and_stays_separate_from_application(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            media = root / "media"
            media.mkdir()
            (media / "workspace-logo.png").write_bytes(b"m" * 75)
            (media / "kiosks").mkdir()
            (media / "kiosks" / "background.webp").write_bytes(b"m" * 125)
            storage = FileSystemStorage(location=media)

            self.assertEqual(media_storage_size_bytes(storage=storage), 200)
            self.assertEqual(application_size_bytes(roots=[root]), 0)

    def test_postgresql_database_size_uses_native_database_function(self):
        database = FakeDatabaseConnection("postgresql", rows=[(76 * 1024**2,)])
        self.assertEqual(database_size_bytes(database_connection=database), 76 * 1024**2)
        self.assertEqual(
            database.fake_cursor.executed,
            ["SELECT pg_database_size(current_database())"],
        )

    def test_sqlite_database_size_includes_physical_sidecars(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "app.sqlite3"
            path.write_bytes(b"d" * 100)
            Path(f"{path}-wal").write_bytes(b"w" * 25)
            database = FakeDatabaseConnection("sqlite", name=str(path))
            self.assertEqual(database_size_bytes(database_connection=database), 125)

    def test_in_memory_sqlite_uses_page_allocation(self):
        database = FakeDatabaseConnection(
            "sqlite",
            name="file:memorydb_default?mode=memory&cache=shared",
            rows=[(10,), (4096,)],
        )
        self.assertEqual(database_size_bytes(database_connection=database), 40960)

    def test_current_memory_reads_current_linux_rss(self):
        with TemporaryDirectory() as directory:
            status = Path(directory) / "status"
            status.write_text("Name:\tpython\nVmRSS:\t438000 kB\n", encoding="utf-8")
            measured = current_process_memory_bytes(proc_status_path=status)
            self.assertEqual(measured, 438000 * 1024)
            self.assertEqual(format_size(measured), "428 MB")

    def test_each_expensive_resource_metric_is_cached_for_ten_minutes(self):
        self.assertEqual(RESOURCE_SIZE_CACHE_SECONDS, 600)

    def test_failed_metric_uses_neutral_unavailable_value(self):
        from unittest.mock import patch

        with (
            patch(
                "core.operational_metrics.application_size_bytes",
                side_effect=OSError("private path detail"),
            ),
            patch("core.operational_metrics.media_storage_size_bytes", return_value=0),
            patch("core.operational_metrics.database_size_bytes", return_value=0),
            patch("core.operational_metrics.current_process_memory_bytes", return_value=0),
            self.assertLogs("core.operational_metrics", level="WARNING"),
        ):
            metrics = build_operational_metrics()
        application = next(item for item in metrics if item["label"] == "Application size")
        self.assertEqual(application["value"], "—")
