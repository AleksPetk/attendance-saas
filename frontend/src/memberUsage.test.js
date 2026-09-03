import assert from "node:assert/strict";
import { test } from "node:test";

import { memberUsageMetrics } from "./memberUsage.js";

test("Member usage reports count, remaining capacity, and percentage", () => {
  assert.deepEqual(memberUsageMetrics(9, 300), {
    count: 9,
    unlimited: false,
    limit: 300,
    remaining: 291,
    percentage: 3,
  });
});

test("Member usage handles zero, full, and legacy over-limit counts", () => {
  assert.equal(memberUsageMetrics(0, 0).percentage, 0);
  assert.equal(memberUsageMetrics(10, 10).percentage, 100);
  assert.deepEqual(memberUsageMetrics(12, 10), {
    count: 12,
    unlimited: false,
    limit: 10,
    remaining: 0,
    percentage: 100,
  });
});

test("Member usage supports unlimited and unavailable entitlement states", () => {
  assert.deepEqual(memberUsageMetrics(9, null, { unlimited: true }), {
    count: 9,
    unlimited: true,
    limit: null,
    remaining: null,
    percentage: null,
  });
  assert.equal(memberUsageMetrics(null, 300), null);
  assert.equal(memberUsageMetrics(9, null), null);
});
