import base64
import hashlib
import os

# Must be set before config.settings reads the project `.env` file.
os.environ["DEBUG"] = "True"
os.environ.setdefault(
    "SECRET_KEY",
    "django-insecure-checkstation-tests-only-not-for-production",
)

# Full-suite validation uses PostgreSQL. Developer `.env` files may point at
# a local SQLite file for fast iteration; do not inherit that for `manage.py test`.
_test_database_url = (
    os.environ.get("TEST_DATABASE_URL")
    or os.environ.get("DATABASE_URL")
    or ""
).strip()
if not _test_database_url.startswith("postgres"):
    _test_database_url = "postgres://attendance:attendance@db:5432/attendance"
os.environ["DATABASE_URL"] = _test_database_url


def _deterministic_test_fernet_key(label: str) -> str:
    digest = hashlib.sha256(f"checkstation-test:{label}".encode()).digest()
    return base64.urlsafe_b64encode(digest).decode()


# Django's test runner forces DEBUG=False during execution; provide valid keys.
os.environ["PLATFORM_2FA_ENCRYPTION_KEY"] = _deterministic_test_fernet_key(
    "platform-2fa"
)
os.environ["APP_SECRETS_ENCRYPTION_KEY"] = _deterministic_test_fernet_key(
    "app-secrets"
)
os.environ["STATUS_PROBE_TOKEN"] = "test-status-probe-token"

from config.settings import *  # noqa: F403,F401

DEBUG = True  # noqa: F405

# Undo production-like flags that config.settings may enable when DEBUG was False
# in the developer's `.env` before we forced DEBUG=True above.
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SECURE_SSL_REDIRECT = False
SECURE_PROXY_SSL_HEADER = None
