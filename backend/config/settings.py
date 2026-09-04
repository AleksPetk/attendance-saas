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
    # Credentialed browser origins only (workspace SPA; promo for Contact CSRF).
    # Docs/Status must NOT be listed here — see CORS_ANONYMOUS_ORIGINS.
    CORS_CREDENTIALED_ORIGINS=(
        list,
        [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
    ),
    # Anonymous CORS (no credentials) for Docs/Status public Content GETs.
    CORS_ANONYMOUS_ORIGINS=(
        list,
        [
            "http://localhost:8091",
            "http://127.0.0.1:8091",
            "http://localhost:8090",
            "http://127.0.0.1:8090",
        ],
    ),
    EMAIL_VERIFICATION_TIMEOUT=(int, 60 * 60 * 24),
    PASSWORD_RESET_TIMEOUT=(int, 60 * 60 * 24),
    EMAIL_VERIFICATION_RESEND_COOLDOWN=(int, 60),
    PASSWORD_RESET_RESEND_COOLDOWN=(int, 60),
    ACCOUNT_RECOVERY_TIMEOUT=(int, 60 * 60),
    RESEND_TIMEOUT_SECONDS=(int, 15),
    PLATFORM_2FA_ENCRYPTION_KEY=(str, ""),
    APP_SECRETS_ENCRYPTION_KEY=(str, ""),
    STATUS_PROBE_TOKEN=(str, ""),
    STATUS_PROVIDER_HEALTH_RATE_LIMIT=(int, 30),
    SECURE_HSTS_SECONDS=(int, 0),
    SECURE_HSTS_INCLUDE_SUBDOMAINS=(bool, False),
    SECURE_HSTS_PRELOAD=(bool, False),
    SECURE_SSL_REDIRECT=(bool, False),
    STRIPE_SECRET_KEY=(str, ""),
    STRIPE_WEBHOOK_SECRET=(str, ""),
    STRIPE_PRICE_PLUS_MONTHLY=(str, ""),
    STRIPE_PRICE_PLUS_YEARLY=(str, ""),
    STRIPE_PRICE_BUSINESS_MONTHLY=(str, ""),
    STRIPE_PRICE_BUSINESS_YEARLY=(str, ""),
    STRIPE_PRICE_JP_PLUS_MONTHLY=(str, ""),
    STRIPE_PRICE_JP_PLUS_YEARLY=(str, ""),
    STRIPE_PRICE_JP_BUSINESS_MONTHLY=(str, ""),
    STRIPE_PRICE_JP_BUSINESS_YEARLY=(str, ""),
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
    STRIPE_COUPON_JP_ACQ_NORMAL_PLUS_MONTHLY=(str, ""),
    STRIPE_COUPON_JP_ACQ_NORMAL_BUSINESS_MONTHLY=(str, ""),
    STRIPE_COUPON_JP_ACQ_NORMAL_PLUS_YEARLY=(str, ""),
    STRIPE_COUPON_JP_ACQ_NORMAL_BUSINESS_YEARLY=(str, ""),
    STRIPE_COUPON_JP_ACQ_BIG_PLUS_MONTHLY=(str, ""),
    STRIPE_COUPON_JP_ACQ_BIG_BUSINESS_MONTHLY=(str, ""),
    STRIPE_COUPON_JP_ACQ_BIG_PLUS_YEARLY=(str, ""),
    STRIPE_COUPON_JP_ACQ_BIG_BUSINESS_YEARLY=(str, ""),
    STRIPE_COUPON_JP_PLUS_MONTHLY_TO_PLUS_YEARLY=(str, ""),
    STRIPE_COUPON_JP_BUSINESS_MONTHLY_TO_YEARLY=(str, ""),
    STRIPE_COUPON_JP_BUSINESS_UPGRADE_YEARLY=(str, ""),
    BILLING_PROVIDER=(str, "stripe"),
    CONTACT_TO_EMAIL=(str, "contact@checkstation.app"),
    TURNSTILE_SITE_KEY=(str, ""),
    TURNSTILE_SECRET_KEY=(str, ""),
    TURNSTILE_TIMEOUT_SECONDS=(int, 8),
    # Optional shared cache (production requires REDIS_URL via settings_production).
    REDIS_URL=(str, ""),
    USE_X_FORWARDED_FOR=(bool, False),
    TRUSTED_PROXY_IPS=(list, []),
    # Auth rate limits (failures per window; see core/auth_rate_limits.py).
    OWNER_LOGIN_IP_LIMIT=(int, 10),
    OWNER_LOGIN_IP_WINDOW=(int, 900),
    OWNER_LOGIN_ACCOUNT_LIMIT=(int, 5),
    OWNER_LOGIN_ACCOUNT_WINDOW=(int, 900),
    STAFF_LOGIN_IP_LIMIT=(int, 10),
    STAFF_LOGIN_IP_WINDOW=(int, 900),
    STAFF_LOGIN_ACCOUNT_LIMIT=(int, 8),
    STAFF_LOGIN_ACCOUNT_WINDOW=(int, 900),
    STAFF_LOGIN_WORKSPACE_IP_LIMIT=(int, 15),
    PASSWORD_RESET_IP_LIMIT=(int, 5),
    PASSWORD_RESET_IP_WINDOW=(int, 3600),
    PASSWORD_RESET_EMAIL_LIMIT=(int, 3),
    PASSWORD_RESET_EMAIL_WINDOW=(int, 3600),
    VERIFICATION_RESEND_IP_LIMIT=(int, 10),
    VERIFICATION_RESEND_IP_WINDOW=(int, 3600),
    ACCOUNT_RECOVERY_IP_LIMIT=(int, 5),
    ACCOUNT_RECOVERY_IP_WINDOW=(int, 3600),
    ACCOUNT_RECOVERY_EMAIL_LIMIT=(int, 3),
    ACCOUNT_RECOVERY_EMAIL_WINDOW=(int, 3600),
    CLASS_PIN_VERIFY_LIMIT=(int, 20),
    CLASS_PIN_VERIFY_WINDOW=(int, 60),
    KIOSK_EXIT_VERIFY_LIMIT=(int, 15),
    KIOSK_EXIT_VERIFY_WINDOW=(int, 60),
    GOOGLE_OAUTH_CLIENT_ID=(str, ""),
    GOOGLE_OAUTH_CLIENT_SECRET=(str, ""),
    GOOGLE_OAUTH_REDIRECT_URI=(str, ""),
    GOOGLE_OAUTH_STATE_TTL_SECONDS=(int, 600),
    GOOGLE_OAUTH_HTTP_TIMEOUT_SECONDS=(int, 15),
    APPLE_OAUTH_CLIENT_ID=(str, ""),
    APPLE_OAUTH_TEAM_ID=(str, ""),
    APPLE_OAUTH_KEY_ID=(str, ""),
    APPLE_OAUTH_PRIVATE_KEY=(str, ""),
    APPLE_OAUTH_REDIRECT_URI=(str, ""),
    APPLE_OAUTH_STATE_TTL_SECONDS=(int, 600),
    APPLE_OAUTH_HTTP_TIMEOUT_SECONDS=(int, 15),
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
    # Before CorsMiddleware so anonymous OPTIONS preflights are not swallowed
    # by corsheaders' empty 200 preflight (which omits ACAO for non-credentialed origins).
    "config.cors_policy.AnonymousOriginCorsMiddleware",
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

# Optional explicit project-owned roots for the Platform Admin application-size
# metric. Empty uses the repository/service roots visible from BASE_DIR.
PLATFORM_APPLICATION_SIZE_ROOTS = env.list(
    "PLATFORM_APPLICATION_SIZE_ROOTS",
    default=[],
)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Local development uses in-process LocMemCache. Production switches to Redis
# in config.settings_production (REDIS_URL required).
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "checkstation-dev",
    }
}

