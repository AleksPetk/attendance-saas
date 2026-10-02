import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const staffScreen = readFileSync(join(here, "../../app/(app)/staff.tsx"), "utf8");
const row = readFileSync(join(here, "StaffListRow.tsx"), "utf8");
const rootLayout = readFileSync(join(here, "../../app/_layout.tsx"), "utf8");

function renderLeftFn() {
  return row.slice(row.indexOf("function renderLeftActions()"), row.indexOf("function renderRightActions()"));
}

function renderRightFn() {
  return row.slice(row.indexOf("function renderRightActions()"), row.indexOf("const card ="));
}

function activeAdminLeftBlock() {
  const left = renderLeftFn();
  return left.slice(left.indexOf("if (active && isAdmin)"), left.indexOf("if (active && isStaff)"));
}

function activeAdminRightBlock() {
  const right = renderRightFn();
  return right.slice(right.indexOf("if (active && isAdmin)"), right.indexOf("if (active && isStaff)"));
}

function activeAdminA11yBlock() {
  const start = row.indexOf("? isAdmin");
  const end = row.indexOf(": [", start);
  return row.slice(start, end);
}

test("Active Admin: left swipe = Edit only; right swipe = Reset password + Deactivate; no Group access", () => {
  assert.doesNotMatch(staffScreen, /AccountAction/);
  assert.doesNotMatch(staffScreen, /actionButton/);

  const left = activeAdminLeftBlock();
  assert.match(left, /ActionButton busy=\{busy\} label=\{editLabel\} onPress=\{\(\) => runAction\(onEdit\)\} tone="primary"/);
  assert.doesNotMatch(left, /onResetPassword|resetPasswordLabel|onGroupAccess|groupAccessLabel|onDeactivate/);

  const right = activeAdminRightBlock();
  assert.match(right, /ActionButton busy=\{busy\} label=\{resetPasswordLabel\} onPress=\{\(\) => runAction\(onResetPassword\)\} tone="warning"/);
  assert.match(right, /ActionButton busy=\{busy\} label=\{deactivateLabel\} onPress=\{\(\) => runAction\(onDeactivate\)\} tone="warning"/);
  // Reset password must appear before Deactivate.
  assert.ok(right.indexOf("resetPasswordLabel") < right.indexOf("deactivateLabel"));
  assert.doesNotMatch(right, /onGroupAccess|groupAccessLabel|onEdit/);
});

test("Active Admin accessibility includes Edit, Reset password, Deactivate — not Group access", () => {
  const a11y = activeAdminA11yBlock();
  assert.match(a11y, /name: "edit"/);
  assert.match(a11y, /name: "resetPassword"/);
  assert.match(a11y, /name: "deactivate"/);
  assert.doesNotMatch(a11y, /groupAccess/);
});

test("Active Admin Reset password uses existing password editor handler", () => {
  assert.match(staffScreen, /onEdit=\{\(\) => setEditor\(\{ mode: "edit", staff \}\)\}/);
  assert.match(staffScreen, /onResetPassword=\{\(\) => setEditor\(\{ mode: "password", staff \}\)\}/);
  assert.match(staffScreen, /onDeactivate=\{\(\) => confirm\(staff\)\}/);
  assert.match(staffScreen, /mode: "password"/);
  assert.match(staffScreen, /endpoints\.workspaceStaffPassword/);
  assert.match(staffScreen, /NativeAlert\.alert/);
  assert.match(staffScreen, /staff\.status === "active" \? "inactive" : "active"/);
});

test("Active Staff: left Edit+Group access; right Reset password+Deactivate (unchanged)", () => {
  assert.match(row, /active && isStaff/);
  assert.match(row, /onPress=\{\(\) => runAction\(onGroupAccess\)\}/);
  assert.match(row, /onPress=\{\(\) => runAction\(onResetPassword\)\}/);
  assert.match(staffScreen, /onGroupAccess=\{\(\) => setEditor\(\{ mode: "access", staff \}\)\}/);
  assert.match(staffScreen, /onResetPassword=\{\(\) => setEditor\(\{ mode: "password", staff \}\)\}/);
  assert.match(staffScreen, /onDeactivate=\{\(\) => confirm\(staff\)\}/);
});

