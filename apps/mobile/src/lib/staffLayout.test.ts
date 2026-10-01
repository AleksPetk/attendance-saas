import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../app/(app)/staff.tsx", import.meta.url), "utf8");
const row = readFileSync(new URL("../components/StaffListRow.tsx", import.meta.url), "utf8");

test("Staff sections preserve role/status order, show counts, and hide empty sections", () => {
  const keys = ["staff.activeAdmins", "staff.activeStaff", "staff.inactiveAdmins", "staff.inactiveStaff"];
  const positions = keys.map((key) => source.indexOf(`t("${key}")`));
  assert.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])));
  assert.match(source, /row\.status === section\.status && row\.role === section\.role/);
  assert.match(source, /sections\.filter\(\(section\) => section\.rows\.length > 0\)/);
  assert.match(source, /section\.title\} \(\{section\.rows\.length\}\)/);
});

test("compact Staff swipe actions preserve every existing handler path", () => {
  for (const mode of ["edit", "access", "password"]) assert.ok(source.includes(`setEditor({ mode: "${mode}", staff })`));
  assert.match(source, /onDeactivate=\{\(\) => confirm\(staff\)\}/);
  assert.match(source, /onReactivate=\{\(\) => confirm\(staff\)\}/);
  assert.match(source, /onDelete=\{\(\) => confirm\(staff, true\)\}/);
  assert.match(source, /if \(!allowed\) return <Redirect/);
  assert.match(row, /staff\.is_plan_locked/);
  assert.doesNotMatch(source, /AccountAction/);
});

test("Staff has bounded tablet cards and compact group-access summary without large action buttons", () => {
  assert.match(source, /wide = width >= 700/);
  assert.match(source, /accountHalf: \{ width: "48%" \}/);
  assert.match(row, /staff\.group_access\.slice\(0, 2\)/);
  assert.match(source, /moreGroupsLabel=\{\(count\) => t\("staff\.moreGroups", \{ count \}\)\}/);
  assert.doesNotMatch(source, /actionButton:/);
  assert.doesNotMatch(source, /minHeight: 44, maxWidth: "100%", flexShrink: 1/);
});
