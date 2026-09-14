import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createTranslator } from "@checkstation/i18n";
import { groupCapacityNotice, isPlanLocked, memberCapacityNotice, partitionByPlanLock, requiredPlanSelectionCount } from "./planCapacity";

const app = readFileSync(fileURLToPath(new URL("../App.tsx", import.meta.url)), "utf8");
const shell = readFileSync(fileURLToPath(new URL("../shell/DesktopShell.tsx", import.meta.url)), "utf8");
const groups = readFileSync(fileURLToPath(new URL("../pages/GroupsPage.tsx", import.meta.url)), "utf8");
const members = readFileSync(fileURLToPath(new URL("../pages/PeoplePage.tsx", import.meta.url)), "utf8");
const panel = readFileSync(fileURLToPath(new URL("../components/PlanCapacityResolution.tsx", import.meta.url)), "utf8");

test("capacity notices use the supplied plan allowance instead of a fixed Basic cap", () => {
  const t = createTranslator("en");
  assert.equal(groupCapacityNotice(t, { archived: false, planName: "Basic", limit: 2 }), "Your Basic plan includes 2 active Standard Groups. Choose the 2 Groups you want to keep available.");
  assert.equal(groupCapacityNotice(t, { archived: false, planName: "Plus", limit: 15 }), "Your Plus plan includes 15 active Standard Groups. Choose the 15 Groups you want to keep available.");
  assert.equal(groupCapacityNotice(t, { archived: true, planName: "Basic", limit: 1 }), "Your Basic plan includes 1 accessible archived Group. Choose the 1 you want to keep available.");
  assert.equal(memberCapacityNotice(t, { planName: "Basic", limit: 10 }), "Your Basic plan includes 10 Members. Choose the 10 Members you want to keep available.");
  assert.equal(memberCapacityNotice(t, { planName: "Plus", limit: 100 }), "Your Plus plan includes 100 Members. Choose the 100 Members you want to keep available.");
  assert.equal(memberCapacityNotice(t, { planName: "Basic", limit: null }), "Choose which Members remain available under the current plan.");
  assert.equal(requiredPlanSelectionCount(15, 40), 15);
  assert.equal(requiredPlanSelectionCount(40, 12), 12);
});

test("plan-lock partitions follow the resource flag and do not invent structured selection", () => {
  const rows = [
    { id: 1, is_plan_locked: false },
    { id: 2, plan_unlocked: false },
    { id: 3, is_plan_locked: true },
  ];
  assert.equal(isPlanLocked(rows[1]), true);
  assert.deepEqual(partitionByPlanLock(rows).available.map((row) => row.id), [1]);
  assert.deepEqual(partitionByPlanLock(rows).locked.map((row) => row.id), [2, 3]);
  assert.doesNotMatch(groups, /active_structured_groups"\)/);
  assert.doesNotMatch(groups, /kind: "active_structured_groups"|kind=\{"active_structured_groups"\}/);
});

test("desktop Staff navigation and route use the shared staff_management entitlement", () => {
  assert.match(shell, /canAccessStaffManagement/);
  assert.match(shell, /shouldShowLockedStaffNav/);
  assert.match(shell, /className="nav-link is-plan-locked"/);
  assert.match(shell, /nav-lock-badge/);
  assert.match(shell, /aria-disabled="true"/);
  assert.doesNotMatch(shell, /to=\{item.to\}[\s\S]{0,80}is-plan-locked/);
  assert.match(app, /function StaffRoute/);
  assert.match(app, /canAccessStaffManagement\(authState\.session, canManageStaffAccounts\(authState\.session\)\)/);
  assert.match(app, /<Navigate to="\/" replace \/>/);
  assert.match(app, /<Route path="\/staff" element=\{<StaffRoute \/>\} \/>/);
  assert.doesNotMatch(app, /<Route path="\/staff" element=\{<StaffPage \/>\} \/>/);
});

test("desktop capacity resolution reuses the browser plan-lock selection endpoint and session refresh", () => {
  assert.match(groups, /selectionRequired\(authState\.session, selectionKind\)/);
  assert.match(groups, /planLimitValue\(authState\.session, selectionKind\)/);
  assert.match(groups, /Plan capacity needs a decision|groups\.planSelection\.needsDecision/);
  assert.match(groups, /groups\.planSelection\.chooseButton/);
  assert.match(members, /selectionRequired\(authState\.session, MEMBERS\)/);
  assert.match(members, /members\.planSelection\.needsDecision/);
  assert.match(members, /members\.planSelection\.chooseButton/);
  assert.match(panel, /endpoints\.planLockSelection\(kind\)/);
  assert.match(panel, /endpoints\.planLockSelectionUpdate\(\)/);
  assert.match(panel, /selected_ids: selectedIds/);
  assert.match(panel, /setSelectedIds\(\[\]\)/);
  assert.match(panel, /auth\.refreshWorkspace\(\)/);
  assert.match(shell, /auth\.refreshWorkspace\(\)/);
  assert.doesNotMatch(`${groups}\n${members}\n${panel}`, /limit:\s*(2|10)\b/);
});
