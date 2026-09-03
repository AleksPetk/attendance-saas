"""
Production Django settings for CheckStation.

Use:
  DJANGO_SETTINGS_MODULE=config.settings_production

Does not deploy anything by itself. Requires a complete production environment
(secrets, hosts, encryption keys). Local development continues to use
config.settings with DEBUG=True.
"""

from django.core.exceptions import ImproperlyConfigured

# Import shared application settings first (reads .env / process env).
from config.settings import *  # noqa: F403

# Production must never run with DEBUG.
if DEBUG:  # noqa: F405
    raise ImproperlyConfigured(
        "config.settings_production requires DEBUG=False. "
        "Unset DEBUG or set DEBUG=False in the production environment."
    )

# Host-only cookies: do not set SESSION_COOKIE_DOMAIN / CSRF_COOKIE_DOMAIN.
# Workspace cookies stay on workspace.checkstation.app; Docs/Status never share them.
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)  # noqa: F405
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# HSTS starts at 0 for first-deploy validation; raise after HTTPS is proven stable.
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=0)  # noqa: F405
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool(  # noqa: F405
    "SECURE_HSTS_INCLUDE_SUBDOMAINS", default=False
)
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=False)  # noqa: F405

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = env(  # noqa: F405
    "SECURE_REFERRER_POLICY", default="same-origin"
)
X_FRAME_OPTIONS = "DENY"

# WhiteNoise serves collectstatic output. React SPA is not served from Django.
if "whitenoise.middleware.WhiteNoiseMiddleware" not in MIDDLEWARE:  # noqa: F405
    _security_idx = MIDDLEWARE.index(  # noqa: F405
        "django.middleware.security.SecurityMiddleware"
    )
    MIDDLEWARE.insert(  # noqa: F405
        _security_idx + 1, "whitenoise.middleware.WhiteNoiseMiddleware"
    )

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# Dedicated Fernet keys are mandatory in production (no SECRET_KEY derivation).
if not (APP_SECRETS_ENCRYPTION_KEY or "").strip():  # noqa: F405
    raise ImproperlyConfigured(
        "APP_SECRETS_ENCRYPTION_KEY must be set to a dedicated Fernet key "
        "when using config.settings_production."
    )
if not (PLATFORM_2FA_ENCRYPTION_KEY or "").strip():  # noqa: F405
    raise ImproperlyConfigured(
        "PLATFORM_2FA_ENCRYPTION_KEY must be set to a dedicated Fernet key "
        "when using config.settings_production."
    )

# Provider health probes require a shared secret in production.
if not (STATUS_PROBE_TOKEN or "").strip():  # noqa: F405
    raise ImproperlyConfigured(
        "STATUS_PROBE_TOKEN must be set when using config.settings_production. "
        "Status probes send it as X-Status-Probe-Token."
    )

# Shared Redis cache is required so rate limits work across Gunicorn workers.
REDIS_URL = (env("REDIS_URL", default="") or "").strip()  # noqa: F405
if not REDIS_URL:
    raise ImproperlyConfigured(
        "REDIS_URL must be set when using config.settings_production. "
        "Django cache, auth rate limits, Contact limits, and kiosk PIN limits "
        "require a shared cache backend."
    )

CACHES = {  # noqa: F405
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL,
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            "IGNORE_EXCEPTIONS": True,
        },
    }
}

# Behind nginx/Caddy on localhost: set USE_X_FORWARDED_FOR=True and
# TRUSTED_PROXY_IPS to the proxy container/host address (e.g. 127.0.0.1).
USE_X_FORWARDED_FOR = env.bool("USE_X_FORWARDED_FOR", default=True)  # noqa: F405
TRUSTED_PROXY_IPS = env.list("TRUSTED_PROXY_IPS", default=["127.0.0.1"])  # noqa: F405