REDIS_URL = env("REDIS_URL", default="")
USE_X_FORWARDED_FOR = env.bool("USE_X_FORWARDED_FOR")
TRUSTED_PROXY_IPS = env.list("TRUSTED_PROXY_IPS")

OWNER_LOGIN_IP_LIMIT = env.int("OWNER_LOGIN_IP_LIMIT")
OWNER_LOGIN_IP_WINDOW = env.int("OWNER_LOGIN_IP_WINDOW")
OWNER_LOGIN_ACCOUNT_LIMIT = env.int("OWNER_LOGIN_ACCOUNT_LIMIT")
OWNER_LOGIN_ACCOUNT_WINDOW = env.int("OWNER_LOGIN_ACCOUNT_WINDOW")
STAFF_LOGIN_IP_LIMIT = env.int("STAFF_LOGIN_IP_LIMIT")
STAFF_LOGIN_IP_WINDOW = env.int("STAFF_LOGIN_IP_WINDOW")
STAFF_LOGIN_ACCOUNT_LIMIT = env.int("STAFF_LOGIN_ACCOUNT_LIMIT")
STAFF_LOGIN_ACCOUNT_WINDOW = env.int("STAFF_LOGIN_ACCOUNT_WINDOW")
STAFF_LOGIN_WORKSPACE_IP_LIMIT = env.int("STAFF_LOGIN_WORKSPACE_IP_LIMIT")
PASSWORD_RESET_IP_LIMIT = env.int("PASSWORD_RESET_IP_LIMIT")
PASSWORD_RESET_IP_WINDOW = env.int("PASSWORD_RESET_IP_WINDOW")
PASSWORD_RESET_EMAIL_LIMIT = env.int("PASSWORD_RESET_EMAIL_LIMIT")
PASSWORD_RESET_EMAIL_WINDOW = env.int("PASSWORD_RESET_EMAIL_WINDOW")
VERIFICATION_RESEND_IP_LIMIT = env.int("VERIFICATION_RESEND_IP_LIMIT")
VERIFICATION_RESEND_IP_WINDOW = env.int("VERIFICATION_RESEND_IP_WINDOW")
ACCOUNT_RECOVERY_IP_LIMIT = env.int("ACCOUNT_RECOVERY_IP_LIMIT")
ACCOUNT_RECOVERY_IP_WINDOW = env.int("ACCOUNT_RECOVERY_IP_WINDOW")
ACCOUNT_RECOVERY_EMAIL_LIMIT = env.int("ACCOUNT_RECOVERY_EMAIL_LIMIT")
ACCOUNT_RECOVERY_EMAIL_WINDOW = env.int("ACCOUNT_RECOVERY_EMAIL_WINDOW")
CLASS_PIN_VERIFY_LIMIT = env.int("CLASS_PIN_VERIFY_LIMIT")
CLASS_PIN_VERIFY_WINDOW = env.int("CLASS_PIN_VERIFY_WINDOW")
KIOSK_EXIT_VERIFY_LIMIT = env.int("KIOSK_EXIT_VERIFY_LIMIT")
KIOSK_EXIT_VERIFY_WINDOW = env.int("KIOSK_EXIT_VERIFY_WINDOW")

