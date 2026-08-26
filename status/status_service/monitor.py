"""Periodic probe loop."""

import threading
import time

from status_service.incidents import sync_auto_incident
from status_service.probes import ProbeRunner
from status_service.store import public_description_for_kind, utc_now


class Monitor:
    def __init__(self, store, config, probe_runner=None):
        self.store = store
        self.config = config
        self.probe_runner = probe_runner or ProbeRunner(config)
        self._stop = threading.Event()
        self._thread = None

    def run_cycle(self, results=None, *, now=None):
        now = now or utc_now()
        if results is None:
            results = self.probe_runner.run_all()
        states = {}
        for component_id, result in results.items():
            description = result.description or public_description_for_kind(result.kind)
            state = self.store.apply_result(
                component_id,
                result.kind,
                now=now,
                description=description,
            )
            states[component_id] = state
            sync_auto_incident(self.store, component_id, state, now=now)
        return states

    def start(self):
        if self._thread is not None:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="status-monitor", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)
            self._thread = None

    def _loop(self):
        self.run_cycle()
        interval = self.config["probe_interval_seconds"]
        while not self._stop.wait(interval):
            try:
                self.run_cycle()
            except Exception:
                time.sleep(1)
