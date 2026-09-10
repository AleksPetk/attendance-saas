import assert from "node:assert/strict";
import test from "node:test";
import { filterAndSortMembers, memberUsageMetrics } from "./members";

const members = [
  { name: "Zed", email: "zed@example.com", created_at: "2026-01-01T00:00:00Z" },
  { name: "Amy", phone: "123", created_at: "2026-02-01T00:00:00Z" },
  { name: "Bo", created_at: "2026-03-01T00:00:00Z" },
];

test("member profile and sort controls match Workspace behavior", () => {
  assert.deepEqual(filterAndSortMembers(members, { profile: "with_email", sort: "newest" }).map((item) => item.name), ["Zed"]);
  assert.deepEqual(filterAndSortMembers(members, { profile: "without_phone", sort: "name_asc" }).map((item) => item.name), ["Bo", "Zed"]);
  assert.deepEqual(filterAndSortMembers(members, { profile: "all", sort: "newest" }).map((item) => item.name), ["Bo", "Amy", "Zed"]);
});

test("member usage uses real entitlement totals and limits", () => {
  assert.deepEqual(memberUsageMetrics(7, 300, { unlimited: false }), { count: 7, limit: 300, remaining: 293, percentage: 7 / 3, unlimited: false });
  assert.deepEqual(memberUsageMetrics(7, null, { unlimited: true }), { count: 7, limit: null, remaining: null, percentage: null, unlimited: true });
});