# Credentialed CORS origins = workspace SPA only (cookies + Allow-Credentials).
# Promo/Docs/Status belong in CORS_ANONYMOUS_ORIGINS (ACAO, never credentials).
# Prefer CORS_CREDENTIALED_ORIGINS. Legacy CORS_ALLOWED_ORIGINS is accepted
# as a fallback for local .env files during the transition.
_legacy_cors = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_CREDENTIALED_ORIGINS = env.list("CORS_CREDENTIALED_ORIGINS") or _legacy_cors
CORS_ANONYMOUS_ORIGINS = env.list("CORS_ANONYMOUS_ORIGINS")
# django-cors-headers only sees credentialed origins (with credentials).
CORS_ALLOWED_ORIGINS = list(CORS_CREDENTIALED_ORIGINS)
CORS_ALLOW_CREDENTIALS = True

# CSRF trust is independent of CORS credentials.
# Default = credentialed workspace origin only. Do not add promo/Docs/Status
# for Contact — Contact is csrf_exempt and uses Turnstile.
# CSRF_TRUSTED_ORIGINS may be set explicitly when a specific cross-origin
# cookie POST truly needs it; that still must not imply credentialed CORS.
_csrf_trusted = env.list("CSRF_TRUSTED_ORIGINS", default=[])
CSRF_TRUSTED_ORIGINS = _csrf_trusted or list(CORS_CREDENTIALED_ORIGINS)

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
        # Session first: workspace SPA uses cookies. Basic authenticators below
        # must not advertise WWW-Authenticate (Safari native login popup).
        "rest_framework.authentication.SessionAuthentication",
        "organizations.authentication.WorkspaceStaffBasicAuthentication",
        "organizations.authentication.BrowserSilentBasicAuthentication",
    ],
}

# Shared secret for Status → Django provider health probes (email/stripe).
# Empty in local DEBUG allows those endpoints without a token; production
# settings require a non-empty value.
STATUS_PROBE_TOKEN = env("STATUS_PROBE_TOKEN", default="")
STATUS_PROVIDER_HEALTH_RATE_LIMIT = env("STATUS_PROVIDER_HEALTH_RATE_LIMIT")

