/**
 * Run: node --test src/groupsListOrdering.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isGroupPlanLocked,
  partitionGroupsByPlanAvailability,
} from "./groupsListOrdering.js";

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
