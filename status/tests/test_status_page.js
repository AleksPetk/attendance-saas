import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RECENT_INCIDENT_DISPLAY_LIMIT,
  formatAutoUpdate,
  formatDuration,
  formatLastChecked,
  formatRelativeTime,
  groupComponents,
  incidentDisplaySummary,
  incidentTitle,
  limitRecentIncidents,
  overallNarrative,
  unavailablePayload,
} from "../static/status-view.js";

const NOW = Date.parse("2026-08-26T11:18:00Z");

test("overall narrative uses API component names, not hardcoded operational copy", () => {
  const allHealthy = {
    overall: { state: "all_operational", label: "All systems operational" },
    components: [
      { id: "api_backend", name: "API / Backend", state: "operational", layer: "core" },
    ],
  };
  assert.equal(overallNarrative(allHealthy), "");

  const degraded = {
    overall: { state: "some_degraded", label: "Some systems degraded" },
    components: [
      { id: "api_backend", name: "API / Backend", state: "operational", layer: "core" },
      {
        id: "email_delivery",
        name: "Email Delivery",
        state: "major_outage",
        layer: "supporting",
      },
    ],
  };
  assert.equal(
    overallNarrative(degraded),
    "We're currently experiencing an issue with Email Delivery.",
  );

  const unavailable = unavailablePayload();
  assert.equal(overallNarrative(unavailable), "Live status data is not available.");
  assert.equal(unavailable.overall.state, "unavailable");
});

test("components are grouped by layer", () => {
  const groups = groupComponents([
    { id: "api_backend", name: "API / Backend", layer: "core", state: "operational" },
    { id: "email_delivery", name: "Email Delivery", layer: "supporting", state: "unknown" },
    { id: "documentation", name: "Documentation", layer: "peripheral", state: "unknown" },
  ]);
  assert.deepEqual(
    groups.map((group) => [group.id, group.items.map((item) => item.id)]),
    [
      ["core", ["api_backend"]],
      ["supporting", ["email_delivery"]],
      ["peripheral", ["documentation"]],
    ],
  );
});

test("unknown component state is preserved for display helpers", () => {
  const current = {
    overall: { state: "unavailable", label: "Status unavailable" },
    components: [
      { id: "documentation", name: "Documentation", state: "unknown", layer: "peripheral" },
    ],
  };
  assert.equal(current.components[0].state, "unknown");
  assert.equal(overallNarrative(current), "Live status data is not available.");
});

test("recent incidents are capped for the public page", () => {
  const items = Array.from({ length: 12 }, (_, index) => ({ id: String(index) }));
  assert.equal(RECENT_INCIDENT_DISPLAY_LIMIT, 5);
  assert.equal(limitRecentIncidents(items).length, 5);
  assert.deepEqual(
    limitRecentIncidents(items).map((item) => item.id),
    ["0", "1", "2", "3", "4"],
  );
});

test("incident summaries avoid repeating the generic outage sentence", () => {
  const active = {
    title: "Email Delivery outage",
    summary: "This CheckStation component is currently unavailable.",
    status: "investigating",
  };
  assert.equal(incidentTitle(active), "Email Delivery");
  assert.equal(
    incidentDisplaySummary(active),
    "We're investigating an issue affecting Email Delivery.",
  );
  assert.equal(
    incidentDisplaySummary({
      title: "Email Delivery outage",
      status: "resolved",
      summary: "This CheckStation component is currently unavailable.",
    }),
    "Email Delivery has recovered.",
  );
});

test("timestamps stay human-readable and retain an exact form", () => {
  assert.match(formatLastChecked("2026-08-26T02:18:00Z"), /Last checked /);
  assert.match(formatLastChecked("2026-08-26T02:18:00Z"), /2026/);
  assert.equal(formatRelativeTime("2026-08-26T11:11:00Z", NOW), "7 minutes ago");
  assert.equal(
    formatDuration("2026-08-26T11:07:00Z", "2026-08-26T11:18:00Z"),
    "11 minutes",
  );
  assert.equal(formatAutoUpdate(30), "Auto-updates every 30 seconds");
  assert.equal(formatLastChecked(null), "Last checked — not yet checked");
});
