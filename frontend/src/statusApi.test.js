import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fetchStatusSnapshot,
  statusApiUrl,
  statusPollDelayMs,
} from "./statusApi.js";

function response(data, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

test("workspace status uses the canonical public Status API endpoints", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith("/current/")) {
      return response({ overall: { state: "all_operational" }, poll_interval_seconds: 45 });
    }
    if (url.endsWith("/incidents/")) return response({ active: [{ id: "1" }], recent: [] });
    return response({ windows: [{ id: "2" }] });
  };

  const snapshot = await fetchStatusSnapshot({ fetchImpl });
  assert.deepEqual(calls.map(([url]) => url), [
    "http://localhost:8090/api/status/current/",
    "http://localhost:8090/api/status/incidents/",
    "http://localhost:8090/api/status/maintenance/",
  ]);
  assert.ok(calls.every(([, options]) => options.cache === "no-store"));
  assert.equal(snapshot.incidents.active[0].id, "1");
  assert.equal(snapshot.maintenance.windows[0].id, "2");
  assert.equal(statusPollDelayMs(snapshot), 45000);
  assert.equal(statusApiUrl("current/"), calls[0][0]);
});

test("workspace status requests pass workspace lang to the Status API", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (String(url).includes("/current/")) {
      return response({ overall: { state: "all_operational", label: "すべてのシステムが正常です" } });
    }
    if (String(url).includes("/incidents/")) return response({ active: [], recent: [] });
    return response({ windows: [] });
  };
  await fetchStatusSnapshot({ fetchImpl, lang: "ja" });
  assert.ok(calls.every((url) => String(url).includes("lang=ja")));
  assert.equal(
    statusApiUrl("current/", { lang: "ja" }),
    "http://localhost:8090/api/status/current/?lang=ja",
  );
});

test("current status failure is surfaced while optional incident feeds degrade safely", async () => {
  await assert.rejects(
    fetchStatusSnapshot({ fetchImpl: async () => response({}, false, 503) }),
    /Status data is unavailable/,
  );

  const snapshot = await fetchStatusSnapshot({
    fetchImpl: async (url) => url.endsWith("/current/")
      ? response({ overall: { state: "all_operational" } })
      : response({}, false, 503),
  });
  assert.deepEqual(snapshot.incidents, { active: [], recent: [] });
  assert.deepEqual(snapshot.maintenance, { windows: [] });
});
