import json
import tempfile
import threading
import unittest
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from status_service.components import COMPONENTS
from status_service.http_api import (
    build_current_payload,
    build_incidents_payload,
    build_maintenance_payload,
)
from status_service.incidents import sync_auto_incident
from status_service.monitor import Monitor
from status_service.probes import (
    ProbeResult,
    ProbeRunner,
    combine_auth_results,
    probe_django_health,
    probe_http_page,
)
from status_service.rollup import overall_status
from status_service.states import (
    OVERALL_ALL_OPERATIONAL,
    OVERALL_MAJOR_OUTAGE,
    OVERALL_PARTIAL_OUTAGE,
    OVERALL_SOME_DEGRADED,
    OVERALL_UNAVAILABLE,
    RESULT_DEGRADED,
    RESULT_FAILURE,
    RESULT_SUCCESS,
    RESULT_UNCONFIGURED,
    STATE_DEGRADED,
    STATE_MAJOR_OUTAGE,
    STATE_OPERATIONAL,
    STATE_UNKNOWN,
    apply_probe_result,
)
from status_service.store import StatusStore
from status_service.server import serve


def _config(tmpdir, **overrides):
    config = {
        "api_url": "http://api.test",
        "website_url": "http://web.test",
        "workspace_url": "http://web.test",
        "docs_url": "",
        "probe_interval_seconds": 60,
        "stale_threshold_seconds": 180,
        "http_timeout_seconds": 2,
        "browser_poll_seconds": 30,
        "data_dir": Path(tmpdir),
        "database_path": Path(tmpdir) / "status.sqlite3",
        "static_dir": Path(tmpdir),
    }
    config.update(overrides)
    return config


def _components_with(states):
    items = []
    for catalog in COMPONENTS:
        items.append(
            {
                "id": catalog["id"],
                "name": catalog["name"],
                "layer": catalog["layer"],
                "state": states.get(catalog["id"], STATE_OPERATIONAL),
            }
        )
    return items


class ThresholdTests(unittest.TestCase):
    def test_starts_unknown(self):
        state, failures, successes = apply_probe_result(
            STATE_UNKNOWN, 0, 0, RESULT_SUCCESS
        )
        self.assertEqual(state, STATE_UNKNOWN)
        self.assertEqual(successes, 1)
        self.assertEqual(failures, 0)

    def test_two_successes_become_operational(self):
        state, failures, successes = apply_probe_result(
            STATE_UNKNOWN, 0, 1, RESULT_SUCCESS
        )
        self.assertEqual(state, STATE_OPERATIONAL)
        self.assertEqual(successes, 2)
        self.assertEqual(failures, 0)

    def test_one_failure_does_not_major_outage(self):
        state, failures, successes = apply_probe_result(
            STATE_OPERATIONAL, 0, 2, RESULT_FAILURE
        )
        self.assertEqual(state, STATE_OPERATIONAL)
        self.assertEqual(failures, 1)
        self.assertEqual(successes, 0)

    def test_two_failures_degraded(self):
        state, failures, _successes = apply_probe_result(
            STATE_OPERATIONAL, 1, 0, RESULT_FAILURE
        )
        self.assertEqual(state, STATE_DEGRADED)
        self.assertEqual(failures, 2)

    def test_three_failures_major_outage(self):
        state, failures, _successes = apply_probe_result(
            STATE_DEGRADED, 2, 0, RESULT_FAILURE
        )
        self.assertEqual(state, STATE_MAJOR_OUTAGE)
        self.assertEqual(failures, 3)

    def test_two_successes_recover(self):
        state, _f, successes = apply_probe_result(
            STATE_MAJOR_OUTAGE, 0, 1, RESULT_SUCCESS
        )
        self.assertEqual(state, STATE_OPERATIONAL)
        self.assertEqual(successes, 2)

    def test_truthful_degraded_is_immediate(self):
        state, failures, successes = apply_probe_result(
            STATE_OPERATIONAL, 0, 4, RESULT_DEGRADED
        )
        self.assertEqual(state, STATE_DEGRADED)
        self.assertEqual(failures, 0)
        self.assertEqual(successes, 0)

    def test_unconfigured_is_unknown(self):
        state, failures, successes = apply_probe_result(
            STATE_OPERATIONAL, 2, 0, RESULT_UNCONFIGURED
        )
        self.assertEqual(state, STATE_UNKNOWN)
        self.assertEqual(failures, 0)
        self.assertEqual(successes, 0)


