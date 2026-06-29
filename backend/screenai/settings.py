import os
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlparse

from dotenv import load_dotenv


BASE_DIR = (
    Path(__file__)
    .resolve()
    .parent
    .parent
)

load_dotenv(
    BASE_DIR / ".env"
)


def get_boolean_env(
    name,
    default=False,
):
    value = os.getenv(
        name,
        str(default),
    )

    return value.strip().lower() in [
        "1",
        "true",
        "yes",
        "on",
    ]


def get_list_env(
    name,
    default="",
):
    value = os.getenv(
        name,
        default,
    )

    return [
        item.strip()
        for item in value.split(",")
        if item.strip()
    ]


def get_throttle_env(
    name,
    default="10/minute",
):
    value = os.getenv(name, "").strip()
    if not value:
        return default
    if "/" not in value:
        return default
    parts = value.split("/")
    if len(parts) != 2:
        return default
    num, period = parts
    try:
        int(num.strip())
    except ValueError:
        return default
    if period.strip().lower() not in ["second", "minute", "hour", "day"]:
        return default
    return value


SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "development-only-secret-key",
)

DEBUG = get_boolean_env(
    "DJANGO_DEBUG",
    True,
)

ALLOWED_HOSTS = get_list_env(
    "DJANGO_ALLOWED_HOSTS",
    "127.0.0.1,localhost",
)


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    "rest_framework",
    "corsheaders",

    "accounts",
    "jobs",
    "applications",
    "ai_engine",
    "assessments",
]


MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


ROOT_URLCONF = "screenai.urls"


TEMPLATES = [
    {
        "BACKEND": (
            "django.template.backends."
            "django.DjangoTemplates"
        ),
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                (
                    "django.template.context_processors."
                    "request"
                ),
                (
                    "django.contrib.auth.context_processors."
                    "auth"
                ),
                (
                    "django.contrib.messages.context_processors."
                    "messages"
                ),
            ],
        },
    },
]


WSGI_APPLICATION = (
    "screenai.wsgi.application"
)


DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

import sys
TESTING = "test" in sys.argv
if TESTING:
    DATABASE_URL = ""

if DATABASE_URL:
    parsed_database_url = urlparse(DATABASE_URL)
    if parsed_database_url.scheme not in ("postgres", "postgresql"):
        raise ValueError("DATABASE_URL must use the postgres or postgresql scheme.")

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": unquote(parsed_database_url.path.lstrip("/")),
            "USER": unquote(parsed_database_url.username or ""),
            "PASSWORD": unquote(parsed_database_url.password or ""),
            "HOST": parsed_database_url.hostname or "",
            "PORT": str(parsed_database_url.port or 5432),
            "CONN_MAX_AGE": int(os.getenv("DATABASE_CONN_MAX_AGE", "60")),
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": dict(parse_qsl(parsed_database_url.query)),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }


AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            "django.contrib.auth."
            "password_validation."
            "UserAttributeSimilarityValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth."
            "password_validation."
            "MinimumLengthValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth."
            "password_validation."
            "CommonPasswordValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth."
            "password_validation."
            "NumericPasswordValidator"
        ),
    },
]


LANGUAGE_CODE = "en-us"

TIME_ZONE = "Asia/Kolkata"

USE_I18N = True

USE_TZ = True


STATIC_URL = "static/"


REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        (
            "accounts.authentication."
            "CustomJWTAuthentication"
        ),
    ),
    # Use ScopedRateThrottle to rate limit only specific views/endpoints.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    # Custom rates for public application submissions.
    # Note: IP-based anonymous throttling can affect multiple users sharing the same network/IP address.
    "DEFAULT_THROTTLE_RATES": {
        "public_application_submit": get_throttle_env(
            "THROTTLE_RATE_PUBLIC_APP_SUBMIT", "10/minute"
        ),
    },
}


CORS_ALLOWED_ORIGINS = get_list_env(
    "CORS_ALLOWED_ORIGINS",
    (
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "http://localhost:5174,"
        "http://127.0.0.1:5174"
    ),
)


# Safely merge Content-Disposition into CORS_EXPOSE_HEADERS preserving existing values
CORS_EXPOSE_HEADERS = globals().get("CORS_EXPOSE_HEADERS", [])
if "Content-Disposition" not in CORS_EXPOSE_HEADERS:
    CORS_EXPOSE_HEADERS = list(CORS_EXPOSE_HEADERS) + ["Content-Disposition"]


MEDIA_URL = "/media/"

MEDIA_ROOT = (
    BASE_DIR / "media"
)


GEMINI_API_KEY = os.getenv(
    "GEMINI_API_KEY",
)

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-2.5-flash-lite",
)


DEFAULT_AUTO_FIELD = (
    "django.db.models.BigAutoField"
)

TRUST_PROXY_HEADERS = get_boolean_env(
    "TRUST_PROXY_HEADERS",
    False,
)

