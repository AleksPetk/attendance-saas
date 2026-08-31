"""Stdlib HTTP server for the Status API and standalone webpage."""

import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from status_service.config import load_config
from status_service.http_api import (
    build_current_payload,
    build_incidents_payload,
    build_maintenance_payload,
)
from status_service.monitor import Monitor
from status_service.store import StatusStore

CORS_HEADERS = (
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Methods", "GET, OPTIONS"),
    ("Access-Control-Allow-Headers", "Accept, Content-Type"),
    ("Access-Control-Max-Age", "600"),
    ("Cache-Control", "no-store"),
)


def _content_type_for(path):
    suffix = path.suffix.lower()
    if suffix == ".ico":
        return "image/x-icon"
    return mimetypes.guess_type(str(path))[0] or "application/octet-stream"


def create_handler(store, config):
    static_dir = config["static_dir"]

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
            path = parsed.path.rstrip("/") or "/"
            if path == "/healthz":
                self._json(200, {"status": "ok"})
                return
            if path == "/api/status/current":
                self._json(200, build_current_payload(store, config))
                return
            if path == "/api/status/incidents":
                self._json(200, build_incidents_payload(store))
                return
            if path == "/api/status/maintenance":
                self._json(200, build_maintenance_payload(store))
                return
            if path in {"/", "/index.html"}:
                self._file(static_dir / "index.html", "text/html; charset=utf-8")
                return
            if path.startswith("/"):
                relative = path.lstrip("/")
                target = (static_dir / relative).resolve()
                if static_dir.resolve() not in target.parents and target != static_dir.resolve():
                    self._send(404, b"Not found", content_type="text/plain; charset=utf-8")
                    return
                if target.is_file():
                    self._file(target, _content_type_for(target))
                    return
            self._send(404, b"Not found", content_type="text/plain; charset=utf-8")

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
