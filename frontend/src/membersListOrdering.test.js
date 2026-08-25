import assert from "node:assert/strict";
import test from "node:test";
import {
  isMemberPlanLocked,
  partitionMembersByPlanAvailability,
} from "./membersListOrdering.js";

test("partitionMembersByPlanAvailability keeps unlocked first semantics", () => {
  const members = [
    { id: 1, name: "Zulu Locked", plan_unlocked: false },
    { id: 2, name: "Alpha Available", plan_unlocked: true },
    { id: 3, name: "Mike Available", is_plan_locked: false },
    { id: 4, name: "Beta Locked", is_plan_locked: true },
  ];
  const { available, locked } = partitionMembersByPlanAvailability(members);
  assert.deepEqual(
    available.map((item) => item.id),
    [2, 3],
  );
  assert.deepEqual(
    locked.map((item) => item.id),
    [1, 4],
  );
  assert.equal(isMemberPlanLocked(locked[0]), true);
  assert.equal(isMemberPlanLocked(available[0]), false);
});
