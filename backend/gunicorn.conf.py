"""
Gunicorn configuration for production Django (config.wsgi).

Environment overrides (all optional):
  GUNICORN_BIND              default 127.0.0.1:8000 (internal; TLS at reverse proxy)
  GUNICORN_WORKERS           default 3 (override; do not hardcode machine size)
  GUNICORN_THREADS           default 2
  GUNICORN_TIMEOUT           default 60
  GUNICORN_GRACEFUL_TIMEOUT  default 30
  GUNICORN_ACCESSLOG         default -
  GUNICORN_ERRORLOG          default -
  GUNICORN_LOGLEVEL          default info

Example:
  cd backend && gunicorn config.wsgi:application -c gunicorn.conf.py
  DJANGO_SETTINGS_MODULE=config.settings_production
"""

import os


def _int(name, default):
    raw = os.environ.get(name, "")
    if raw is None or str(raw).strip() == "":
        return int(default)
    return int(raw)


bind = os.environ.get("GUNICORN_BIND", "127.0.0.1:8000").strip() or "127.0.0.1:8000"
workers = _int("GUNICORN_WORKERS", 3)
threads = _int("GUNICORN_THREADS", 2)
timeout = _int("GUNICORN_TIMEOUT", 60)
graceful_timeout = _int("GUNICORN_GRACEFUL_TIMEOUT", 30)
keepalive = _int("GUNICORN_KEEPALIVE", 5)
accesslog = os.environ.get("GUNICORN_ACCESSLOG", "-")
errorlog = os.environ.get("GUNICORN_ERRORLOG", "-")
loglevel = os.environ.get("GUNICORN_LOGLEVEL", "info").strip() or "info"
capture_output = True
preload_app = False
wsgi_app = "config.wsgi:application"