class RollupTests(unittest.TestCase):
    def test_all_core_operational_with_unknown_docs(self):
        components = _components_with(
            {
                "documentation": STATE_UNKNOWN,
                "billing_stripe": STATE_UNKNOWN,
                "email_delivery": STATE_UNKNOWN,
            }
        )
        state, label = overall_status(components)
        self.assertEqual(state, OVERALL_ALL_OPERATIONAL)
        self.assertEqual(label, "All systems operational")

    def test_unknown_core_is_unavailable(self):
        components = _components_with({"api_backend": STATE_UNKNOWN})
        state, label = overall_status(components)
        self.assertEqual(state, OVERALL_UNAVAILABLE)
        self.assertEqual(label, "Status unavailable")

    def test_docs_outage_is_not_major(self):
        components = _components_with({"documentation": STATE_MAJOR_OUTAGE})
        state, label = overall_status(components)
        self.assertEqual(state, OVERALL_SOME_DEGRADED)
        self.assertEqual(label, "Some systems degraded")

    def test_one_core_outage_is_partial(self):
        components = _components_with({"kiosk_operations": STATE_MAJOR_OUTAGE})
        state, label = overall_status(components)
        self.assertEqual(state, OVERALL_PARTIAL_OUTAGE)
        self.assertEqual(label, "Partial outage")

    def test_api_and_auth_outage_is_major(self):
        components = _components_with(
            {
                "api_backend": STATE_MAJOR_OUTAGE,
                "authentication": STATE_MAJOR_OUTAGE,
            }
        )
        state, label = overall_status(components)
        self.assertEqual(state, OVERALL_MAJOR_OUTAGE)
        self.assertEqual(label, "Major outage")


class StoreAndMonitorTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.config = _config(self.tmpdir.name)
        self.store = StatusStore(self.config["database_path"])
        self.monitor = Monitor(self.store, self.config)

    def tearDown(self):
        self.tmpdir.cleanup()

    def _result(self, kind):
        return ProbeResult(kind)

    def test_components_start_unknown(self):
        payload = build_current_payload(self.store, self.config)
        self.assertEqual(payload["overall"]["state"], OVERALL_UNAVAILABLE)
        for component in payload["components"]:
            self.assertEqual(component["state"], STATE_UNKNOWN)
            self.assertEqual(component["label"], "Unknown")

    def test_unconfigured_stripe_and_resend_and_docs_stay_unknown(self):
        results = {
            "workspace_web_app": self._result(RESULT_SUCCESS),
            "api_backend": self._result(RESULT_SUCCESS),
            "kiosk_operations": self._result(RESULT_SUCCESS),
            "authentication": self._result(RESULT_SUCCESS),
            "email_delivery": self._result(RESULT_UNCONFIGURED),
            "billing_stripe": self._result(RESULT_UNCONFIGURED),
            "public_website": self._result(RESULT_SUCCESS),
            "documentation": self._result(RESULT_UNCONFIGURED),
        }
        self.monitor.run_cycle(results)
        self.monitor.run_cycle(results)
        payload = build_current_payload(self.store, self.config)
        by_id = {item["id"]: item for item in payload["components"]}
        self.assertEqual(by_id["email_delivery"]["state"], STATE_UNKNOWN)
        self.assertEqual(by_id["billing_stripe"]["state"], STATE_UNKNOWN)
        self.assertEqual(by_id["documentation"]["state"], STATE_UNKNOWN)
        self.assertEqual(payload["overall"]["state"], OVERALL_ALL_OPERATIONAL)

    def test_stale_result_becomes_unknown(self):
        now = datetime(2026, 8, 26, 12, 0, tzinfo=timezone.utc)
        self.store.apply_result("api_backend", RESULT_SUCCESS, now=now)
        self.store.apply_result("api_backend", RESULT_SUCCESS, now=now)
        later = now + timedelta(seconds=181)
        payload = build_current_payload(self.store, self.config, now=later)
        api = next(item for item in payload["components"] if item["id"] == "api_backend")
        self.assertEqual(api["state"], STATE_UNKNOWN)

    def test_auto_incident_opens_once_and_resolves(self):
        failure = {item["id"]: self._result(RESULT_FAILURE) for item in COMPONENTS}
        success = {item["id"]: self._result(RESULT_SUCCESS) for item in COMPONENTS}
        self.monitor.run_cycle(failure)
        self.monitor.run_cycle(failure)
        self.monitor.run_cycle(failure)
        incidents = build_incidents_payload(self.store)
        self.assertTrue(incidents["active"])
        first_count = len(incidents["active"])
        self.monitor.run_cycle(failure)
        incidents = build_incidents_payload(self.store)
        self.assertEqual(len(incidents["active"]), first_count)
        self.monitor.run_cycle(success)
        self.monitor.run_cycle(success)
        incidents = build_incidents_payload(self.store)
        self.assertEqual(incidents["active"], [])
        self.assertTrue(incidents["recent"])
        self.assertTrue(
            any("investigating an issue affecting" in item["summary"] for item in incidents["recent"])
        )

    def test_public_payload_has_no_sensitive_fields(self):
        payload = json.dumps(build_current_payload(self.store, self.config))
        incidents = json.dumps(build_incidents_payload(self.store))
        maintenance = json.dumps(build_maintenance_payload(self.store))
        blob = payload + incidents + maintenance
        for needle in (
            "DATABASE_URL",
            "traceback",
            "stack",
            "sk_test",
            "re_",
            "postgres://",
            "workspace_id",
            "smtp_password",
        ):
            self.assertNotIn(needle, blob)

    def test_maintenance_payload_empty_by_default(self):
        payload = build_maintenance_payload(self.store)
        self.assertEqual(payload["windows"], [])


class ProbeMappingTests(unittest.TestCase):
    def test_health_ok_is_success(self):
        with patch(
            "status_service.probes._request",
            return_value=(200, b'{"status":"ok"}'),
        ):
            result = probe_django_health("http://api.test/api/health/", 2)
        self.assertEqual(result.kind, RESULT_SUCCESS)

    def test_health_degraded_json_is_degraded(self):
        with patch(
            "status_service.probes._request",
            return_value=(503, b'{"status":"degraded"}'),
        ):
            result = probe_django_health("http://api.test/api/health/", 2)
        self.assertEqual(result.kind, RESULT_DEGRADED)

    def test_unknown_json_is_unconfigured(self):
        with patch(
            "status_service.probes._request",
            return_value=(200, b'{"status":"unknown"}'),
        ):
            result = probe_django_health("http://api.test/api/health/email/", 2)
        self.assertEqual(result.kind, RESULT_UNCONFIGURED)
        self.assertEqual(result.description, "Not enough health evidence")

    def test_unconfigured_json_is_unconfigured(self):
        with patch(
            "status_service.probes._request",
            return_value=(200, b'{"status":"unconfigured"}'),
        ):
            result = probe_django_health("http://api.test/api/health/stripe/", 2)
        self.assertEqual(result.kind, RESULT_UNCONFIGURED)

    def test_transport_failure(self):
        with patch("status_service.probes._request", return_value=(None, b"")):
            result = probe_http_page("http://web.test/", 2)
        self.assertEqual(result.kind, RESULT_FAILURE)

    def test_auth_degraded_when_api_degraded(self):
        result = combine_auth_results(
            ProbeResult(RESULT_SUCCESS),
            ProbeResult(RESULT_DEGRADED),
        )
        self.assertEqual(result.kind, RESULT_DEGRADED)

    def test_probe_runner_does_not_hit_docs_when_unconfigured(self):
        calls = []

        def fake_request(url, timeout, method="GET"):
            calls.append(url)
            if "/health/" in url and "kiosk" not in url and "email" not in url and "stripe" not in url:
                return 200, b'{"status":"ok"}'
            if "health/" in url:
                return 200, b'{"status":"unconfigured"}'
            if "csrf" in url:
                return 200, b'{"csrfToken":"abc"}'
            return 200, b"<html></html>"

        runner = ProbeRunner(_config(tempfile.gettempdir(), docs_url=""))
        with patch("status_service.probes._request", side_effect=fake_request):
            results = runner.run_all()
        self.assertEqual(results["documentation"].kind, RESULT_UNCONFIGURED)
        self.assertTrue(all("docs" not in url for url in calls))
        self.assertEqual(results["billing_stripe"].kind, RESULT_UNCONFIGURED)
        self.assertEqual(results["email_delivery"].kind, RESULT_UNCONFIGURED)
        self.assertEqual(results["api_backend"].kind, RESULT_SUCCESS)
        self.assertEqual(results["authentication"].kind, RESULT_SUCCESS)


