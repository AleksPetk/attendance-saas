/**
 * Run: node --test src/staffDeletion.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canBeginStaffDelete,
  canCancelStaffDelete,
  canPermanentlyDeleteStaffAccount,
  removeDeletedStaffAccount,
  staffAccountLifecycleAction,
  staffDeleteConfirmation,
} from "./staffDeletion.js";


test("Delete is exposed only for inactive accounts", () => {
  const active = { id: 1, status: "active" };
  const inactive = { id: 2, status: "inactive" };

  assert.equal(canPermanentlyDeleteStaffAccount(active), false);
  assert.equal(canPermanentlyDeleteStaffAccount(inactive), true);
  assert.equal(staffAccountLifecycleAction(active).label, "Deactivate");
  assert.equal(staffAccountLifecycleAction(inactive).label, "Reactivate");
});

test("plan-locked inactive accounts retain disabled Reactivate and Delete availability", () => {
  const inactive = { id: 2, status: "inactive" };
  assert.equal(staffAccountLifecycleAction(inactive, true).disabled, true);
  assert.equal(canPermanentlyDeleteStaffAccount(inactive), true);
});

test("confirmation identifies the account and clearly states permanence", () => {
  const confirmation = staffDeleteConfirmation({
    username: "natsumi",
    role: "staff",
  });

  assert.match(confirmation.body, /staff account “natsumi”/);
  assert.match(confirmation.body, /cannot be undone/i);
  assert.equal(confirmation.confirmLabel, "Delete permanently");
});

test("cancel is allowed only while no delete request is in flight", () => {
  assert.equal(canCancelStaffDelete(false), true);
  assert.equal(canCancelStaffDelete(true), false);
});

test("repeated delete submits are deduplicated while busy", () => {
  const account = { id: 2, status: "inactive" };
  assert.equal(canBeginStaffDelete(account, false), true);
  assert.equal(canBeginStaffDelete(account, true), false);
  assert.equal(canBeginStaffDelete(null, false), false);
});

test("successful deletion removes the account locally without refreshing", () => {
  const accounts = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(removeDeletedStaffAccount(accounts, 2), [{ id: 1 }, { id: 3 }]);
});
