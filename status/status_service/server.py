"""Stdlib HTTP server for the Status API and standalone webpage."""

import json
import mimetypes
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from status_service.config import load_config
from status_service.http_api import (
    build_current_payload,
    build_incidents_payload,
    build_maintenance_payload,
)
from status_service.locale import SUPPORTED_LOCALES, html_lang, normalize_locale, resolve_locale
from status_service.monitor import Monitor
from status_service.store import StatusStore

CORS_HEADERS = (
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Methods", "GET, OPTIONS"),
    ("Access-Control-Allow-Headers", "Accept, Content-Type"),
    ("Access-Control-Max-Age", "600"),
    ("Cache-Control", "no-store"),
)

PAGE_META = {
    "en": {
        "title": "CheckStation Status",
        "description": "Live CheckStation service status.",
    },
    "ja": {
        "title": "CheckStation ステータス",
        "description": "CheckStation サービスの稼働状況。",
    },
}


def _content_type_for(path):
    suffix = path.suffix.lower()
    if suffix == ".ico":
        return "image/x-icon"
    return mimetypes.guess_type(str(path))[0] or "application/octet-stream"


def _locale_from_path(path):
    parts = [part for part in path.split("/") if part]
    if parts and parts[0] in SUPPORTED_LOCALES:
        return parts[0]
    return None


def _query_lang(query):
    values = parse_qs(query or "").get("lang") or []
    return values[0] if values else None


def create_handler(store, config):
    static_dir = Path(config["static_dir"])
    index_template = (static_dir / "index.html").read_text(encoding="utf-8")
    public_url = str(config.get("public_url") or "").rstrip("/")

    class StatusHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, format, *args):
            return

        def do_OPTIONS(self):
            self._send(204, b"", content_type="text/plain")

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            parsed = urlparse(self.path)
            path = parsed.path or "/"
            if path == "/":
                self._redirect("/en/")
                return
            # Canonical locale home keeps a trailing slash: /en/ /ja/
            if path in {"/en", "/ja"}:
                self._redirect(path + "/" + (("?" + parsed.query) if parsed.query else ""))
                return
            if path == "/healthz":
                self._json(200, {"status": "ok"})
                return

            normalized = path.rstrip("/") or "/"
            locale = resolve_locale(
                path_locale=_locale_from_path(normalized),
                query_lang=_query_lang(parsed.query),
                accept_language=self.headers.get("Accept-Language"),
            )

            if normalized in {"/api/status/current"}:
                self._json(200, build_current_payload(store, config, locale=locale))
                return
            if normalized in {"/api/status/incidents"}:
                self._json(200, build_incidents_payload(store, locale=locale))
                return
            if normalized in {"/api/status/maintenance"}:
                self._json(200, build_maintenance_payload(store, locale=locale))
                return

            if path in {"/en/", "/ja/"}:
                self._html(path.strip("/"))
                return

            if path.startswith("/"):
                relative = path.lstrip("/")
                target = (static_dir / relative).resolve()
                root = static_dir.resolve()
                if root not in target.parents and target != root:
                    self._send(404, b"Not found", content_type="text/plain; charset=utf-8")
                    return
                if target.is_file():
                    self._file(target, _content_type_for(target))
                    return
            self._send(404, b"Not found", content_type="text/plain; charset=utf-8")

        def _html(self, locale):
            locale = normalize_locale(locale)
            meta = PAGE_META.get(locale) or PAGE_META["en"]
            canonical = f"{public_url}/{locale}/" if public_url else f"/{locale}/"
            hreflang_parts = []
            for lang in SUPPORTED_LOCALES:
                href = f"{public_url}/{lang}/" if public_url else f"/{lang}/"
                hreflang_parts.append(
                    f'<link rel="alternate" hreflang="{lang}" href="{escape(href, quote=True)}" />'
                )
            default_href = f"{public_url}/en/" if public_url else "/en/"
            hreflang_parts.append(
                f'<link rel="alternate" hreflang="x-default" href="{escape(default_href, quote=True)}" />'
            )
            hreflang = "\n    ".join(hreflang_parts)
            html = (
                index_template.replace("__PAGE_TITLE__", escape(meta["title"], quote=True))
                .replace("__PAGE_DESCRIPTION__", escape(meta["description"], quote=True))
                .replace("__PAGE_CANONICAL__", escape(canonical, quote=True))
                .replace("__PAGE_HREFLANG__", hreflang)
                .replace('<html lang="en">', f'<html lang="{escape(html_lang(locale), quote=True)}">', 1)
            )
            self._send(
                200,
                html.encode("utf-8"),
                content_type="text/html; charset=utf-8",
            )

        def _json(self, code, payload):
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            self._send(code, body, content_type="application/json; charset=utf-8")

        def _file(self, path, content_type):
            try:
                body = path.read_bytes()
            except OSError:
                self._send(404, b"Not found", content_type="text/plain; charset=utf-8")
                return
            self._send(200, body, content_type=content_type)

        def _redirect(self, location):
            self.send_response(301)
            self.send_header("Location", location)
            self.send_header("Content-Length", "0")
            for name, value in CORS_HEADERS:
                self.send_header(name, value)
            self.end_headers()

        def _send(self, code, body, content_type):
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            for name, value in CORS_HEADERS:
                self.send_header(name, value)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

    return StatusHandler


def serve(store, config):
    handler = create_handler(store, config)
    server = ThreadingHTTPServer((config["host"], config["port"]), handler)
    return server


def main():
    config = load_config()
    store = StatusStore(config["database_path"])
    monitor = Monitor(store, config)
    monitor.start()
    server = serve(store, config)
    print(
        f"CheckStation Status listening on http://{config['host']}:{config['port']}",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        monitor.stop()
        server.server_close()
