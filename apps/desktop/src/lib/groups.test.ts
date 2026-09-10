import assert from "node:assert/strict";
import test from "node:test";
import { filterAndSortGroups, groupUsageMetrics } from "./groups";

const groups = [
  { name: "Zulu", group_type: "standard", participant_count: 2, created_at: "2026-01-01T00:00:00Z" },
  { name: "Alpha", group_type: "structured", participant_count: 8, created_at: "2026-02-01T00:00:00Z" },
  { name: "Beta", group_type: "standard", participant_count: 4, created_at: "2026-03-01T00:00:00Z" },
];

test("group usage uses entitlement totals and limits", () => {
  assert.deepEqual(groupUsageMetrics(7, 30), { count: 7, limit: 30, remaining: 23, percentage: 7 / 30 * 100 });
  assert.deepEqual(groupUsageMetrics(0, 0), { count: 0, limit: 0, remaining: 0, percentage: 0 });
  assert.equal(groupUsageMetrics(undefined, 30), null);
});

test("group filters and Workspace sort options operate on loaded server rows", () => {
  assert.deepEqual(filterAndSortGroups(groups, { type: "structured" }).map((group) => group.name), ["Alpha"]);
  assert.deepEqual(filterAndSortGroups(groups, { sort: "newest" }).map((group) => group.name), ["Beta", "Alpha", "Zulu"]);
  assert.deepEqual(filterAndSortGroups(groups, { sort: "participants_desc" }).map((group) => group.name), ["Alpha", "Beta", "Zulu"]);
  assert.deepEqual(filterAndSortGroups(groups, { sort: "name_asc" }).map((group) => group.name), ["Alpha", "Beta", "Zulu"]);
  assert.deepEqual(filterAndSortGroups(groups, { sort: "structured_first" }).map((group) => group.name), ["Alpha", "Beta", "Zulu"]);
});
