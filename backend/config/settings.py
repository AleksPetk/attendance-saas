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
        [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8091",
            "http://127.0.0.1:8091",
        ],
    ),
    EMAIL_VERIFICATION_TIMEOUT=(int, 60 * 60 * 24),
    PASSWORD_RESET_TIMEOUT=(int, 60 * 60 * 24),
    EMAIL_VERIFICATION_RESEND_COOLDOWN=(int, 60),
    PASSWORD_RESET_RESEND_COOLDOWN=(int, 60),
    RESEND_TIMEOUT_SECONDS=(int, 15),
    PLATFORM_2FA_ENCRYPTION_KEY=(str, ""),
    APP_SECRETS_ENCRYPTION_KEY=(str, ""),
    STRIPE_SECRET_KEY=(str, ""),
    STRIPE_WEBHOOK_SECRET=(str, ""),
    STRIPE_PRICE_PLUS_MONTHLY=(str, ""),
    STRIPE_PRICE_PLUS_YEARLY=(str, ""),
    STRIPE_PRICE_BUSINESS_MONTHLY=(str, ""),
    STRIPE_PRICE_BUSINESS_YEARLY=(str, ""),
    STRIPE_COUPON_ACQ_NORMAL_PLUS_MONTHLY=(str, ""),
    STRIPE_COUPON_ACQ_NORMAL_BUSINESS_MONTHLY=(str, ""),
    STRIPE_COUPON_ACQ_NORMAL_PLUS_YEARLY=(str, ""),
    STRIPE_COUPON_ACQ_NORMAL_BUSINESS_YEARLY=(str, ""),
    STRIPE_COUPON_ACQ_BIG_PLUS_MONTHLY=(str, ""),
    STRIPE_COUPON_ACQ_BIG_BUSINESS_MONTHLY=(str, ""),
    STRIPE_COUPON_ACQ_BIG_PLUS_YEARLY=(str, ""),
    STRIPE_COUPON_ACQ_BIG_BUSINESS_YEARLY=(str, ""),
    STRIPE_COUPON_PLUS_MONTHLY_TO_PLUS_YEARLY=(str, ""),
    STRIPE_COUPON_BUSINESS_MONTHLY_TO_YEARLY=(str, ""),
    BILLING_PROVIDER=(str, "stripe"),
    CONTACT_TO_EMAIL=(str, "contact@checkstation.alekspetk.com"),
    TURNSTILE_SITE_KEY=(str, ""),
    TURNSTILE_SECRET_KEY=(str, ""),
    TURNSTILE_TIMEOUT_SECONDS=(int, 8),
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
    "billing.apps.BillingConfig",
    "members",
    "groups",
    "core.apps.CoreConfig",
    "attendance",
    "kiosk_builder",
    "content.apps.ContentConfig",
    "contact.apps.ContactConfig",
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
        "DIRS": [BASE_DIR / "templates"],
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
PRODUCT_NAME = "CheckStation"

# Browser origin used to build verification and password-reset links.
# Never accept a user-supplied redirect target for these emails.
FRONTEND_BASE_URL = env("FRONTEND_BASE_URL", default="http://localhost:5173").rstrip("/")

# Optional public HTTPS URL for the CheckStation wordmark in transactional
# emails. Gmail fetches this from the public internet. Do not use CID,
# localhost, or http://. Leave empty to render a text wordmark. Set this
# when a real public HTTPS asset URL exists (deployment, not local default).
EMAIL_BRAND_LOGO_URL = env("EMAIL_BRAND_LOGO_URL", default="").strip()

# Public Docs origin used in document canonical_url metadata.
# Browser-facing URL, not a Docker-internal hostname.
DOCS_PUBLIC_URL = env("DOCS_PUBLIC_URL", default="http://localhost:8091").rstrip("/")

