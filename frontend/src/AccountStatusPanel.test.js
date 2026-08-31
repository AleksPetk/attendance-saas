import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  MANUAL_REFRESH_FAILURE_MS,
  MANUAL_REFRESH_SUCCESS_MS,
  accountStatusRefreshButtonDisabled,
  accountStatusRefreshButtonLabel,
  canStartManualStatusRefresh,
} from "./accountStatusRefresh.js";
import { groupStatusComponents, statusSnapshotContent } from "./statusPresentation.js";

const snapshot = {
  current: {
    overall: { state: "some_degraded", label: "Some systems degraded" },
    last_checked_at: "2026-08-31T12:00:00Z",
    poll_interval_seconds: 30,
    components: [
      { id: "api", name: "API / Backend", state: "operational", label: "Operational", layer: "core" },
      { id: "email", name: "Email Delivery", state: "degraded", label: "Degraded", layer: "supporting" },
      { id: "docs", name: "Documentation", state: "operational", label: "Operational", layer: "peripheral" },
    ],
  },
  incidents: {
    active: [{ id: "i1", title: "Email delay", status_label: "Investigating", summary: "Messages may arrive late.", started_at: "2026-08-31T11:00:00Z" }],
    recent: [{ id: "i2", title: "API issue", status_label: "Resolved", summary: "API recovered.", started_at: "2026-08-30T10:00:00Z", resolved_at: "2026-08-30T10:30:00Z" }],
  },
  maintenance: {
    windows: [{ id: "m1", title: "Database maintenance", starts_at: "2026-09-01T10:00:00Z", ends_at: "2026-09-01T11:00:00Z", note: "Brief interruptions are possible.", upcoming: true }],
  },
};

test("workspace-native status model includes shared services, incidents, and maintenance", () => {
  const content = statusSnapshotContent(snapshot);
  assert.equal(content.overall.label, "Some systems degraded");
  assert.deepEqual(groupStatusComponents(snapshot.current.components).map((group) => group.id), ["core", "supporting", "peripheral"]);
  assert.equal(content.active[0].title, "Email delay");
  assert.equal(content.recent[0].title, "API issue");
  assert.equal(content.maintenance[0].title, "Database maintenance");
});

test("Account Status has loading/error UI and stays native", () => {
  const source = readFileSync(new URL("./AccountStatusPanel.jsx", import.meta.url), "utf8");
  assert.match(source, /Loading system status/);
  assert.match(source, /Status could not be loaded/);
  assert.match(source, /Active incidents/);
  assert.match(source, /Recent incidents/);
  assert.match(source, /Scheduled maintenance/);
  assert.doesNotMatch(source, /<iframe|window\.location|window\.open|target=["']_blank/);
});

test("manual refresh button states cover loading, success, failure, and idle", () => {
  assert.equal(accountStatusRefreshButtonLabel("idle"), "Refresh");
  assert.equal(accountStatusRefreshButtonLabel("loading"), "Refreshing...");
  assert.equal(accountStatusRefreshButtonLabel("success"), "Updated");
  assert.equal(accountStatusRefreshButtonLabel("error"), "Refresh failed");
  assert.equal(accountStatusRefreshButtonDisabled("loading"), true);
  assert.equal(accountStatusRefreshButtonDisabled("success"), false);
  assert.equal(accountStatusRefreshButtonDisabled("error"), false);
  assert.equal(accountStatusRefreshButtonDisabled("idle"), false);
});

test("manual refresh blocks overlapping requests", () => {
  assert.equal(canStartManualStatusRefresh(false), true);
  assert.equal(canStartManualStatusRefresh(true), false);
});

test("manual refresh success and failure feedback durations stay brief", () => {
  assert.equal(MANUAL_REFRESH_SUCCESS_MS, 1500);
  assert.equal(MANUAL_REFRESH_FAILURE_MS, 2000);
});

test("Account Status refresh button uses spinner and inline success feedback", () => {
  const panelSource = readFileSync(new URL("./AccountStatusPanel.jsx", import.meta.url), "utf8");
  const refreshSource = readFileSync(new URL("./accountStatusRefresh.js", import.meta.url), "utf8");
  assert.match(panelSource, /btn-spinner/);
  assert.match(refreshSource, /Refreshing\.\.\./);
  assert.match(refreshSource, /Updated/);
  assert.match(refreshSource, /Refresh failed/);
  assert.match(panelSource, /account-status-refresh-check/);
  assert.doesNotMatch(panelSource, /tutorial-success-toast/);
  assert.match(panelSource, /setSnapshot\(next\)/);
  assert.doesNotMatch(panelSource, /setSnapshot\(null\)/);
});