test("Inactive Admin/Staff: Reactivate right-swipe and Delete left-swipe; no Reset password", () => {
  assert.match(row, /reactivateLabel/);
  assert.match(row, /onPress=\{\(\) => runAction\(onReactivate\)\}/);
  assert.match(row, /onPress=\{\(\) => runAction\(onDelete\)\} tone="danger"/);
  assert.match(staffScreen, /onReactivate=\{\(\) => confirm\(staff\)\}/);
  assert.match(staffScreen, /onDelete=\{\(\) => confirm\(staff, true\)\}/);
  const leftFn = renderLeftFn();
  const rightFn = renderRightFn();
  const leftFallback = leftFn.slice(leftFn.lastIndexOf("// Inactive:"));
  const rightFallback = rightFn.slice(rightFn.lastIndexOf("// Inactive:"));
  assert.match(leftFallback, /onReactivate/);
  assert.doesNotMatch(leftFallback, /onEdit|onGroupAccess|onResetPassword|onDeactivate|onDelete/);
  assert.match(rightFallback, /onDelete/);
  assert.doesNotMatch(rightFallback, /onEdit|onGroupAccess|onResetPassword|onDeactivate|onReactivate/);
});

test("Delete permanently still requires confirmation; no full-swipe auto execution", () => {
  assert.match(staffScreen, /confirm\(staff, true\)/);
  assert.match(staffScreen, /staff\.deleteConfirm/);
  assert.match(row, /Actions never auto-fire from swipe distance/);
  assert.doesNotMatch(row, /onSwipeableOpen=\{.*onDelete/);
  assert.doesNotMatch(row, /onSwipeableWillOpen=\{.*onDelete/);
  assert.doesNotMatch(row, /onSwipeableOpen=\{.*onDeactivate/);
  assert.match(row, /overshootLeft=\{false\}/);
  assert.match(row, /overshootRight=\{false\}/);
});

test("One-open-row behavior and accessibility actions are wired", () => {
  assert.match(staffScreen, /openRowRef/);
  assert.match(row, /openRowRef\.current\.close\(\)/);
  assert.match(row, /onSwipeableWillOpen=\{registerOpen\}/);
  assert.match(row, /accessibilityActions/);
  assert.match(row, /onAccessibilityAction/);
  assert.match(row, /name: "edit"/);
  assert.match(row, /name: "groupAccess"/);
  assert.match(row, /name: "resetPassword"/);
  assert.match(row, /name: "deactivate"/);
  assert.match(row, /name: "reactivate"/);
  assert.match(row, /name: "delete"/);
  assert.match(rootLayout, /GestureHandlerRootView/);
  assert.match(rootLayout, /import "react-native-gesture-handler"/);
});

test("No invented staff detail navigation; search/counts/limits and APIs unchanged", () => {
  assert.doesNotMatch(staffScreen, /router\.push/);
  assert.doesNotMatch(row, /chevron-forward/);
  assert.match(staffScreen, /CapacityMeter/);
  assert.match(staffScreen, /staff\.activeAdmins/);
  assert.match(staffScreen, /staff\.activeStaff/);
  assert.match(staffScreen, /staff\.inactiveAdmins/);
  assert.match(staffScreen, /staff\.inactiveStaff/);
  assert.match(staffScreen, /placeholder=\{t\("staff\.search"\)\}/);
  assert.match(staffScreen, /endpoints\.workspaceStaff\(\)/);
  assert.match(staffScreen, /endpoints\.workspaceStaffAccount\(staff\.id\)/);
  assert.match(staffScreen, /api\.delete\(endpoints\.workspaceStaffAccount/);
});

test("Browser and desktop staff UIs are untouched by this swipe change", () => {
  const desktopStaff = readFileSync(join(here, "../../../desktop/src/pages/StaffPage.tsx"), "utf8");
  assert.doesNotMatch(desktopStaff, /StaffListRow|react-native-gesture-handler|Swipeable/);
  assert.match(staffScreen, /from "\.\.\/\.\.\/src\/components\/StaffListRow"/);
});
