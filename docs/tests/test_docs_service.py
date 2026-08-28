import json
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import urlopen

from docs_service.config import load_config
from docs_service.seo import canonical_for_path, page_meta, slug_for_path
from docs_service.server import serve


STATIC_DIR = Path(__file__).resolve().parents[1] / "static"


def _config(**overrides):
    config = {
        "host": "127.0.0.1",
        "port": 0,
        "api_base_url": "http://localhost:8000",
        "internal_api_url": "http://127.0.0.1:9",
        "public_url": "http://localhost:8091",
        "main_site_url": "http://localhost:5173",
        "status_public_url": "http://localhost:8090",
        "static_dir": STATIC_DIR,
    }
    config.update(overrides)
    return config


class SeoHelpersTests(unittest.TestCase):
    def test_known_routes(self):
        self.assertEqual(slug_for_path("/"), "documentation")
        self.assertEqual(slug_for_path("/documentation"), "documentation")
        self.assertEqual(slug_for_path("/privacy-policy"), "privacy-policy")
        self.assertEqual(slug_for_path("/terms-of-use"), "terms-of-use")
        self.assertEqual(slug_for_path("/getting-started"), "getting-started")
        self.assertEqual(slug_for_path("/groups-members"), "groups-members")
        self.assertEqual(slug_for_path("/kiosk-setup"), "kiosk-setup")
        self.assertEqual(slug_for_path("/billing-plans"), "billing-plans")
        self.assertEqual(slug_for_path("/faq"), "faq")
        self.assertEqual(slug_for_path("/support"), "support")
        self.assertEqual(
            canonical_for_path("http://localhost:8091", "/privacy-policy"),
            "http://localhost:8091/privacy-policy",
        )
        self.assertEqual(
            canonical_for_path("http://localhost:8091", "/"),
            "http://localhost:8091/",
        )

    def test_page_meta_fails_open_without_api(self):
        meta = page_meta(_config(), "/privacy-policy")
        self.assertEqual(meta["title"], "CheckStation Docs")
        self.assertIn("http://localhost:8091/privacy-policy", meta["canonical"])


class DocsHttpTests(unittest.TestCase):
    def setUp(self):
        self.config = _config()
        self.server = serve(self.config)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        port = self.server.server_address[1]
        self.base = f"http://127.0.0.1:{port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def _get(self, path):
        with urlopen(self.base + path, timeout=3) as response:
            return response.getcode(), response.read(), dict(response.headers)

    def test_home_and_direct_legal_routes_serve_docs_shell(self):
        for path in (
            "/",
            "/documentation",
            "/getting-started",
            "/groups-members",
            "/kiosk-setup",
            "/billing-plans",
            "/faq",
            "/support",
            "/privacy-policy",
            "/terms-of-use",
        ):
            code, body, headers = self._get(path)
            html = body.decode("utf-8")
            self.assertEqual(code, 200)
            self.assertIn("text/html", headers.get("Content-Type", ""))
            self.assertIn("CheckStation", html)
            self.assertIn('id="docs-nav"', html)
            self.assertIn('id="docs-main"', html)
            self.assertNotIn("Login", html)
            self.assertNotIn("Staff login", html)
            self.assertNotIn("public-footer", html)
            self.assertIn("/config.js", html)
            self.assertIn("viewport", html)
            self.assertIn('/favicon.ico?v=20260828', html)

    def test_favicon_assets_are_served(self):
        for path in ("/favicon.ico", "/favicon-32x32.png", "/apple-touch-icon.png"):
            code, body, headers = self._get(path)
            self.assertEqual(code, 200)
            self.assertTrue(headers.get("Content-Type", "").startswith("image/"))
            self.assertGreater(len(body), 100)

    def test_config_js_uses_browser_facing_api(self):
        code, body, headers = self._get("/config.js")
        self.assertEqual(code, 200)
        text = body.decode("utf-8")
        self.assertIn("http://localhost:8000", text)
        self.assertIn("http://localhost:8091", text)
        self.assertIn("http://localhost:5173", text)
        self.assertIn("http://localhost:8090", text)
        self.assertNotIn("backend:8000", text)
        self.assertIn("application/javascript", headers.get("Content-Type", ""))

    def test_healthz(self):
        code, body, _headers = self._get("/healthz")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body.decode("utf-8")), {"status": "ok"})

    def test_injected_meta_uses_canonical_api_when_available(self):
        payload = {
            "title": "Privacy Policy",
            "description": "How Check Station handles data.",
            "canonical_url": "http://localhost:8091/privacy-policy",
            "slug": "privacy-policy",
        }
        with patch("docs_service.seo.fetch_document", return_value=payload):
            local = serve(_config())
            thread = threading.Thread(target=local.serve_forever, daemon=True)
            thread.start()
            port = local.server_address[1]
            try:
                with urlopen(f"http://127.0.0.1:{port}/privacy-policy", timeout=3) as response:
                    html = response.read().decode("utf-8")
            finally:
                local.shutdown()
                local.server_close()
        self.assertIn("<title>Privacy Policy · CheckStation Docs</title>", html)
        self.assertIn('content="How Check Station handles data."', html)
        self.assertIn('href="http://localhost:8091/privacy-policy"', html)

    def test_css_has_mobile_layout_rules(self):
        css = (STATIC_DIR / "docs.css").read_text(encoding="utf-8")
        self.assertIn("overflow-wrap: anywhere", css)
        self.assertIn("@media (max-width: 860px)", css)
        self.assertIn("overflow-x: hidden", css)
        self.assertIn("--content:", css)
        self.assertIn(".faq-search-row", css)
        self.assertIn(".faq-toolbar", css)
        self.assertIn(".faq-item.is-open", css)
        self.assertIn(".faq-related-link", css)
        self.assertIn(".support-status", css)
        self.assertIn(".support-contact-btn", css)
        self.assertIn("flex-wrap", css)
        js = (STATIC_DIR / "docs.js").read_text(encoding="utf-8")
        self.assertIn("aria-expanded", js)
        self.assertIn("toggleFaqExclusive", js)
        self.assertIn("No matching answers found", js)
        self.assertIn("/api/content/faq/", js)
        self.assertIn("statusApiUrl", js)
        self.assertIn("contactHref", js)
        self.assertIn('slug === "support"', js)

    def test_css_uses_short_cache(self):
        code, _body, headers = self._get("/docs.css")
        self.assertEqual(code, 200)
        self.assertIn("max-age=60", headers.get("Cache-Control", ""))


class LoadConfigTests(unittest.TestCase):
    def test_defaults(self):
        with patch.dict("os.environ", {}, clear=True):
            config = load_config()
        self.assertEqual(config["port"], 8091)
        self.assertEqual(config["api_base_url"], "http://localhost:8000")
        self.assertEqual(config["public_url"], "http://localhost:8091")
        self.assertEqual(config["main_site_url"], "http://localhost:5173")
        self.assertEqual(config["status_public_url"], "http://localhost:8090")