PRIVATE_ASSESSMENT_ROOT = os.getenv(
    "PRIVATE_ASSESSMENT_ROOT",
    str(BASE_DIR / "private_assessments")
)

ASSESSMENT_TOKEN_HMAC_KEY = os.getenv(
    "ASSESSMENT_TOKEN_HMAC_KEY",
    SECRET_KEY
)

# --- Stage 3: Brevo Assessment Invitation Settings ---
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
BREVO_API_BASE_URL = os.getenv("BREVO_API_BASE_URL", "https://api.brevo.com/v3")
BREVO_SENDER_EMAIL = os.getenv("BREVO_SENDER_EMAIL", "no-reply@screenai.com")
BREVO_SENDER_NAME = os.getenv("BREVO_SENDER_NAME", "ScreenAI")
BREVO_WEBHOOK_SECRET = os.getenv("BREVO_WEBHOOK_SECRET", "")
BREVO_REQUEST_TIMEOUT_SECONDS = int(os.getenv("BREVO_REQUEST_TIMEOUT_SECONDS", "10"))
ASSESSMENT_FRONTEND_URL = os.getenv("ASSESSMENT_FRONTEND_URL", "http://localhost:5173/assessments")
MAX_INVITATION_LIFETIME_DAYS = int(os.getenv("MAX_INVITATION_LIFETIME_DAYS", "30"))
ASSESSMENT_INVITATIONS_ENABLED = get_boolean_env("ASSESSMENT_INVITATIONS_ENABLED", False)

# --- Stage 4: Notebook Assessment Upload Settings ---
MAX_NOTEBOOK_UPLOAD_SIZE = int(os.getenv("MAX_NOTEBOOK_UPLOAD_SIZE", str(2 * 1024 * 1024)))

# --- Stage 5: Secure Notebook Evaluation Settings ---
EVALUATOR_DOCKER_IMAGE = os.getenv("EVALUATOR_DOCKER_IMAGE", "python:3.11-slim")
EVALUATOR_TIMEOUT_SECONDS = int(os.getenv("EVALUATOR_TIMEOUT_SECONDS", "30"))
EVALUATOR_MEMORY_MB = int(os.getenv("EVALUATOR_MEMORY_MB", "256"))
EVALUATOR_CPU_LIMIT = float(os.getenv("EVALUATOR_CPU_LIMIT", "1.0"))
EVALUATOR_MAX_OUTPUT_BYTES = int(os.getenv("EVALUATOR_MAX_OUTPUT_BYTES", str(50 * 1024)))
EVALUATOR_STALE_TIMEOUT_SECONDS = int(os.getenv("EVALUATOR_STALE_TIMEOUT_SECONDS", "300"))
EVALUATOR_MAX_RETRIES = int(os.getenv("EVALUATOR_MAX_RETRIES", "3"))
EVALUATOR_POLL_INTERVAL_SECONDS = int(os.getenv("EVALUATOR_POLL_INTERVAL_SECONDS", "10"))

# --- Testing / Development Settings ---
ALLOW_DUPLICATE_APPLICATIONS_FOR_TESTING = get_boolean_env("ALLOW_DUPLICATE_APPLICATIONS_FOR_TESTING", True)

# --- Production Cookie Security Settings ---
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# --- Proxy Header Configuration for Render ---
if TRUST_PROXY_HEADERS:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# --- CSRF Trusted Origins Configuration ---
CSRF_TRUSTED_ORIGINS = get_list_env("CSRF_TRUSTED_ORIGINS", "")

# --- Static files ---
STATIC_ROOT = os.getenv("STATIC_ROOT", str(BASE_DIR / "staticfiles"))

# --- Supabase Storage Configuration ---
import sys
TESTING = "test" in sys.argv
SUPABASE_STORAGE_ENABLED = get_boolean_env("SUPABASE_STORAGE_ENABLED", False) and not TESTING

if SUPABASE_STORAGE_ENABLED:
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                "access_key": os.getenv("SUPABASE_S3_ACCESS_KEY_ID"),
                "secret_key": os.getenv("SUPABASE_S3_SECRET_ACCESS_KEY"),
                "bucket_name": os.getenv("SUPABASE_STORAGE_BUCKET"),
                "endpoint_url": os.getenv("SUPABASE_S3_ENDPOINT_URL"),
                "region_name": os.getenv("SUPABASE_S3_REGION"),
                "querystring_auth": True,
                "querystring_expire": int(os.getenv("SUPABASE_STORAGE_URL_EXPIRY_SECONDS", "3600")),
                "signature_version": "s3v4",
                "file_overwrite": False,
                "custom_domain": None,
                "addressing_style": "path",
            }
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        }
    }
else:
    STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        }
    }

# --- Evaluator Feature Flags ---
EVALUATION_ENABLED = get_boolean_env("EVALUATION_ENABLED", True)