# Optional legal-entity placeholders substituted into published documents.
# Leave empty to use conservative fallbacks in the public API. Do not invent
# a company name here.
LEGAL_OPERATOR_NAME = env("LEGAL_OPERATOR_NAME", default="")
LEGAL_CONTACT_EMAIL = env("LEGAL_CONTACT_EMAIL", default="")
LEGAL_GOVERNING_LAW = env("LEGAL_GOVERNING_LAW", default="")
LEGAL_GOVERNING_VENUE = env("LEGAL_GOVERNING_VENUE", default="")

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

# Stripe TEST-mode billing. Empty placeholders until credentials exist.
# Never commit live keys. Permanent list prices stay in billing.catalog.
STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY", default="")
STRIPE_WEBHOOK_SECRET = env("STRIPE_WEBHOOK_SECRET", default="")
STRIPE_PRICE_PLUS_MONTHLY = env("STRIPE_PRICE_PLUS_MONTHLY", default="")
STRIPE_PRICE_PLUS_YEARLY = env("STRIPE_PRICE_PLUS_YEARLY", default="")
STRIPE_PRICE_BUSINESS_MONTHLY = env("STRIPE_PRICE_BUSINESS_MONTHLY", default="")
STRIPE_PRICE_BUSINESS_YEARLY = env("STRIPE_PRICE_BUSINESS_YEARLY", default="")
# Stripe sandbox coupons for eligibility-backed offers (server-only secrets).
# Never expose these IDs on public catalog APIs or VITE_* vars.
STRIPE_COUPON_ACQ_NORMAL_PLUS_MONTHLY = env(
    "STRIPE_COUPON_ACQ_NORMAL_PLUS_MONTHLY", default=""
)
STRIPE_COUPON_ACQ_NORMAL_BUSINESS_MONTHLY = env(
    "STRIPE_COUPON_ACQ_NORMAL_BUSINESS_MONTHLY", default=""
)
STRIPE_COUPON_ACQ_NORMAL_PLUS_YEARLY = env(
    "STRIPE_COUPON_ACQ_NORMAL_PLUS_YEARLY", default=""
)
STRIPE_COUPON_ACQ_NORMAL_BUSINESS_YEARLY = env(
    "STRIPE_COUPON_ACQ_NORMAL_BUSINESS_YEARLY", default=""
)
STRIPE_COUPON_ACQ_BIG_PLUS_MONTHLY = env(
    "STRIPE_COUPON_ACQ_BIG_PLUS_MONTHLY", default=""
)
STRIPE_COUPON_ACQ_BIG_BUSINESS_MONTHLY = env(
    "STRIPE_COUPON_ACQ_BIG_BUSINESS_MONTHLY", default=""
)
STRIPE_COUPON_ACQ_BIG_PLUS_YEARLY = env(
    "STRIPE_COUPON_ACQ_BIG_PLUS_YEARLY", default=""
)
STRIPE_COUPON_ACQ_BIG_BUSINESS_YEARLY = env(
    "STRIPE_COUPON_ACQ_BIG_BUSINESS_YEARLY", default=""
)
STRIPE_COUPON_PLUS_MONTHLY_TO_PLUS_YEARLY = env(
    "STRIPE_COUPON_PLUS_MONTHLY_TO_PLUS_YEARLY", default=""
)
STRIPE_COUPON_BUSINESS_MONTHLY_TO_YEARLY = env(
    "STRIPE_COUPON_BUSINESS_MONTHLY_TO_YEARLY", default=""
)
BILLING_PROVIDER = env("BILLING_PROVIDER", default="stripe")

# Public Contact mailbox (Cloudflare Email Routing). Never the private
# forwarding destination. DEBUG may use Cloudflare dummy Turnstile keys.
CONTACT_TO_EMAIL = env(
    "CONTACT_TO_EMAIL",
    default="contact@checkstation.alekspetk.com",
)
TURNSTILE_SITE_KEY = env("TURNSTILE_SITE_KEY", default="")
TURNSTILE_SECRET_KEY = env("TURNSTILE_SECRET_KEY", default="")
TURNSTILE_TIMEOUT_SECONDS = env("TURNSTILE_TIMEOUT_SECONDS")
