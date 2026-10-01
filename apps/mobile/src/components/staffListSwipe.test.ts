import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const staffScreen = readFileSync(join(here, "../../app/(app)/staff.tsx"), "utf8");
const row = readFileSync(join(here, "StaffListRow.tsx"), "utf8");
const rootLayout = readFileSync(join(here, "../../app/_layout.tsx"), "utf8");

test("Active Admin: no visible large action buttons; left=Edit, right=Deactivate; no Reset password swipe", () => {
  assert.doesNotMatch(staffScreen, /AccountAction/);
  assert.doesNotMatch(staffScreen, /actionButton/);
  assert.match(row, /active && isAdmin/);
  assert.match(row, /ActionButton busy=\{busy\} label=\{editLabel\} onPress=\{\(\) => runAction\(onEdit\)\} tone="primary"/);
  assert.match(row, /ActionButton busy=\{busy\} label=\{deactivateLabel\} onPress=\{\(\) => runAction\(onDeactivate\)\} tone="warning"/);
  // Active admin right/left panels must not expose reset password
  const activeAdminLeft = row.slice(row.indexOf("if (active && isAdmin)"), row.indexOf("if (active && isStaff)"));
  assert.doesNotMatch(activeAdminLeft, /resetPassword/);
  const activeAdminBlock = row.match(/if \(active && isAdmin\)[\s\S]*?(?=if \(active && isStaff\))/g) || [];
  assert.equal(activeAdminBlock.length >= 2, true);
  for (const block of activeAdminBlock) assert.doesNotMatch(block, /onResetPassword|resetPasswordLabel/);
});

test("Active Admin actions call existing editor/confirm handlers", () => {
  assert.match(staffScreen, /onEdit=\{\(\) => setEditor\(\{ mode: "edit", staff \}\)\}/);
  assert.match(staffScreen, /onDeactivate=\{\(\) => confirm\(staff\)\}/);
  assert.match(staffScreen, /NativeAlert\.alert/);
  assert.match(staffScreen, /staff\.status === "active" \? "inactive" : "active"/);
});

test("Active Staff: left Edit+Group access; right Reset password+Deactivate", () => {
  assert.match(row, /active && isStaff/);
  assert.match(row, /onPress=\{\(\) => runAction\(onGroupAccess\)\}/);
  assert.match(row, /onPress=\{\(\) => runAction\(onResetPassword\)\}/);
  assert.match(staffScreen, /onGroupAccess=\{\(\) => setEditor\(\{ mode: "access", staff \}\)\}/);
  assert.match(staffScreen, /onResetPassword=\{\(\) => setEditor\(\{ mode: "password", staff \}\)\}/);
  assert.match(staffScreen, /onDeactivate=\{\(\) => confirm\(staff\)\}/);
});

test("Inactive Admin/Staff: Reactivate right-swipe and Delete left-swipe; no Edit/Reset/Group access swipes", () => {
  assert.match(row, /reactivateLabel/);
  assert.match(row, /onPress=\{\(\) => runAction\(onReactivate\)\}/);
  assert.match(row, /onPress=\{\(\) => runAction\(onDelete\)\} tone="danger"/);
  assert.match(staffScreen, /onReactivate=\{\(\) => confirm\(staff\)\}/);
  assert.match(staffScreen, /onDelete=\{\(\) => confirm\(staff, true\)\}/);
  // Final fallbacks in left/right renderers are inactive-only (Reactivate / Delete).
  const leftFn = row.slice(row.indexOf("function renderLeftActions()"), row.indexOf("function renderRightActions()"));
  const rightFn = row.slice(row.indexOf("function renderRightActions()"), row.indexOf("const card ="));
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
