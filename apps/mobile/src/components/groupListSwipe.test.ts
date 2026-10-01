import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const groups = readFileSync(join(here, "../../app/(app)/(tabs)/groups.tsx"), "utf8");
const row = readFileSync(join(here, "GroupListRow.tsx"), "utf8");
const detail = readFileSync(join(here, "../../app/(app)/group/[id].tsx"), "utf8");
const rootLayout = readFileSync(join(here, "../../app/_layout.tsx"), "utf8");
const endpoints = readFileSync(join(here, "../../../../packages/api/src/endpoints.ts"), "utf8");

test("Active group row has no large Archive button; left swipe exposes Archive", () => {
  assert.doesNotMatch(groups, /Button label=\{t\("groups\.archive"\)\}/);
  assert.doesNotMatch(groups, /t\("groups\.archive"\)/);
  assert.match(groups, /archiveLabel=\{t\("groups\.swipeArchive"\)\}/);
  assert.match(row, /status === "active"/);
  assert.match(row, /archiveAction/);
  assert.match(row, /renderRightActions/);
  assert.match(row, /onPress=\{\(\) => runAction\(onArchive\)\}/);
});

test("Active Archive swipe uses existing groupArchive lifecycle path", () => {
  assert.match(groups, /onArchive: \(group: Group\) => confirmLifecycle\(group, "archive"\)/);
  assert.match(groups, /endpoints\.groupArchive\(group\.id\)/);
  assert.match(groups, /NativeAlert\.alert/);
  assert.match(groups, /groups\.archiveConfirm/);
});

test("Normal active row press opens group detail", () => {
  assert.match(groups, /onOpenDetail=\{\(\) => router\.push\(`\/\(app\)\/group\/\$\{group\.id\}`\)\}/);
  assert.match(row, /onPress=\{onOpenDetail\}/);
});

test("Archived row has no large Restore or Delete permanently buttons", () => {
  assert.doesNotMatch(groups, /Button label=\{t\("groups\.restore"\)\}/);
  assert.doesNotMatch(groups, /Button label=\{t\("groups\.delete"\)\}/);
  assert.doesNotMatch(groups, /styles\.cardActions/);
  assert.doesNotMatch(groups, /group-card-actions/);
});

test("Archived swipe exposes Restore on left and Delete permanently on right", () => {
  assert.match(row, /renderLeftActions=\{status === "archived" \? renderLeftActions : undefined\}/);
  assert.match(row, /onPress=\{\(\) => runAction\(onRestore\)\}/);
  assert.match(row, /onPress=\{\(\) => runAction\(onDelete\)\}/);
  assert.match(row, /restoreAction/);
  assert.match(row, /deleteAction/);
  assert.match(groups, /restoreLabel=\{t\("groups\.swipeRestore"\)\}/);
  assert.match(groups, /deleteLabel=\{t\("groups\.delete"\)\}/);
});

test("Restore and Delete use existing handlers; delete requires confirmation", () => {
  assert.match(groups, /onRestore: \(group: Group\) => void lifecycle\(group, "restore"\)/);
  assert.match(groups, /onDelete: \(group: Group\) => confirmLifecycle\(group, "permanently-delete"\)/);
  assert.match(groups, /endpoints\.groupRestore\(group\.id\)/);
  assert.match(groups, /endpoints\.groupPermanentDelete\(group\.id\)/);
  assert.match(groups, /groups\.deleteConfirm/);
  assert.match(endpoints, /groupPermanentDelete: \(groupId: number \| string\) => `\/groups\/\$\{groupId\}\/permanently-delete\/`/);
});

test("Swipe alone never deletes or archives", () => {
  assert.match(row, /Actions never auto-fire from swipe distance/);
  assert.doesNotMatch(row, /onSwipeableOpen=\{.*onDelete/);
  assert.doesNotMatch(row, /onSwipeableWillOpen=\{.*onDelete/);
  assert.doesNotMatch(row, /onSwipeableOpen=\{.*onArchive/);
  assert.match(row, /overshootLeft=\{false\}/);
  assert.match(row, /overshootRight=\{false\}/);
});

test("Normal archived row press still opens group detail", () => {
  assert.match(groups, /onOpenDetail=\{\(\) => router\.push\(`\/\(app\)\/group\/\$\{group\.id\}`\)\}/);
});

test("Standard and Structured Groups share the same list swipe UX and lifecycle endpoints", () => {
  assert.match(row, /Standard and Structured Groups share the same list swipe UX/);
  assert.match(groups, /Same swipe UX for Standard and Structured/);
  assert.match(groups, /endpoints\.groupArchive\(group\.id\)/);
  assert.match(groups, /endpoints\.groupRestore\(group\.id\)/);
  assert.match(groups, /endpoints\.groupPermanentDelete\(group\.id\)/);
  assert.doesNotMatch(groups, /group_type === "structured".*groupArchive/);
  assert.doesNotMatch(groups, /groupClassArchive/);
});

test("One-open-row behavior and accessibility actions are wired", () => {
  assert.match(row, /openRowRef\.current\.close\(\)/);
  assert.match(row, /onSwipeableWillOpen=\{registerOpen\}/);
  assert.match(row, /accessibilityActions/);
  assert.match(row, /onAccessibilityAction/);
  assert.match(row, /name: "archive"/);
  assert.match(row, /name: "restore"/);
  assert.match(row, /name: "delete"/);
  assert.match(rootLayout, /GestureHandlerRootView/);
});

test("Filters/search/sort and Group detail lifecycle controls unchanged", () => {
  assert.match(groups, /FilterTabs onChange=\{\(next\) => \{ setStatus\(next\); setSelectionOpen\(false\); \}\}/);
  assert.match(groups, /groups\.searchPlaceholder/);
  assert.match(groups, /filterAndSortGroups\(rows, \{ type, sort \}\)/);
  assert.match(groups, /ChipRow label=\{t\("groups\.filterType"\)\}/);
  assert.match(groups, /ChipRow label=\{t\("groups\.filterSort"\)\}/);
  assert.match(detail, /endpoints\.groupArchive\(groupId\)/);
  assert.match(detail, /endpoints\.groupRestore\(groupId\)/);
  assert.match(detail, /groups\.dangerZone/);
  assert.match(detail, /t\("groups\.archive"\)/);
  assert.match(detail, /t\("groups\.restore"\)/);
  assert.doesNotMatch(detail, /GroupListRow/);
  assert.doesNotMatch(detail, /Swipeable/);
});

test("browser/desktop/backend untouched by Groups list swipe change", () => {
  assert.match(groups, /GroupListRow/);
  assert.doesNotMatch(groups, /apps\/desktop/);
  assert.doesNotMatch(row, /apps\/desktop/);
  assert.doesNotMatch(groups, /frontend\//);
  assert.doesNotMatch(row, /backend\//);
});
