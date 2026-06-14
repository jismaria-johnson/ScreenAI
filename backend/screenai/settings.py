import os
from pathlib import Path

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
]


MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
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


DATABASES = {
    "default": {
        "ENGINE": (
            "django.db.backends.sqlite3"
        ),
        "NAME": (
            BASE_DIR / "db.sqlite3"
        ),
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
            "rest_framework_simplejwt."
            "authentication."
            "JWTAuthentication"
        ),
    ),
}


CORS_ALLOWED_ORIGINS = get_list_env(
    "CORS_ALLOWED_ORIGINS",
    (
        "http://localhost:5173,"
        "http://127.0.0.1:5173"
    ),
)


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