# When DEBUG=False under the base settings module, apply the same cookie/TLS
# hardening used by settings_production (host-only cookies; no cookie Domain).
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=0)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool(
        "SECURE_HSTS_INCLUDE_SUBDOMAINS", default=False
    )
    SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=False)
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = env(
        "SECURE_REFERRER_POLICY", default="same-origin"
    )
    X_FRAME_OPTIONS = "DENY"
    if "whitenoise.middleware.WhiteNoiseMiddleware" not in MIDDLEWARE:
        _security_idx = MIDDLEWARE.index(
            "django.middleware.security.SecurityMiddleware"
        )
        MIDDLEWARE.insert(
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

# Public product name used in transactional account emails.
PRODUCT_NAME = "CheckStation"

# Browser origin used to build verification and password-reset links.
# Never accept a user-supplied redirect target for these emails.
FRONTEND_BASE_URL = env("FRONTEND_BASE_URL", default="http://localhost:5173").rstrip("/")

# Optional public HTTPS URL for the CheckStation icon in transactional
# emails. Gmail fetches this from the public internet. Do not use CID,
# localhost, or http://. When empty, a public HTTPS FRONTEND_BASE_URL uses
# /email/checkstation-icon.png; local/private origins render a text wordmark.
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
ACCOUNT_RECOVERY_TIMEOUT = env("ACCOUNT_RECOVERY_TIMEOUT")

# Transactional email (Resend). The API key must come from the environment.
RESEND_API_KEY = env("RESEND_API_KEY", default="")
RESEND_FROM_EMAIL = env(
    "RESEND_FROM_EMAIL",
    default="accounts@checkstation.app",
)
RESEND_FROM_NAME = env("RESEND_FROM_NAME", default=PRODUCT_NAME)
RESEND_TIMEOUT_SECONDS = env("RESEND_TIMEOUT_SECONDS")

# Optional Fernet key for encrypting platform-operator TOTP secrets at rest.
# Local DEBUG may derive a key from SECRET_KEY when this is empty.
PLATFORM_2FA_ENCRYPTION_KEY = env("PLATFORM_2FA_ENCRYPTION_KEY", default="")

# Optional Fernet key for reversible app secrets (Group SMTP passwords, etc.).
# Local DEBUG may derive a key from SECRET_KEY when this is empty.
APP_SECRETS_ENCRYPTION_KEY = env("APP_SECRETS_ENCRYPTION_KEY", default="")

# Owner Google OAuth (optional). Password login continues when unset.
GOOGLE_OAUTH_CLIENT_ID = env("GOOGLE_OAUTH_CLIENT_ID", default="")
GOOGLE_OAUTH_CLIENT_SECRET = env("GOOGLE_OAUTH_CLIENT_SECRET", default="")
# Optional override. When empty, callback URL is derived from the incoming request.
GOOGLE_OAUTH_REDIRECT_URI = env("GOOGLE_OAUTH_REDIRECT_URI", default="")
GOOGLE_OAUTH_STATE_TTL_SECONDS = env("GOOGLE_OAUTH_STATE_TTL_SECONDS")
GOOGLE_OAUTH_HTTP_TIMEOUT_SECONDS = env("GOOGLE_OAUTH_HTTP_TIMEOUT_SECONDS")

# Owner Apple OAuth (optional). Password/Google login continue when unset.
APPLE_OAUTH_CLIENT_ID = env("APPLE_OAUTH_CLIENT_ID", default="")
APPLE_OAUTH_TEAM_ID = env("APPLE_OAUTH_TEAM_ID", default="")
APPLE_OAUTH_KEY_ID = env("APPLE_OAUTH_KEY_ID", default="")
# PEM contents; escaped \\n in .env is supported.
APPLE_OAUTH_PRIVATE_KEY = env("APPLE_OAUTH_PRIVATE_KEY", default="")
APPLE_OAUTH_REDIRECT_URI = env("APPLE_OAUTH_REDIRECT_URI", default="")
APPLE_OAUTH_STATE_TTL_SECONDS = env("APPLE_OAUTH_STATE_TTL_SECONDS")
APPLE_OAUTH_HTTP_TIMEOUT_SECONDS = env("APPLE_OAUTH_HTTP_TIMEOUT_SECONDS")

# Stripe TEST-mode billing. Empty placeholders until credentials exist.
# Never commit live keys. Permanent list prices stay in billing.catalog.
STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY", default="")
STRIPE_WEBHOOK_SECRET = env("STRIPE_WEBHOOK_SECRET", default="")
STRIPE_PRICE_PLUS_MONTHLY = env("STRIPE_PRICE_PLUS_MONTHLY", default="")
STRIPE_PRICE_PLUS_YEARLY = env("STRIPE_PRICE_PLUS_YEARLY", default="")
STRIPE_PRICE_BUSINESS_MONTHLY = env("STRIPE_PRICE_BUSINESS_MONTHLY", default="")
STRIPE_PRICE_BUSINESS_YEARLY = env("STRIPE_PRICE_BUSINESS_YEARLY", default="")
# Sandbox JP Price IDs. The effective resolver remains GLOBAL until the next
# phase adds an explicit platform-controlled market source.
STRIPE_PRICE_JP_PLUS_MONTHLY = env("STRIPE_PRICE_JP_PLUS_MONTHLY", default="")
STRIPE_PRICE_JP_PLUS_YEARLY = env("STRIPE_PRICE_JP_PLUS_YEARLY", default="")
STRIPE_PRICE_JP_BUSINESS_MONTHLY = env(
    "STRIPE_PRICE_JP_BUSINESS_MONTHLY", default=""
)
STRIPE_PRICE_JP_BUSINESS_YEARLY = env(
    "STRIPE_PRICE_JP_BUSINESS_YEARLY", default=""
)
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
STRIPE_COUPON_JP_ACQ_NORMAL_PLUS_MONTHLY = env("STRIPE_COUPON_JP_ACQ_NORMAL_PLUS_MONTHLY", default="")
STRIPE_COUPON_JP_ACQ_NORMAL_BUSINESS_MONTHLY = env("STRIPE_COUPON_JP_ACQ_NORMAL_BUSINESS_MONTHLY", default="")
STRIPE_COUPON_JP_ACQ_NORMAL_PLUS_YEARLY = env("STRIPE_COUPON_JP_ACQ_NORMAL_PLUS_YEARLY", default="")
STRIPE_COUPON_JP_ACQ_NORMAL_BUSINESS_YEARLY = env("STRIPE_COUPON_JP_ACQ_NORMAL_BUSINESS_YEARLY", default="")
STRIPE_COUPON_JP_ACQ_BIG_PLUS_MONTHLY = env("STRIPE_COUPON_JP_ACQ_BIG_PLUS_MONTHLY", default="")
STRIPE_COUPON_JP_ACQ_BIG_BUSINESS_MONTHLY = env("STRIPE_COUPON_JP_ACQ_BIG_BUSINESS_MONTHLY", default="")
STRIPE_COUPON_JP_ACQ_BIG_PLUS_YEARLY = env("STRIPE_COUPON_JP_ACQ_BIG_PLUS_YEARLY", default="")
STRIPE_COUPON_JP_ACQ_BIG_BUSINESS_YEARLY = env("STRIPE_COUPON_JP_ACQ_BIG_BUSINESS_YEARLY", default="")
STRIPE_COUPON_JP_PLUS_MONTHLY_TO_PLUS_YEARLY = env("STRIPE_COUPON_JP_PLUS_MONTHLY_TO_PLUS_YEARLY", default="")
STRIPE_COUPON_JP_BUSINESS_MONTHLY_TO_YEARLY = env("STRIPE_COUPON_JP_BUSINESS_MONTHLY_TO_YEARLY", default="")
STRIPE_COUPON_JP_BUSINESS_UPGRADE_YEARLY = env("STRIPE_COUPON_JP_BUSINESS_UPGRADE_YEARLY", default="")
BILLING_PROVIDER = env("BILLING_PROVIDER", default="stripe")

# Public Contact mailbox (Cloudflare Email Routing). Never the private
# forwarding destination. DEBUG may use Cloudflare dummy Turnstile keys.
CONTACT_TO_EMAIL = env(
    "CONTACT_TO_EMAIL",
    default="contact@checkstation.app",
)
TURNSTILE_SITE_KEY = env("TURNSTILE_SITE_KEY", default="")
TURNSTILE_SECRET_KEY = env("TURNSTILE_SECRET_KEY", default="")
TURNSTILE_TIMEOUT_SECONDS = env("TURNSTILE_TIMEOUT_SECONDS")
