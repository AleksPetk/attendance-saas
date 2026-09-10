import assert from "node:assert/strict";
import test from "node:test";
import { enabledGroupActions, filterAndSortGroups, groupParticipantCounts, groupUsageMetrics } from "./groups";

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

test("group cards derive the enabled attendance actions from the server action config", () => {
  assert.deepEqual(enabledGroupActions({ check_in_enabled: true, check_out_enabled: false, breaks_enabled: true, max_breaks: 3 }), [
    { kind: "check_in" },
    { kind: "breaks", maxBreaks: 3 },
  ]);
  assert.deepEqual(enabledGroupActions({ breaks_enabled: true, max_breaks: null }), [{ kind: "breaks", maxBreaks: 1 }]);
  assert.deepEqual(enabledGroupActions(undefined), []);
});

test("standard card composition uses canonical participant counts with a safe total fallback", () => {
  assert.deepEqual(groupParticipantCounts({ participant_count: 7, member_count: 3, group_only_participant_count: 4 }), { total: 7, members: 3, groupOnly: 4 });
  assert.deepEqual(groupParticipantCounts({ member_count: 2, group_only_participant_count: 1 }), { total: 3, members: 2, groupOnly: 1 });
});
