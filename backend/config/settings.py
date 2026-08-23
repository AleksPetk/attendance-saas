"""
Django settings for the attendance SaaS backend.

Environment variables are loaded from the process environment and optional .env file.
See .env.example at the repository root for documented variables.
"""

from pathlib import Path

import environ
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    CORS_ALLOWED_ORIGINS=(
        list,
        ["http://localhost:5173", "http://127.0.0.1:5173"],
    ),
    EMAIL_VERIFICATION_TIMEOUT=(int, 60 * 60 * 24),
    PASSWORD_RESET_TIMEOUT=(int, 60 * 60 * 24),
    EMAIL_VERIFICATION_RESEND_COOLDOWN=(int, 60),
    PASSWORD_RESET_RESEND_COOLDOWN=(int, 60),
    RESEND_TIMEOUT_SECONDS=(int, 15),
    PLATFORM_2FA_ENCRYPTION_KEY=(str, ""),
    APP_SECRETS_ENCRYPTION_KEY=(str, ""),
)

env_file = REPO_ROOT / ".env"
if env_file.exists():
    environ.Env.read_env(env_file)

SECRET_KEY = env("SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "accounts.apps.AccountsConfig",
    "organizations",
    "members",
    "groups",
    "core.apps.CoreConfig",
    "attendance",
    "kiosk_builder",
]

AUTH_USER_MODEL = "accounts.User"

# Enable session-based authentication for both:
# - paying owners (accounts.User via ModelBackend)
# - workspace staff/admin (WorkspaceStaffAccount via a custom backend)
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "organizations.authentication.WorkspaceStaffSessionAuthenticationBackend",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "config.session_isolation.PlatformAdminSessionIsolationMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "accounts.two_factor_middleware.PlatformAdminTwoFactorMiddleware",
    "attendance.kiosk_lock_middleware.KioskLockMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgres://attendance:attendance@localhost:5432/attendance",
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS")
# Required for the SPA fetch(..., { credentials: "include" }) cookie session.
CORS_ALLOW_CREDENTIALS = True

# SPA runs on a separate origin (Vite dev server). Trusted origins lets
# Django enforce CSRF protection for cookie-based auth from the frontend.
CSRF_TRUSTED_ORIGINS = list(CORS_ALLOWED_ORIGINS)

# Cookie settings tuned for browser session auth.
# Check Station app and Django admin use separate cookie names so the same
# browser can hold a platform-admin session and a customer/workspace session.
SESSION_COOKIE_NAME = "checkstation_sessionid"
CSRF_COOKIE_NAME = "checkstation_csrftoken"
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False

ADMIN_SESSION_COOKIE_NAME = "checkstation_admin_sessionid"
ADMIN_CSRF_COOKIE_NAME = "checkstation_admin_csrftoken"
ADMIN_SESSION_COOKIE_PATH = "/admin"
CORS_ALLOW_HEADERS = (
    *default_headers,
    "x-workspace-id",
)

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "organizations.authentication.WorkspaceStaffBasicAuthentication",
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
}

# Public product name used in transactional account emails.
PRODUCT_NAME = "Check Station"

# Browser origin used to build verification and password-reset links.
# Never accept a user-supplied redirect target for these emails.
FRONTEND_BASE_URL = env("FRONTEND_BASE_URL", default="http://localhost:5173").rstrip("/")

# Paying-customer email verification tokens (Django HMAC, not stored raw).
EMAIL_VERIFICATION_TIMEOUT = env("EMAIL_VERIFICATION_TIMEOUT")
EMAIL_VERIFICATION_RESEND_COOLDOWN = env("EMAIL_VERIFICATION_RESEND_COOLDOWN")

# Django password-reset tokens. Also used by PasswordResetTokenGenerator.
PASSWORD_RESET_TIMEOUT = env("PASSWORD_RESET_TIMEOUT")
PASSWORD_RESET_RESEND_COOLDOWN = env("PASSWORD_RESET_RESEND_COOLDOWN")

# Transactional email (Resend). The API key must come from the environment.
RESEND_API_KEY = env("RESEND_API_KEY", default="")
RESEND_FROM_EMAIL = env(
    "RESEND_FROM_EMAIL",
    default="accounts@checkstation.alekspetk.com",
)
RESEND_FROM_NAME = env("RESEND_FROM_NAME", default=PRODUCT_NAME)
RESEND_TIMEOUT_SECONDS = env("RESEND_TIMEOUT_SECONDS")

# Optional Fernet key for encrypting platform-operator TOTP secrets at rest.
# Local DEBUG may derive a key from SECRET_KEY when this is empty.
PLATFORM_2FA_ENCRYPTION_KEY = env("PLATFORM_2FA_ENCRYPTION_KEY", default="")

# Optional Fernet key for reversible app secrets (Group SMTP passwords, etc.).
# Local DEBUG may derive a key from SECRET_KEY when this is empty.
APP_SECRETS_ENCRYPTION_KEY = env("APP_SECRETS_ENCRYPTION_KEY", default="")
