import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const people = readFileSync(join(here, "../../app/(app)/(tabs)/people.tsx"), "utf8");
const row = readFileSync(join(here, "MemberListRow.tsx"), "utf8");
const detail = readFileSync(join(here, "../../app/(app)/member/[id].tsx"), "utf8");
const rootLayout = readFileSync(join(here, "../../app/_layout.tsx"), "utf8");

test("Active row no longer renders large Archive Member button; exposes Archive swipe", () => {
  assert.doesNotMatch(people, /Button label=\{t\("members\.archive"\)\}/);
  assert.match(people, /archiveLabel=\{t\("members\.swipeArchive"\)\}/);
  assert.match(row, /status === "active"/);
  assert.match(row, /archiveAction/);
  assert.match(row, /renderRightActions/);
  assert.match(row, /onPress=\{\(\) => runAction\(onArchive\)\}/);
});

test("Active Archive swipe uses existing archive confirmation handler path", () => {
  assert.match(people, /onArchive: \(member: Member\) => confirmLifecycle\(member, "archive"\)/);
  assert.match(people, /confirmLifecycle\(member, "archive"\)/);
  assert.match(people, /NativeAlert\.alert/);
  assert.match(people, /endpoints\.member\(member\.id\) \+ action \+ "\/"/);
});

test("Normal active row press still opens member detail", () => {
  assert.match(people, /onOpenDetail=\{\(\) => router\.push\(`\/\(app\)\/member\/\$\{member\.id\}`\)\}/);
  assert.match(row, /onPress=\{onOpenDetail\}/);
});

test("Archived row no longer renders large Restore/Delete buttons", () => {
  assert.doesNotMatch(people, /Button label=\{t\("members\.restore"\)\}/);
  assert.doesNotMatch(people, /Button label=\{t\("members\.delete"\)\}/);
  assert.doesNotMatch(people, /styles\.rowActions/);
});

test("Archived swipe exposes Restore on left and Delete permanently on right", () => {
  assert.match(row, /renderLeftActions=\{status === "archived" \? renderLeftActions : undefined\}/);
  assert.match(row, /onPress=\{\(\) => runAction\(onRestore\)\}/);
  assert.match(row, /onPress=\{\(\) => runAction\(onDelete\)\}/);
  assert.match(row, /restoreAction/);
  assert.match(row, /deleteAction/);
  assert.match(people, /restoreLabel=\{t\("members\.swipeRestore"\)\}/);
  assert.match(people, /deleteLabel=\{t\("members\.delete"\)\}/);
});

test("Restore and Delete still use existing handlers; delete requires confirmation", () => {
  assert.match(people, /onRestore: \(member: Member\) => void lifecycle\(member, "restore"\)/);
  assert.match(people, /onDelete: \(member: Member\) => confirmLifecycle\(member, "permanently-delete"\)/);
  assert.match(people, /confirmLifecycle\(member, "permanently-delete"\)/);
  assert.match(people, /members\.deleteConfirm/);
});

test("Delete does not execute merely because user swiped", () => {
  assert.match(row, /Actions never auto-fire from swipe distance/);
  assert.doesNotMatch(row, /onSwipeableOpen=\{.*onDelete/);
  assert.doesNotMatch(row, /onSwipeableWillOpen=\{.*onDelete/);
  assert.doesNotMatch(row, /onSwipeableOpen=\{.*onArchive/);
  assert.match(row, /overshootLeft=\{false\}/);
  assert.match(row, /overshootRight=\{false\}/);
});

test("Normal archived row press still opens member detail", () => {
  assert.match(people, /onOpenDetail=\{\(\) => router\.push\(`\/\(app\)\/member\/\$\{member\.id\}`\)\}/);
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
  assert.match(rootLayout, /import "react-native-gesture-handler"/);
});

test("Member detail actions unchanged; APIs unchanged", () => {
  assert.match(detail, /t\("members\.restore"\)/);
  assert.match(detail, /t\("members\.delete"\)/);
  assert.match(detail, /t\("members\.archive"\)/);
  assert.match(detail, /confirm\("archive"\)/);
  assert.match(detail, /confirm\("permanently-delete"\)/);
  assert.match(detail, /mutate\("restore"\)/);
  assert.match(people, /api\.post\(endpoints\.member\(member\.id\) \+ action \+ "\/"/);
});

test("browser/desktop untouched by this Members swipe change", () => {
  assert.match(people, /MemberListRow/);
  assert.doesNotMatch(people, /apps\/desktop/);
  assert.doesNotMatch(row, /apps\/desktop/);
});
