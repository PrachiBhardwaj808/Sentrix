"""Small Django configuration for the API and local outpost service."""

from pathlib import Path
import os

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load the local backend environment when present. Production deployments may
# inject the same variables through their secret manager instead.
load_dotenv(BASE_DIR / ".env", override=False)

DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() in {"1", "true", "yes"}
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "").strip()
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "local-development-only"
    else:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG=false")
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")
    if host.strip()
]
if not DEBUG and "*" in ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must not contain * when DJANGO_DEBUG=false")
CORS_ALLOW_ALL_ORIGINS = DEBUG and os.getenv("CORS_ALLOW_ALL_ORIGINS", "false").lower() in {"1", "true", "yes"}
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS", "http://127.0.0.1:3000,http://localhost:3000"
    ).split(",")
    if origin.strip()
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
APPEND_SLASH = False

INSTALLED_APPS = ["app.apps.BorderSurveillanceConfig"]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "app.api.middleware.CorsHeadersMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

LOCAL_DATA_DIR = BASE_DIR / ".localdata"
LOCAL_DATA_DIR.mkdir(parents=True, exist_ok=True)

if os.getenv("DJANGO_DB_ENGINE", "sqlite").strip().lower() == "postgis":
    database_name = os.getenv("DJANGO_DB_NAME", "").strip()
    database_user = os.getenv("DJANGO_DB_USER", "").strip()
    database_password = os.getenv("DJANGO_DB_PASSWORD", "")
    database_host = os.getenv("DJANGO_DB_HOST", "").strip()
    if not all((database_name, database_user, database_password, database_host)):
        raise ImproperlyConfigured(
            "DJANGO_DB_NAME, DJANGO_DB_USER, DJANGO_DB_PASSWORD, and DJANGO_DB_HOST are required for PostGIS"
        )
    DATABASES = {
        "default": {
            "ENGINE": "django.contrib.gis.db.backends.postgis",
            "NAME": database_name,
            "USER": database_user,
            "PASSWORD": database_password,
            "HOST": database_host,
            "PORT": os.getenv("DJANGO_DB_PORT", "5432"),
            "CONN_MAX_AGE": 60,
            "OPTIONS": {"connect_timeout": 5},
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": LOCAL_DATA_DIR / "django.sqlite3",
        }
    }

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Put the deployed Vercel origin here. Sensitive API operations also enforce
# the signed operator session and role in the view layer.
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",")
    if origin.strip()
]

# Deployment operators can enable these behind a TLS-terminating proxy. They
# stay opt-in so the local HTTP demo remains usable.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = os.getenv("DJANGO_SECURE_SSL_REDIRECT", "false").lower() in {"1", "true", "yes"}
SESSION_COOKIE_SECURE = os.getenv("DJANGO_SESSION_COOKIE_SECURE", "false").lower() in {"1", "true", "yes"}
CSRF_COOKIE_SECURE = os.getenv("DJANGO_CSRF_COOKIE_SECURE", "false").lower() in {"1", "true", "yes"}
SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_SECURE_HSTS_SECONDS", "0") or 0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_HSTS_SECONDS > 0
SECURE_HSTS_PRELOAD = SECURE_HSTS_SECONDS > 0
