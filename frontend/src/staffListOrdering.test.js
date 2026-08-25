/**
 * Run: node --test src/staffListOrdering.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isStaffAccountPlanLocked,
  partitionStaffByPlanAvailability,
} from "./staffListOrdering.js";

test("partition keeps unlocked Admins/Staff before locked buckets", () => {
  const accounts = [
    { id: 1, username: "admin2", role: "admin", is_plan_locked: false },
    { id: 2, username: "staff1", role: "staff", plan_unlocked: true },
    { id: 3, username: "admin1", role: "admin", is_plan_locked: true },
    { id: 4, username: "staff9", role: "staff", plan_unlocked: false },
  ];
  const parts = partitionStaffByPlanAvailability(accounts);
  assert.deepEqual(
    parts.availableAdmins.map((item) => item.username),
    ["admin2"],
  );
  assert.deepEqual(
    parts.availableStaff.map((item) => item.username),
    ["staff1"],
  );
  assert.deepEqual(
    parts.lockedAdmins.map((item) => item.username),
    ["admin1"],
  );
  assert.deepEqual(
    parts.lockedStaff.map((item) => item.username),
    ["staff9"],
  );
  assert.equal(isStaffAccountPlanLocked(parts.lockedAdmins[0]), true);
});

test("empty input stays safe", () => {
  assert.deepEqual(partitionStaffByPlanAvailability(null), {
    availableAdmins: [],
    availableStaff: [],
    lockedAdmins: [],
    lockedStaff: [],
  });
});