class HttpApiSecurityTests(unittest.TestCase):
    def test_incident_text_is_public_only(self):
        tmp = tempfile.TemporaryDirectory()
        store = StatusStore(Path(tmp.name) / "db.sqlite3")
        store.open_incident(
            title="API / Backend outage",
            summary="This CheckStation component is currently unavailable.",
            severity=STATE_MAJOR_OUTAGE,
            component_ids=["api_backend"],
            auto_component_id="api_backend",
            message="This CheckStation component is currently unavailable.",
        )
        payload = build_incidents_payload(store)
        blob = json.dumps(payload)
        self.assertNotIn("Traceback", blob)
        self.assertNotIn("postgres", blob)
        tmp.cleanup()


class StatusHttpTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.config = _config(self.tmpdir.name)
        self.config["host"] = "127.0.0.1"
        self.config["port"] = 0
        self.config["static_dir"] = Path(__file__).resolve().parents[1] / "static"
        self.store = StatusStore(self.config["database_path"])
        self.server = serve(self.store, self.config)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        port = self.server.server_address[1]
        self.base = f"http://127.0.0.1:{port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmpdir.cleanup()

    def _get(self, path):
        request = urllib.request.Request(self.base + path, method="GET")
        with urllib.request.urlopen(request, timeout=3) as response:
            return response.getcode(), response.headers, response.read()

    def test_current_api_is_public_json_without_session(self):
        code, headers, body = self._get("/api/status/current/")
        self.assertEqual(code, 200)
        self.assertIn("application/json", headers.get("Content-Type", ""))
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "*")
        self.assertIsNone(headers.get("Set-Cookie"))
        payload = json.loads(body.decode("utf-8"))
        self.assertIn("overall", payload)
        self.assertIn("components", payload)
        self.assertEqual(payload["overall"]["state"], OVERALL_UNAVAILABLE)
        self.assertNotIn("Operational", json.dumps(payload["components"]))

    def test_status_page_needs_no_login(self):
        code, _headers, body = self._get("/")
        self.assertEqual(code, 200)
        html = body.decode("utf-8")
        self.assertIn("CheckStation Status", html)
        self.assertNotIn("Login", html)
        self.assertNotIn("Get started", html)

    def test_cors_preflight_and_head_are_uncredentialed(self):
        options = urllib.request.Request(
            self.base + "/api/status/current/",
            method="OPTIONS",
        )
        with urllib.request.urlopen(options, timeout=3) as response:
            self.assertEqual(response.getcode(), 204)
            self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "*")
            self.assertEqual(response.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS")
            self.assertIsNone(response.headers.get("Access-Control-Allow-Credentials"))
            self.assertIsNone(response.headers.get("Set-Cookie"))

        head = urllib.request.Request(self.base + "/api/status/current/", method="HEAD")
        with urllib.request.urlopen(head, timeout=3) as response:
            self.assertEqual(response.getcode(), 200)
            self.assertIn("application/json", response.headers.get("Content-Type", ""))
            self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "*")
            self.assertEqual(response.read(), b"")


if __name__ == "__main__":
    unittest.main()
