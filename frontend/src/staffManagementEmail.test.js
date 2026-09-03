/**
 * Run: node --test src/staffManagementEmail.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isStaffEmailRequired,
  staffEmailDuplicateMessage,
  staffEmailFieldLabel,
} from "./staffManagementEmail.js";

test("admin email field is required", () => {
  assert.equal(isStaffEmailRequired("admin"), true);
  assert.equal(staffEmailFieldLabel("admin"), "Email");
});

test("staff email field remains optional", () => {
  assert.equal(isStaffEmailRequired("staff"), false);
  assert.equal(staffEmailFieldLabel("staff"), "Email (optional)");
});

test("duplicate email message is workspace-scoped", () => {
  assert.match(staffEmailDuplicateMessage(), /this workspace/i);
  assert.doesNotMatch(staffEmailDuplicateMessage(), /global|owner account/i);
});
