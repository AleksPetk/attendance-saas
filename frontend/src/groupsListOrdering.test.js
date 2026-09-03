/**
 * Run: node --test src/groupsListOrdering.test.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  filterAndSortGroups,
  groupParticipantCount,
  groupUsageMetrics,
  isGroupPlanLocked,
  participantSummaryForGroup,
  partitionGroupsByPlanAvailability,
} from "./groupsListOrdering.js";

const filterGroups = [
  { id: 1, name: "Beta", group_type: "standard", participant_count: 2, created_at: "2026-01-02T00:00:00Z" },
  { id: 2, name: "Alpha", group_type: "structured", participant_count: 12, created_at: "2026-01-03T00:00:00Z" },
  { id: 3, name: "Zulu", group_type: "standard", participant_count: 5, created_at: "2026-01-01T00:00:00Z" },
  { id: 4, name: "Delta", group_type: "structured", participant_count: 1, created_at: "2026-01-04T00:00:00Z" },
];

test("Groups toolbar wraps before the workspace content becomes constrained", () => {
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  assert.match(
    css,
    /@media \(max-width: 1280px\)\s*{\s*\.groups-toolbar\s*{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    css,
    /@media \(max-width: 720px\)\s*{[\s\S]*?\.groups-usage,\s*\.groups-toolbar\s*{\s*grid-template-columns:\s*1fr;/,
  );
});

test("partition keeps unlocked Groups before locked Groups", () => {
  const groups = [
    { id: 1, name: "Beta Available", is_plan_locked: false },
    { id: 2, name: "Mike Available", plan_unlocked: true },
    { id: 3, name: "Alpha Locked", is_plan_locked: true },
    { id: 4, name: "Zulu Locked", plan_unlocked: false },
  ];
  const { available, locked } = partitionGroupsByPlanAvailability(groups);
  assert.deepEqual(
    available.map((group) => group.name),
    ["Beta Available", "Mike Available"],
  );
  assert.deepEqual(
    locked.map((group) => group.name),
    ["Alpha Locked", "Zulu Locked"],
  );
});

test("structured locked Groups stay in locked bucket", () => {
  const { available, locked } = partitionGroupsByPlanAvailability([
    { id: 1, name: "Std Open", is_plan_locked: false },
    { id: 2, name: "Structured Locked", group_type: "structured", is_plan_locked: true },
    { id: 3, name: "Std Locked", is_plan_locked: true },
  ]);
  assert.equal(available.length, 1);
  assert.equal(available[0].name, "Std Open");
  assert.deepEqual(
    locked.map((group) => group.name),
    ["Structured Locked", "Std Locked"],
  );
  assert.equal(isGroupPlanLocked(locked[0]), true);
});

test("empty and malformed input stay safe", () => {
  assert.deepEqual(partitionGroupsByPlanAvailability(null), {
    available: [],
    locked: [],
  });
  assert.deepEqual(partitionGroupsByPlanAvailability([]), {
    available: [],
    locked: [],
  });
});

test("Standard Group summary uses the canonical API participant count", () => {
  assert.deepEqual(
    participantSummaryForGroup({
      group_type: "standard",
      participant_count: 12,
      member_count: 7,
      group_only_participant_count: 5,
    }),
    {
      translationKey: "participants.summary",
      values: { total: 12, count: 12, members: 7, groupOnly: 5 },
    },
  );
});

test("Structured Group summary preserves its canonical section participant total", () => {
  assert.deepEqual(
    participantSummaryForGroup({
      group_type: "structured",
      participant_count: 18,
      member_count: 0,
      group_only_participant_count: 0,
    }),
    {
      translationKey: "participants.count",
      values: { total: 18, count: 18, members: 0, groupOnly: 0 },
    },
  );
});

test("Group type filtering keeps Standard and Structured filters independent from sorting", () => {
  assert.deepEqual(
    filterAndSortGroups(filterGroups, { type: "standard", sort: "name_asc" }).map((group) => group.name),
    ["Beta", "Zulu"],
  );
  assert.deepEqual(
    filterAndSortGroups(filterGroups, { type: "structured", sort: "name_asc" }).map((group) => group.name),
    ["Alpha", "Delta"],
  );
});

test("server search results can be combined with type filtering and sorting", () => {
  const searchedGroups = filterGroups.filter((group) => group.name.toLowerCase().includes("a"));
  assert.deepEqual(
    filterAndSortGroups(searchedGroups, { type: "structured", sort: "name_desc" }).map(
      (group) => group.name,
    ),
    ["Delta", "Alpha"],
  );
});

test("Groups sort by creation time in both directions", () => {
  assert.deepEqual(
    filterAndSortGroups(filterGroups, { sort: "newest" }).map((group) => group.name),
    ["Delta", "Alpha", "Beta", "Zulu"],
  );
  assert.deepEqual(
    filterAndSortGroups(filterGroups, { sort: "oldest" }).map((group) => group.name),
    ["Zulu", "Beta", "Alpha", "Delta"],
  );
});

test("Groups sort with the canonical API participant_count", () => {
  assert.equal(groupParticipantCount(filterGroups[1]), 12);
  assert.deepEqual(
    filterAndSortGroups(filterGroups, { sort: "participants_desc" }).map((group) => group.name),
    ["Alpha", "Zulu", "Beta", "Delta"],
  );
  assert.deepEqual(
    filterAndSortGroups(filterGroups, { sort: "participants_asc" }).map((group) => group.name),
    ["Delta", "Beta", "Zulu", "Alpha"],
  );
});

test("Groups support type-first and alphabetical ordering", () => {
  assert.deepEqual(
    filterAndSortGroups(filterGroups, { sort: "structured_first" }).map((group) => group.name),
    ["Delta", "Alpha", "Beta", "Zulu"],
  );
  assert.deepEqual(
    filterAndSortGroups(filterGroups, { sort: "standard_first" }).map((group) => group.name),
    ["Beta", "Zulu", "Delta", "Alpha"],
  );
  assert.deepEqual(
    filterAndSortGroups(filterGroups, { sort: "name_asc" }).map((group) => group.name),
    ["Alpha", "Beta", "Delta", "Zulu"],
  );
  assert.deepEqual(
    filterAndSortGroups(filterGroups, { sort: "name_desc" }).map((group) => group.name),
    ["Zulu", "Delta", "Beta", "Alpha"],
  );
});

test("Group usage clamps remaining capacity and progress for zero and legacy over-limit states", () => {
  assert.deepEqual(groupUsageMetrics(3, 30), {
    count: 3,
    limit: 30,
    remaining: 27,
    percentage: 10,
  });
  assert.equal(groupUsageMetrics(0, 0).percentage, 0);
  assert.deepEqual(groupUsageMetrics(4, 2), {
    count: 4,
    limit: 2,
    remaining: 0,
    percentage: 100,
  });
});
