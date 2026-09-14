import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../app/(app)/staff.tsx", import.meta.url), "utf8");

test("Staff sections preserve role/status order, show counts, and hide empty sections", () => {
  const keys = ["staff.activeAdmins", "staff.activeStaff", "staff.inactiveAdmins", "staff.inactiveStaff"];
  const positions = keys.map((key) => source.indexOf(`t("${key}")`));
  assert.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])));
  assert.match(source, /row\.status === section\.status && row\.role === section\.role/);
  assert.match(source, /sections\.filter\(\(section\) => section\.rows\.length > 0\)/);
  assert.match(source, /section\.title\} \(\{section\.rows\.length\}\)/);
});

test("compact Staff actions preserve every existing handler and disabled state", () => {
  for (const mode of ["edit", "access", "password"]) assert.ok(source.includes(`setEditor({ mode: "${mode}", staff })`));
  assert.match(source, /onPress=\{\(\) => confirm\(staff\)\}/);
  assert.match(source, /onPress=\{\(\) => confirm\(staff, true\)\}/);
  assert.match(source, /staff\.status === "inactive" \? <AccountAction/);
  assert.match(source, /accessibilityState=\{\{ disabled \}\} disabled=\{disabled\}/);
  assert.match(source, /if \(!allowed\) return <Redirect/);
  assert.match(source, /staff\.is_plan_locked \? <StatusPill/);
});

test("Staff has bounded tablet cards and wrapping phone actions with usable targets", () => {
  assert.match(source, /wide = width >= 700/);
  assert.match(source, /accountHalf: \{ width: "48%" \}/);
  assert.match(source, /actions: \{ flexDirection: "row", flexWrap: "wrap"/);
  assert.match(source, /actionButton: \{ minHeight: 44, maxWidth: "100%", flexShrink: 1/);
  assert.match(source, /staff\.group_access\.slice\(0, 2\)/);
  assert.match(source, /t\("staff.moreGroups", \{ count: staff\.group_access\.length - 2 \}\)/);
});
