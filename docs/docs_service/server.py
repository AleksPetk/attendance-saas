"""Stdlib HTTP server for the public Docs website."""

import json
import mimetypes
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from docs_service.config import load_config
from docs_service.seo import faq_crawl_html, is_valid_docs_html_path, page_meta

CORS_HEADERS = (
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Methods", "GET, OPTIONS"),
    ("Access-Control-Allow-Headers", "Accept, Content-Type"),
    ("Access-Control-Max-Age", "600"),
)

# Missing files with these suffixes must 404 — never fall through to the SPA HTML shell
# (browsers would treat text/html as a broken/wrong favicon).
STATIC_ASSET_SUFFIXES = {
    ".css",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".js",
    ".map",
    ".png",
    ".svg",
    ".txt",
    ".webp",
    ".woff",
    ".woff2",
    ".xml",
}


def _content_type_for(path: Path) -> str:
    if path.suffix.lower() == ".ico":
        return "image/x-icon"
    return mimetypes.guess_type(str(path))[0] or "application/octet-stream"


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
            if path == "/":
                self._redirect("/en/")
                return
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
                suffix = Path(relative).suffix.lower() if relative else ""
                if relative and suffix in STATIC_ASSET_SUFFIXES:
                    target = _safe_static_path(static_dir, relative)
                    if target is not None:
                        self._file(target, _content_type_for(target))
                        return
                    self._send(404, b"Not found", content_type="text/plain; charset=utf-8")
                    return
                if relative and "." in Path(relative).name:
                    target = _safe_static_path(static_dir, relative)
                    if target is not None:
                        self._file(target, _content_type_for(target))
                        return
            self._html(path)

        def _not_found_html(self):
            body = (
                "<!DOCTYPE html><html lang=\"en\"><head>"
                "<meta charset=\"utf-8\">"
                "<meta name=\"robots\" content=\"noindex\">"
                "<title>Page not found · CheckStation Docs</title>"
                "<link rel=\"stylesheet\" href=\"/docs.css\">"
                "</head><body class=\"docs-body\">"
                "<main class=\"docs-not-found\" style=\"padding:2rem;max-width:40rem;margin:0 auto\">"
                "<h1>Page not found</h1>"
                "<p>This documentation page does not exist.</p>"
                "<p><a href=\"/en/\">Return to CheckStation Docs</a></p>"
                "</main></body></html>"
            ).encode("utf-8")
            self._send(
                404,
                body,
                content_type="text/html; charset=utf-8",
                cache="no-store",
                extra_headers=(("X-Robots-Tag", "noindex"),),
            )

        def _html(self, path):
            if not is_valid_docs_html_path(path):
                self._not_found_html()
                return
            meta = page_meta(config, path)
            html = (
                index_template.replace("__PAGE_TITLE__", escape(meta["title"], quote=True))
                .replace(
                    "__PAGE_DESCRIPTION__",
                    escape(meta["description"], quote=True),
                )
                .replace("__PAGE_CANONICAL__", escape(meta["canonical"], quote=True))
                .replace("__PAGE_HREFLANG__", meta.get("hreflang") or "")
                .replace("__FAQ_CRAWL__", faq_crawl_html(config, path))
            )
            html = html.replace(
                '<html lang="en">',
                f'<html lang="{escape(meta.get("locale") or "en", quote=True)}">',
                1,
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

        def _send(self, code, body, content_type, cache="no-store", extra_headers=()):
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", cache)
            for name, value in extra_headers:
                self.send_header(name, value)
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
