"""Stdlib HTTP server for the public Docs website."""

import json
import mimetypes
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from docs_service.config import load_config
from docs_service.seo import faq_crawl_html, page_meta

CORS_HEADERS = (
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Methods", "GET, OPTIONS"),
    ("Access-Control-Allow-Headers", "Accept, Content-Type"),
    ("Access-Control-Max-Age", "600"),
)


def _safe_static_path(static_dir, relative):
    target = (static_dir / relative).resolve()
    root = static_dir.resolve()
    if root not in target.parents and target != root:
        return None
    if target.is_file():
        return target
    return None


def create_handler(config):
    static_dir = Path(config["static_dir"])
    index_path = static_dir / "index.html"
    index_template = index_path.read_text(encoding="utf-8")

    class DocsHandler(BaseHTTPRequestHandler):
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
            if path != "/" and path.endswith("/") and path != "/":
                trimmed = path.rstrip("/") or "/"
                if trimmed != path:
                    self._redirect(trimmed)
                    return
            if path == "/healthz":
                self._json(200, {"status": "ok"})
                return
            if path == "/config.js":
                body = (
                    "window.DOCS_CONFIG = "
                    +                     json.dumps(
                        {
                            "apiBaseUrl": config["api_base_url"],
                            "publicUrl": config["public_url"],
                            "mainSiteUrl": config["main_site_url"],
                            "statusPublicUrl": config["status_public_url"],
                        },
                        separators=(",", ":"),
                    )
                    + ";\n"
                ).encode("utf-8")
                self._send(
                    200,
                    body,
                    content_type="application/javascript; charset=utf-8",
                    cache="no-store",
                )
                return
            if path.startswith("/"):
                relative = path.lstrip("/")
                if relative and "." in Path(relative).name:
                    target = _safe_static_path(static_dir, relative)
                    if target is not None:
                        content_type = (
                            mimetypes.guess_type(str(target))[0]
                            or "application/octet-stream"
                        )
                        self._file(target, content_type)
                        return
            self._html(path)

        def _html(self, path):
            meta = page_meta(config, path)
            html = (
                index_template.replace("__PAGE_TITLE__", escape(meta["title"], quote=True))
                .replace(
                    "__PAGE_DESCRIPTION__",
                    escape(meta["description"], quote=True),
                )
                .replace("__PAGE_CANONICAL__", escape(meta["canonical"], quote=True))
                .replace("__FAQ_CRAWL__", faq_crawl_html(config, path))
            )
            self._send(
                200,
                html.encode("utf-8"),
                content_type="text/html; charset=utf-8",
                cache="public, max-age=60, must-revalidate",
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
            cache = "public, max-age=86400"
            if path.suffix in {".html", ".js", ".css"}:
                cache = "public, max-age=60, must-revalidate"
            self._send(200, body, content_type=content_type, cache=cache)

        def _redirect(self, location):
            self.send_response(301)
            self.send_header("Location", location)
            self.send_header("Content-Length", "0")
            for name, value in CORS_HEADERS:
                self.send_header(name, value)
            self.end_headers()

        def _send(self, code, body, content_type, cache="no-store"):
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", cache)
            for name, value in CORS_HEADERS:
                self.send_header(name, value)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

    return DocsHandler


def serve(config):
    handler = create_handler(config)
    server = ThreadingHTTPServer((config["host"], config["port"]), handler)
    return server


def main():
    config = load_config()
    server = serve(config)
    print(
        f"CheckStation Docs listening on http://{config['host']}:{config['port']}",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
